const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {pool,session}=require('../db/helpers.cjs');
test.after(async()=>pool.end());
const args=(owner,id,extra={})=>({p_owner:owner,p_instancia:'INSTANCE_SYNTHETIC',p_id:id,p_phone:'5562999990001',
  p_lid:'123456789@lid',p_nome:'Ana Exemplo',p_tipo:'texto',p_texto:'Olá',p_nome_arquivo:null,
  p_ocorrido:'2026-10-13T09:00:00Z',p_arquivo:null,...extra});
const sql='select public.atendimento_receber_privado($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result';
const call=async a=>(await pool.query(sql,Object.values(a))).rows[0].result;
test('RPC atômica, idempotência, ordem temporal, LID e proprietário isolado',async()=>{
  const owner=randomUUID(),other=randomUUID();await pool.query('insert into auth.users(id) values($1),($2)',[owner,other]);
  const one=args(owner,'in-1');assert.equal((await call(one)).duplicate,false);
  assert.equal((await call(one)).duplicate,true);
  const two=args(owner,'in-2',{p_ocorrido:'2026-10-13T08:00:00Z'});await call(two);
  const rows=(await pool.query('select provedor_id from public.atendimento_recepcao_mensagens where user_id=$1 order by ocorrido_em',[owner])).rows;
  assert.deepEqual(rows.map(x=>x.provedor_id),['in-2','in-1']);
  assert.equal((await pool.query('select count(*) n from public.atendimento_recepcao_conversas where user_id=$1',[owner])).rows[0].n,'1');
  await assert.rejects(call(args(owner,'in-1',{p_texto:'Outra'})),{code:'23505'});
  await assert.rejects(call(args(owner,'in-3',{p_phone:'5561999990002'})),{code:'23505'});
  assert.equal((await call(args(other,'in-1'))).duplicate,false);
  for(const table of ['conversas','identidades','mensagens','arquivos','eventos']){
    const name='atendimento_recepcao_'+table;
    assert.equal((await session('authenticated',other,c=>c.query(`select count(*) n from public.${name}`))).rows[0].n,table==='arquivos'?'0':table==='conversas'?'1':table==='identidades'?'2':table==='mensagens'?'1':'1');
    await assert.rejects(session('authenticated',owner,c=>c.query(`insert into public.${name} default values`)),{code:'42501'});
  }
  assert.equal((await pool.query('select count(*) n from public.atendimento_outbox where user_id=$1',[owner])).rows[0].n,'0');
});
test('PDF exige manifesto privado e falha deixa banco sem mensagem; duplicata não duplica metadados',async()=>{
  const owner=randomUUID();await pool.query('insert into auth.users(id) values($1)',[owner]);
  const fid=randomUUID(),path=`${owner}/recebidos/${fid}.pdf`;
  const a=args(owner,'pdf-1',{p_tipo:'pdf',p_texto:'[PDF recebido]',p_nome_arquivo:'teste.pdf',p_arquivo:{id:fid,path,sha256:'a'.repeat(64),size:12}});
  await assert.rejects(call({...a,p_arquivo:{...a.p_arquivo,path:'wrong'}}),{code:'22023'});
  assert.equal((await pool.query('select count(*) n from public.atendimento_recepcao_mensagens where user_id=$1',[owner])).rows[0].n,'0');
  assert.equal((await call(a)).duplicate,false);
  assert.equal((await call({...a,p_arquivo:null})).duplicate,true);
  assert.equal((await pool.query('select count(*) n from public.atendimento_recepcao_arquivos where user_id=$1',[owner])).rows[0].n,'1');
});

test('gestão manual mantém RLS por dono e exige conversa existente',async()=>{
  const owner=randomUUID(),other=randomUUID();await pool.query('insert into auth.users(id) values($1),($2)',[owner,other]);
  const saved=await call(args(owner,'crm-1'));const cid=saved.chatId;
  const insert='insert into public.atendimento_recepcao_gestao(user_id,instancia,conversa_id,etapa,etiquetas,origem,anotacao,proxima_acao) values($1,$2,$3,$4,$5,$6,$7,$8)';
  const values=[owner,'INSTANCE_SYNTHETIC',cid,'cotacao',['Indicação'],'Indicação confirmada manualmente','Ligar à tarde','Ligar'];
  await session('authenticated',owner,c=>c.query(insert,values));
  const mine=await session('authenticated',owner,c=>c.query('select etapa,origem,etiquetas from public.atendimento_recepcao_gestao'));
  assert.equal(mine.rows[0].etapa,'cotacao');assert.deepEqual(mine.rows[0].etiquetas,['Indicação']);
  assert.equal((await session('authenticated',other,c=>c.query('select count(*) n from public.atendimento_recepcao_gestao'))).rows[0].n,'0');
  await assert.rejects(session('authenticated',other,c=>c.query(insert,values)),{code:'42501'});
  await assert.rejects(session('anon',null,c=>c.query('select * from public.atendimento_recepcao_gestao')),{code:'42501'});
  await assert.rejects(session('authenticated',owner,c=>c.query(insert,[owner,'INSTANCE_SYNTHETIC',randomUUID(),'novo',[],'','',''])),{code:'23503'});
  assert.equal((await session('authenticated',owner,c=>c.query("update public.atendimento_recepcao_gestao set etapa='emissao' where conversa_id=$1 returning etapa",[cid]))).rows[0].etapa,'emissao');
});
