const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises');
const {randomUUID}=require('node:crypto'),{Pool}=require('pg');
const {pool,session}=require('../db/helpers.cjs');
const ready=Promise.all([import('../../supabase/functions/_shared/atendimento/repository.mjs'),import('../../supabase/functions/_shared/atendimento/local-object-store.mjs'),import('../../supabase/functions/_shared/atendimento/backup.mjs'),import('../../supabase/functions/_shared/atendimento/durable-handler.mjs'),import('../../supabase/functions/_shared/atendimento/durable-fanout.mjs'),import('../../js/atendimento-demo.mjs')]);
const restoreUrl=new URL(process.env.VCK_TEST_RESTORE_URL||'http://invalid');
if(restoreUrl.protocol!=='postgresql:'||restoreUrl.hostname!=='127.0.0.1'||restoreUrl.pathname!=='/vck_atendimento_restore_test'||!restoreUrl.port||!path.isAbsolute(process.env.VCK_TEST_OBJECTS_DIR||''))throw new Error('Use somente runner local descartável.');
const restoredPool=new Pool({connectionString:restoreUrl.href});
test.after(async()=>{await pool.end();await restoredPool.end();});
const base={type:'message',instance:'mock',messageId:'in1',phone:'+5562999990001',lid:'1234567@lid',fromMe:false,text:'Olá, proposta fictícia',at:'2026-10-13T09:00:00Z',status:'entregue'};
async function fixture(){
    const [d,objects,b,h,f,demo]=await ready,owner=randomUUID(),other=randomUUID();
    await pool.query('insert into auth.users(id) values($1),($2)',[owner,other]);
    await pool.query('insert into public.dados_app(user_id,conteudo) values($1,$2)',[owner,demo.DEMO_SOURCE]);
    const store=objects.createLocalObjectStore(path.join(process.env.VCK_TEST_OBJECTS_DIR,owner)),repo=d.createPgRepository({pool,owner,objectStore:store});
    const queued=await repo.enqueue(owner,base);await repo.processNext(owner);const cid=(await repo.list(owner))[0].id;
    return{d,objects,b,h,f,demo,owner,other,store,repo,cid,queued};
}
async function target(f){await restoredPool.query('insert into auth.users(id) values($1)',[f.owner]);return f.d.createPgRepository({pool:restoredPool,owner:f.owner,objectStore:f.objects.createLocalObjectStore(path.join(process.env.VCK_TEST_OBJECTS_DIR,'restored',f.owner))});}

test('ingresso commitado antes do consumo; concorrência e reabertura de repositório não duplicam',async()=>{
    const f=await fixture();assert.equal((await f.repo.enqueue(f.owner,base)).duplicate,true);
    await assert.rejects(f.repo.enqueue(f.owner,{...base,text:'colisão'}),{status:409});
    const next={...base,messageId:'in2'};await f.repo.enqueue(f.owner,next);
    const r=await Promise.all([f.repo.processNext(f.owner),f.repo.processNext(f.owner)]);assert.equal(r.filter(Boolean).length,1);
    const reopened=f.d.createPgRepository({pool,owner:f.owner,objectStore:f.store});assert.equal((await reopened.messages(f.owner,f.cid)).length,2);
    assert.equal((await pool.query('select count(*) n from public.atendimento_ingressos where user_id=$1',[f.owner])).rows[0].n,'2');
});
test('status fora de ordem, leitura tardia e LID/telefone com conflito transacional',async()=>{
    const f=await fixture();await f.repo.read(f.owner,f.cid);
    await f.repo.enqueue(f.owner,{...base,messageId:'late',at:'2026-10-13T07:00:00Z'});await f.repo.processNext(f.owner);assert.equal((await f.repo.list(f.owner))[0].unread,1);
    await f.repo.enqueue(f.owner,{...base,type:'status',messageId:'own1',status:'lida'});await f.repo.processNext(f.owner);
    await f.repo.enqueue(f.owner,{...base,fromMe:true,messageId:'own1',status:'aceita'});await f.repo.processNext(f.owner);
    await f.repo.enqueue(f.owner,{...base,type:'status',messageId:'own1',status:'entregue'});await f.repo.processNext(f.owner);
    assert.equal((await f.repo.messages(f.owner,f.cid)).find(m=>m.providerId==='own1').status,'lida');
    await f.repo.enqueue(f.owner,{...base,messageId:'conflict',phone:'+5561999990002'});
    assert.equal((await f.repo.processNext(f.owner)).state,'revisao');assert.equal((await f.repo.list(f.owner)).length,1);
    assert.equal((await pool.query('select count(*) n from public.atendimento_outbox where user_id=$1',[f.owner])).rows[0].n,'0');
});
test('composição idempotente e fila em concorrência: uma chamada; callback próprio sem loop',async()=>{
    const f=await fixture();const params={text:'Resposta',requestId:'reply1'};
    const [a,b]=await Promise.all([f.repo.compose(f.owner,f.cid,params),f.repo.compose(f.owner,f.cid,params)]);assert.equal(a.id,b.id);
    await assert.rejects(f.repo.compose(f.owner,f.cid,{...params,text:'Outro'}),{status:409});
    let calls=0;const transport={mode:'sintetico',send:async()=>{calls++;return{providerId:'provider1'};}};
    const r=await Promise.all([f.repo.dispatchNext(f.owner,transport),f.repo.dispatchNext(f.owner,transport)]);assert.equal(r.filter(Boolean).length,1);assert.equal(calls,1);
    await f.repo.enqueue(f.owner,{...base,fromMe:true,messageId:'provider1',text:'Resposta',status:'aceita'});await f.repo.processNext(f.owner);
    assert.equal((await f.repo.messages(f.owner,f.cid)).length,2);assert.equal(await f.repo.dispatchNext(f.owner,transport),null);
});
test('eco que chega antes do resultado é reconciliado por ID; eventos originais ficam imutáveis',async()=>{
    const f=await fixture();const m=await f.repo.compose(f.owner,f.cid,{text:'Resposta',requestId:'echo-before'}),job=await f.repo.claim(f.owner);
    await f.repo.enqueue(f.owner,{...base,fromMe:true,messageId:'echo-id',text:'Resposta',status:'lida'});await f.repo.processNext(f.owner);
    assert.equal((await f.repo.messages(f.owner,f.cid)).length,3);await f.repo.finish(f.owner,job,{providerId:'echo-id'});
    const ms=await f.repo.messages(f.owner,f.cid);assert.equal(ms.length,2);assert.equal(ms.find(x=>x.id===m.id).status,'lida');
    assert.equal((await pool.query("select count(*) n from public.atendimento_eventos where user_id=$1 and tipo='echo'",[f.owner])).rows[0].n,'1');
});
test('falha segura tem backoff/limite; timeout, reinício de worker e token velho não repetem',async()=>{
    const f=await fixture();await f.repo.compose(f.owner,f.cid,{text:'Retry',requestId:'retry1'});
    const failure={mode:'sintetico',send:()=>({definitelyNotSent:true})};
    for(let i=0;i<3;i++){
        assert.equal((await f.repo.dispatchNext(f.owner,failure)).result,'falha_segura');assert.equal(await f.repo.dispatchNext(f.owner,failure),null);
        await pool.query("update public.atendimento_outbox set disponivel_em=clock_timestamp()-interval '1 second' where user_id=$1",[f.owner]);
    }assert.equal(await f.repo.dispatchNext(f.owner,failure),null);
    await f.repo.compose(f.owner,f.cid,{text:'Incerto',requestId:'uncertain'});const job=await f.repo.claim(f.owner);
    assert.equal((await f.repo.recoverUncertain(f.owner,0)).uncertain,1);assert.equal((await f.repo.finish(f.owner,job,{providerId:'late-ack'})).ok,false);
    assert.equal(await f.repo.dispatchNext(f.owner,{mode:'sintetico',send(){throw new Error('não deve enviar');}}),null);
    await assert.rejects(f.repo.dispatchNext(f.owner,{mode:'real',send(){}}),{status:403});
});
test('arquivo durável e idempotente: falha antes do objeto conserva pendência para retry',async()=>{
    const f=await fixture();let failOnce=true;const failingStore={...f.store,async put(...args){if(failOnce){failOnce=false;throw new Error('falha sintética de disco');}return f.store.put(...args);}};
    const repo=f.d.createPgRepository({pool,owner:f.owner,objectStore:failingStore});
    const params={name:'proposta.pdf',bytes:f.demo.demoPdf(),requestId:'pdf1'};
    await assert.rejects(repo.archive(f.owner,f.cid,params));const pending=(await pool.query('select * from public.atendimento_anexos where user_id=$1',[f.owner])).rows[0];assert.equal(pending.estado_arquivo,'pendente');
    await assert.rejects(repo.compose(f.owner,f.cid,{attachmentId:pending.id,requestId:'no-file'}));
    const file=await repo.archive(f.owner,f.cid,params);assert.equal(file.id,pending.id);assert.equal((await repo.archive(f.owner,f.cid,params)).id,file.id);
    const bytes=(await repo.file(f.owner,file.id)).bytes;assert.deepEqual(bytes,Array.from(f.demo.demoPdf()));
    await assert.rejects(repo.file(f.other,file.id),{status:403});
});
test('backup com bytes restaura em outro banco do mesmo dono; checksum/referências e destino ocupado bloqueiam',async()=>{
    const f=await fixture(),pdf=await f.repo.archive(f.owner,f.cid,{name:'proposta.pdf',bytes:f.demo.demoPdf(),requestId:'pdf1'});
    await f.repo.compose(f.owner,f.cid,{attachmentId:pdf.id,text:'Proposta',requestId:'pending-send'});
    const backup=f.b.createDurableBackup(f.repo),pack=await backup.exportPackage(f.owner),dest=await target(f),restorer=f.b.createDurableBackup(dest);
    const corrupted=structuredClone(pack);corrupted.files[0].base64=Buffer.from('%PDF-corrupt').toString('base64');await assert.rejects(restorer.restorePackage(f.owner,corrupted));assert.equal((await dest.list(f.owner)).length,0);
    assert.equal((await restorer.restorePackage(f.owner,pack)).files,1);assert.equal((await restorer.restorePackage(f.owner,pack)).reused,true);
    assert.equal((await dest.messages(f.owner,f.cid)).length,2);assert.deepEqual((await dest.file(f.owner,pdf.id)).bytes,Array.from(f.demo.demoPdf()));
    assert.equal(await dest.dispatchNext(f.owner,{mode:'sintetico',send(){throw new Error('backup não reenvia');}}),null);
    await assert.rejects(restorer.restorePackage(f.owner,{...pack,id:randomUUID()}),{status:409});await assert.rejects(restorer.restorePackage(f.other,pack),{status:403});
    const f2=await fixture(),missing={...pack,owner:f2.owner};await assert.rejects(f.b.createDurableBackup(f2.repo).restorePackage(f2.owner,missing));
    await fs.writeFile(path.join(process.env.VCK_TEST_OBJECTS_DIR,f.owner,pack.files[0].path),'%PDF-corrupted');await assert.rejects(backup.exportPackage(f.owner));
});
test('RLS real nas filas novas e fonte comercial só do dono; HTTP rejeita forja em todas as operações',async()=>{
    const f=await fixture();
    for(const table of ['atendimento_ingressos','atendimento_encaminhamentos']){
        await assert.rejects(session('anon',null,c=>c.query('select * from public.'+table)),{code:'42501'});
        assert.equal((await session('authenticated',f.other,c=>c.query('select * from public.'+table))).rowCount,0);
        assert.equal((await pool.query('select has_table_privilege($1,$2,$3) allowed',['authenticated','public.'+table,'INSERT'])).rows[0].allowed,false);
    }
    await f.repo.link(f.owner,f.cid,{clienteId:'p-ana',vendaId:'v-ana'});assert.equal((await f.repo.list(f.owner))[0].context.cliente.nome,'Ana Exemplo');
    const otherRepo=f.d.createPgRepository({pool,owner:f.other,objectStore:f.store});assert.equal((await otherRepo.list(f.other)).length,0);
    for(const call of [()=>otherRepo.messages(f.other,f.cid),()=>otherRepo.read(f.other,f.cid),()=>otherRepo.compose(f.other,f.cid,{text:'x',requestId:'r'})])await assert.rejects(call(),{status:404});
    const makeBody=body=>new Request('http://localhost/atendimento',{method:'POST',headers:{origin:'http://localhost',authorization:'Bearer fixture'},body:JSON.stringify(body)});
    let auth=true;const handler=f.h.createDurableHandler({enabled:true,allowedOrigin:'http://localhost',verifyUser:()=>auth?{id:f.owner}:null,repositoryFor:()=>f.repo,backupFor:f.b.createDurableBackup,transport:{mode:'sintetico',send:()=>({providerId:'mock-http'})}});
    for(const acao of ['listar','mensagens','lida','vincular','compor','anexar','arquivo','ingressar_sintetico','processar_sintetico','simular_envio','exportar','restaurar']){
        assert.equal((await handler(makeBody({acao,owner:f.other}))).status,422);auth=false;assert.equal((await handler(makeBody({acao}))).status,401);auth=true;
    }
    assert.equal((await handler(makeBody({acao:'listar'}))).status,200);assert.equal((await handler(makeBody({acao:'compor',chatId:f.cid,text:'HTTP',requestId:'http1'}))).status,200);
});
test('filas duráveis preservam legado e grupos; erro/receipt de cada consumidor é independente',async()=>{
    const f=await fixture(),privateConfig={instance:'mock',connectedPhone:'5562999990999'},fanout=f.f.createDurableFanout(f.repo,{privateEnabled:true,privateConfig}),group={instanceId:'mock',connectedPhone:privateConfig.connectedPhone,type:'ReceivedCallback',isGroup:true,phone:'synthetic@g.us',text:{message:'Grupo fictício'},messageId:'group1',fromMe:false,momment:Date.now(),status:'RECEIVED',unknownField:{keep:'intact'}};
    await fanout.enqueue(f.owner,{key:'group1',payload:group});await fanout.enqueue(f.owner,{key:'group1',payload:group});
    await assert.rejects(fanout.enqueue(f.owner,{key:'group1',payload:{...group,text:{message:'Mudança'}}}),{status:409});
    const privatePayload={...group,isGroup:false,phone:'5562999990001',messageId:'private1'};
    await fanout.enqueue(f.owner,{key:'private1',payload:privatePayload});
    const offPayload={...privatePayload,messageId:'private2'};
    await f.f.createDurableFanout(f.repo).enqueue(f.owner,{key:'default-off',payload:offPayload});
    const repeated=await fanout.enqueue(f.owner,{key:'default-off',payload:offPayload});assert.deepEqual(repeated.consumers,['legado']);assert.equal(repeated.duplicate,true);
    assert.equal((await pool.query('select count(*) n from public.atendimento_encaminhamentos where user_id=$1',[f.owner])).rows[0].n,'4');
    const deliveries=[];const r=await fanout.dispatch(f.owner,'legado',{mode:'sintetico',send:receipt=>{deliveries.push(receipt);return {durablyAccepted:true};}});assert.equal(r.result,'concluido');assert.deepEqual(deliveries[0].payload,group);
    assert.equal((await fanout.dispatch(f.owner,'atendimento',{mode:'sintetico',send(){throw new Error('timeout novo');}})).result,'incerto');
    assert.equal(await fanout.dispatch(f.owner,'atendimento',{mode:'sintetico',send(){throw new Error('não deve repetir');}}),null);
    assert.equal((await fanout.dispatch(f.owner,'legado',{mode:'sintetico',send:()=>({durablyAccepted:true})})).result,'concluido');
    assert.equal((await fanout.dispatch(f.owner,'legado',{mode:'sintetico',send:()=>({durablyAccepted:true})})).result,'concluido');
});
test('rejeição comprovada do legado aguarda retry; resultado incerto exige revisão e não repete',async()=>{
    const f=await fixture(),fanout=f.f.createDurableFanout(f.repo);
    await fanout.enqueue(f.owner,{key:'legacy-safe-fail',payload:{isGroup:true,phone:'synthetic@g.us',messageId:'safe-fail'}});
    let attempts=0;
    const refused={mode:'sintetico',send:()=>{attempts++;return {definitelyNotAccepted:true};}};
    assert.equal((await fanout.dispatch(f.owner,'legado',refused)).result,'pendente');
    assert.equal(await fanout.dispatch(f.owner,'legado',refused),null);assert.equal(attempts,1);
    const row=(await pool.query("select id,estado,disponivel_em>clock_timestamp() as waiting from public.atendimento_encaminhamentos where user_id=$1 and dedupe='legacy-safe-fail'",[f.owner])).rows[0];
    assert.equal(row.estado,'pendente');assert.equal(row.waiting,true);
    await pool.query("update public.atendimento_encaminhamentos set disponivel_em=clock_timestamp()-interval '1 second' where id=$1",[row.id]);
    assert.equal((await fanout.dispatch(f.owner,'legado',{mode:'sintetico',send:()=>{attempts++;return {durablyAccepted:true};}})).result,'concluido');assert.equal(attempts,2);
    await fanout.enqueue(f.owner,{key:'legacy-uncertain',payload:{isGroup:true,phone:'synthetic@g.us',messageId:'uncertain'}});
    assert.equal((await fanout.dispatch(f.owner,'legado',{mode:'sintetico',send:()=>{throw Error('timeout');}})).result,'incerto');
    assert.equal(await fanout.dispatch(f.owner,'legado',refused),null);assert.equal(attempts,2);
});
