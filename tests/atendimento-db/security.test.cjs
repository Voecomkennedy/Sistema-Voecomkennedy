const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {pool,session}=require('../db/helpers.cjs');
test.after(()=>pool.end());
async function fixture(){
    const owner=randomUUID(),other=randomUUID(),cid=randomUUID(),mid=randomUUID(),job=randomUUID();
    await pool.query('insert into auth.users(id) values($1),($2)',[owner,other]);
    await session('service_role',null,async c=>{
        await c.query("insert into public.atendimento_conversas(id,user_id,instancia) values($1,$2,'mock')",[cid,owner]);
        await c.query("insert into public.atendimento_mensagens(id,user_id,conversa_id,instancia,direcao,texto,ocorrido_em,requisicao_id) values($1,$2,$3,'mock','saida','Olá',now(),'req1')",[mid,owner,cid]);
        await c.query('insert into public.atendimento_outbox(id,user_id,mensagem_id) values($1,$2,$3)',[job,owner,mid]);
    });return{owner,other,cid,mid,job};
}
const reserve=f=>session('service_role',null,async c=>(await c.query('select public.atendimento_reservar_simulacao($1,$2) job',[f.owner,f.job])).rows[0].job);
const result=(f,job,outcome)=>session('service_role',null,async c=>(await c.query('select public.atendimento_resultado_simulacao($1,$2,$3,$4) ok',[f.owner,f.job,job.token,outcome])).rows[0].ok);

test('RLS real: seis tabelas com proprietário; anon sem acesso e browser sem escrita/RPC',async()=>{
    const f=await fixture();
    for(const t of ['conversas','identidades','mensagens','eventos','anexos','outbox']) {
        const table='public.atendimento_'+t;
        await assert.rejects(session('anon',null,c=>c.query('select * from '+table)),{code:'42501'});
        const other=await session('authenticated',f.other,c=>c.query('select * from '+table));assert.equal(other.rowCount,0);
        const flags=await pool.query("select relrowsecurity from pg_class where oid=$1::regclass",[table]);assert.equal(flags.rows[0].relrowsecurity,true);
    }
    assert.equal((await session('authenticated',f.owner,c=>c.query('select * from public.atendimento_mensagens'))).rowCount,1);
    await assert.rejects(session('authenticated',f.owner,c=>c.query("update public.atendimento_conversas set user_id=$1 where id=$2",[f.other,f.cid])),{code:'42501'});
    await assert.rejects(session('authenticated',f.owner,c=>c.query('select public.atendimento_reservar_simulacao($1,$2)',[f.owner,f.job])),{code:'42501'});
    for(const t of ['conversas','identidades','mensagens','eventos','anexos','outbox']){
        for(const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE']) assert.equal((await pool.query('select has_table_privilege($1,$2,$3) allowed',['authenticated','public.atendimento_'+t,privilege])).rows[0].allowed,false);
    }
});
test('FK composta rejeita associação a conversa de outra conta e instância diferente',async()=>{
    const f=await fixture();
    await assert.rejects(session('service_role',null,c=>c.query("insert into public.atendimento_identidades(user_id,conversa_id,instancia,tipo,valor,evidencia_evento) values($1,$2,'mock','telefone','5562999990001','fixture')",[f.other,f.cid])),{code:'23503'});
    await assert.rejects(session('service_role',null,c=>c.query("insert into public.atendimento_identidades(user_id,conversa_id,instancia,tipo,valor,evidencia_evento) values($1,$2,'foreign','telefone','5562999990001','fixture')",[f.owner,f.cid])),{code:'23503'});
});
test('unicidade de provedor, eventos e identidades resiste a inserções simultâneas',async()=>{
    const f=await fixture();
    const insert=()=>session('service_role',null,c=>c.query("insert into public.atendimento_eventos(user_id,instancia,dedupe,tipo,ocorrido_em) values($1,'mock','same','status',now())",[f.owner]));
    const rows=await Promise.allSettled([insert(),insert()]);assert.equal(rows.filter(r=>r.status==='fulfilled').length,1);assert.equal(rows.find(r=>r.status==='rejected').reason.code,'23505');
    await pool.query("update public.atendimento_mensagens set provedor_id='provider1' where id=$1",[f.mid]);
    await assert.rejects(session('service_role',null,c=>c.query("insert into public.atendimento_mensagens(user_id,conversa_id,instancia,provedor_id,direcao,ocorrido_em) values($1,$2,'mock','provider1','saida',now())",[f.owner,f.cid])),{code:'23505'});
});
test('reserva transacional única, tentativa registrada e resultado incerto bloqueia retry',async()=>{
    const f=await fixture(), jobs=await Promise.all([reserve(f),reserve(f)]);
    assert.equal(jobs.filter(Boolean).length,1); const job=jobs.find(Boolean);
    assert.equal(job.estado,'tentativa'); assert.equal(job.tentativas,1);
    assert.equal((await pool.query("select * from public.atendimento_eventos where user_id=$1 and tipo='tentativa'",[f.owner])).rowCount,1);
    assert.equal(await result(f,{token:randomUUID()},'simulada'),false);
    assert.equal(await result(f,job,'incerto'),true);assert.equal(await reserve(f),null);
    assert.equal(await result(f,job,'simulada'),false);
    await assert.rejects(session('service_role',null,c=>c.query("update public.atendimento_eventos set tipo='x' where user_id=$1",[f.owner])),{code:'42501'});
});
test('falha segura permite retry limitado e proprietário errado não reserva tarefa',async()=>{
    const f=await fixture();assert.equal(await reserve({...f,owner:f.other}),null);
    for(let i=0;i<3;i++){const job=await reserve(f);assert.equal(job.tentativas,i+1);assert.equal(await result(f,job,'falha_segura'),true);}
    assert.equal(await reserve(f),null);
});
test('bucket privado e RLS real de arquivos por proprietário; browser não faz upload',async()=>{
    const f=await fixture(),fid=randomUUID(),name=`${f.owner}/${f.cid}/${fid}.pdf`;
    const bucket=(await pool.query("select * from storage.buckets where id='atendimento-arquivos'")).rows[0];assert.equal(bucket.public,false);assert.equal(Number(bucket.file_size_limit),5242880);
    await session('service_role',null,c=>c.query("insert into storage.objects(bucket_id,name) values('atendimento-arquivos',$1)",[name]));
    assert.equal((await session('authenticated',f.owner,c=>c.query('select * from storage.objects'))).rowCount,1);
    assert.equal((await session('authenticated',f.other,c=>c.query('select * from storage.objects'))).rowCount,0);
    await assert.rejects(session('authenticated',f.owner,c=>c.query("insert into storage.objects(bucket_id,name) values('atendimento-arquivos',$1)",[name])),{code:'42501'});
    await assert.rejects(session('service_role',null,c=>c.query("insert into public.atendimento_anexos(id,user_id,conversa_id,nome,mime,tamanho,sha256,caminho) values($1,$2,$3,'ex.pdf','application/pdf',10,$4,$5)",[fid,f.owner,f.cid,'a'.repeat(64),`${f.other}/${f.cid}/${fid}.pdf`])),{code:'23514'});
});
test('migration não altera fonte comercial ou objetos da Central',async()=>{
    const before=(await pool.query("select count(*) n from public.dados_app")).rows[0].n;
    const f=await fixture(); const job=await reserve(f);await result(f,job,'simulada');
    assert.equal((await pool.query('select count(*) n from public.dados_app')).rows[0].n,before);
    assert.equal((await pool.query("select count(*) n from public.mensagens_historico")).rows[0].n,'0');
});
