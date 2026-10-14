const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {withDatabase}=require('../tests/helpers/integrity-db.cjs');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
const clone=v=>JSON.parse(JSON.stringify(v));
const initial=()=>({emissao_pessoas:[{id:'p',nome:'Sintético'}],emissao_vendas:[],emissao_pacotes:[],emissao_cotacoes:[{id:'q1',clienteId:'p',status:'aberta',observacao:'Inicial'},{id:'q2',clienteId:'p',status:'aberta'}],extra:{nulo:null},removerDepois:'preservado no baseline'});
let passed=0;
const test=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
(async()=>withDatabase(async({admin,connect,applyCompact})=>{
 await admin.query('insert into auth.users(id) values($1),($2),($3)',[A,B,C]);
 const a=await connect('authenticated',A),b=await connect('authenticated',B),service=await connect('service_role');
 await admin.query('grant select,update(versao) on public.dados_app to service_role');
 let body=initial();await a.query('insert into dados_app(user_id,conteudo,versao) values($1,$2,1)',[A,body]);
 const legacy=(await a.query('select * from dados_app_historico')).rows[0];
 body.emissao_cotacoes[0].observacao='Legado atualizado';await a.query('update dados_app set conteudo=$1,versao=2 where user_id=$2',[body,A]);
 const legacyRows=(await a.query('select * from dados_app_historico order by versao_depois')).rows;
 applyCompact();const oracle=[];
 async function update(next,{actor=a,versionOnly=false,versionStep=1,operation=crypto.randomUUID()}={}){
  const before=(await admin.query('select conteudo,versao from dados_app where user_id=$1',[A])).rows[0];
  const version=Number(before.versao)+versionStep;
  if(versionOnly)await actor.query('update dados_app set versao=$1 where user_id=$2 and versao=$3',[version,A,before.versao]);
  else await actor.query('update dados_app set conteudo=$1,versao=$2,ultima_operacao_id=$3 where user_id=$4 and versao=$5',[JSON.stringify(next),version,operation,A,before.versao]);
  const op=(await admin.query('select * from integridade_privado.operacoes where user_id=$1 and versao_depois=$2',[A,version])).rows[0];
  const after=(await admin.query('select conteudo from dados_app where user_id=$1',[A])).rows[0].conteudo;
  oracle.push({op,before:before.conteudo,after});body=clone(after);return op;
 }
 const state=async(op,side,actor=a)=>(await actor.query('select public.integridade_obter_estado($1,$2,$3) as state',[A,op.operacao_id,side])).rows[0].state;
 await test('legacy rows remain byte-semantically intact and both sides accessible',async()=>{
  assert.deepEqual((await a.query('select * from dados_app_historico order by versao_depois')).rows,legacyRows);
  for(const op of legacyRows)assert.deepEqual(await state(op,'depois'),op.conteudo_depois);
  assert.deepEqual(await state(legacyRows[1],'antes'),initial());
 });
 await test('first compact removal preserves the previous legacy proposal exactly',async()=>{
  const next=clone(body);next.emissao_cotacoes.shift();const op=await update(next);
  assert.equal((await a.query('select count(*)::int as n from integridade_privado.baselines')).rows[0].n,1);
  assert.deepEqual(await state(op,'antes'),oracle.at(-1).before);assert.deepEqual(await state(op,'depois'),next);
  assert.equal((await a.query('select count(*)::int as n from dados_app_historico')).rows[0].n,2);
 });
 await test('added and changed records plus order are reconstructed without intact collections',async()=>{
  const next=clone(body);next.emissao_cotacoes.push({id:'q3',clienteId:'p',status:'aberta'});next.emissao_pessoas[0].nome='Revisão sintética';
  const op=await update(next);assert.equal(op.alteracoes.colecoes.emissao_pessoas.registros.length,1);
  assert.equal(op.alteracoes.colecoes.emissao_vendas,undefined);assert.deepEqual(await state(op,'depois'),next);
  const reordered=clone(body);reordered.emissao_cotacoes.reverse();const order=await update(reordered);
  assert.deepEqual(order.alteracoes.colecoes.emissao_cotacoes.ordem,['q3','q2']);assert.equal(order.alteracoes.colecoes.emissao_cotacoes.registros,undefined);
  assert.deepEqual(await state(order,'depois'),reordered);
 });
 await test('null, absent and additional root fields survive exact reconstruction',async()=>{
  const next=clone(body);delete next.removerDepois;next.extra={novo:null,flag:false};next.unknown=['a',null,0];const op=await update(next);
  assert.deepEqual(await state(op,'antes'),oracle.at(-1).before);assert.deepEqual(await state(op,'depois'),next);
 });
 await test('numeric and textual IDs are distinct; malformed legacy collections are exact replacements',async()=>{
  const next=clone(body);next.emissao_pacotes=[{id:42,label:'Número'},{id:'42',label:'Texto'}];await update(next);
  const changed=clone(body);changed.emissao_pacotes[1].label='Texto atualizado';const op=await update(changed);
  assert.deepEqual(op.alteracoes.colecoes.emissao_pacotes.registros,[changed.emissao_pacotes[1]]);assert.deepEqual(await state(op,'depois'),changed);
  const invalid=clone(body);invalid.emissao_pacotes=[{semId:true},{id:'repetido'},{id:'repetido',label:null}];const fallback=await update(invalid);
  assert.deepEqual(fallback.alteracoes.definir.emissao_pacotes,invalid.emissao_pacotes);assert.deepEqual(await state(fallback,'depois'),invalid);
 });
 await test('scalar, JSON null and repaired object roots keep their exact states',async()=>{
  for(const next of['valor sintético',null,{emissao_pessoas:[],emissao_vendas:[],emissao_pacotes:[],emissao_cotacoes:[],extra:0}]){
   const op=await update(next);assert.deepEqual(await state(op,'depois'),next);
  }
 });
 await test('version-only service writer stores empty changes and creates no extra baseline',async()=>{
  const n=(await a.query('select count(*)::int as n from integridade_privado.baselines')).rows[0].n;
  for(let i=0;i<10;i++){const op=await update(null,{actor:service,versionOnly:true});assert.deepEqual(op.alteracoes,{});assert.equal(op.hash_antes,op.hash_depois);assert.deepEqual(await state(op,'depois'),body);}
  assert.equal((await a.query('select count(*)::int as n from integridade_privado.baselines')).rows[0].n,n);
 });
 await test('CAS concurrent writers commit one operation and reject the stale update effect',async()=>{
  const other=await connect('authenticated',A),old=(await a.query('select versao from dados_app')).rows[0].versao;
  const before=clone(body),next={...before,concurrent:'winner'},version=Number(old)+1;
  const results=await Promise.all([a.query('update dados_app set conteudo=$1,versao=$2 where user_id=$3 and versao=$4 returning *',[next,version,A,old]),other.query('update dados_app set conteudo=$1,versao=$2 where user_id=$3 and versao=$4 returning *',[{...before,concurrent:'competitor'},version,A,old])]);
  assert.deepEqual(results.map(x=>x.rowCount).sort(),[0,1]);
  const op=(await a.query('select * from integridade_privado.operacoes where versao_depois=$1',[version])).rows[0];
  body=(await a.query('select conteudo from dados_app')).rows[0].conteudo;oracle.push({op,before,after:clone(body)});assert.deepEqual(await state(op,'depois'),body);
 });
 await test('version gaps are allowed; reused operation and non-advancing update roll back',async()=>{
  const op=await update({...body,gap:'valid'},{versionStep:3});assert.deepEqual(await state(op,'depois'),body);
  const before=(await a.query('select * from dados_app')).rows[0];
  await assert.rejects(a.query('update dados_app set conteudo=$1,versao=versao+1,ultima_operacao_id=$2',[{...body,reused:true},oracle[0].op.operacao_id]),e=>e.code==='23505');
  await assert.rejects(a.query('update dados_app set conteudo=$1',[{...body,nonAdvancing:true}]),e=>e.code==='PT409');
  assert.deepEqual((await a.query('select * from dados_app')).rows[0],before);
 });
 await test('known source SELECT FOR UPDATE does not create journal records',async()=>{
  const count=(await service.query('select count(*)::int as n from integridade_privado.operacoes')).rows[0].n;
  await service.query('begin');await service.query('select conteudo from dados_app where user_id=$1 for update',[A]);await service.query('commit');
  assert.equal((await service.query('select count(*)::int as n from integridade_privado.operacoes')).rows[0].n,count);
 });
 await test('direct insert is denied for authenticated and BYPASSRLS service roles',async()=>{
  const base=(await a.query('select * from integridade_privado.baselines limit 1')).rows[0],op=oracle.at(-1).op;
  for(const c of[a,service]){
   await assert.rejects(c.query('insert into integridade_privado.baselines(user_id,versao,conteudo,hash) values($1,999,$2,$3)',[A,base.conteudo,base.hash]),e=>e.code==='42501');
   await assert.rejects(c.query('insert into integridade_privado.operacoes(user_id,operacao_id,versao_antes,versao_depois,baseline_versao,alteracoes,hash_antes,hash_depois) values($1,$2,999,1000,$3,$4,$5,$5)',[A,crypto.randomUUID(),op.baseline_versao,{},op.hash_depois]),e=>e.code==='42501');
  }
 });
 await test('new and old history is immutable and anon cannot execute readers',async()=>{
  for(const c of[a,service])for(const table of['integridade_privado.baselines','integridade_privado.operacoes','public.dados_app_historico'])for(const verb of[`update ${table} set user_id=user_id`,`delete from ${table}`,`truncate ${table}`])await assert.rejects(c.query(verb),e=>e.code==='42501');
  const anon=await connect('anon');await assert.rejects(anon.query('select public.integridade_listar_versoes($1)',[A]),e=>e.code==='42501');
 });
 await test('other owner sees no metadata and cannot reconstruct this account',async()=>{
  assert.equal((await b.query('select * from public.integridade_listar_versoes($1)',[A])).rowCount,0);
  await assert.rejects(state(oracle[0].op,'depois',b),e=>e.code==='PT404');
 });
 await test('metadata pagination is bounded and validates null parameters',async()=>{
  const page=(await a.query('select * from integridade_listar_versoes($1,0,2)',[A])).rows;assert.equal(page.length,2);assert.equal(page[0].formato,2);assert.equal(page[0].conteudo_depois,undefined);
  for(const args of[[A,-1,50],[A,0,51],[A,0,null],[A,null,10]])await assert.rejects(a.query('select * from integridade_listar_versoes($1,$2,$3)',args),e=>e.code==='22023');
  await assert.rejects(state(oracle[0].op,null),e=>e.code==='22023');
 });
 await test('fault in baseline or operation rolls back source and every journal part',async()=>{
  const n=(await admin.query('select count(*)::int as n from integridade_privado.baselines')).rows[0].n;
  const c=await connect('authenticated',C);
  for(const table of['baselines','operacoes']){
   await admin.query(`create function integridade_privado.synthetic_fault() returns trigger language plpgsql as $$begin raise exception 'synthetic capture fault';end$$;create trigger synthetic_fault before insert on integridade_privado.${table} for each row execute function integridade_privado.synthetic_fault()`);
   await assert.rejects(c.query('insert into dados_app(user_id,conteudo,versao) values($1,$2,1)',[C,initial()]),/synthetic capture fault/);
   assert.equal((await admin.query('select * from dados_app where user_id=$1',[C])).rowCount,0);assert.equal((await admin.query('select count(*)::int as n from integridade_privado.baselines')).rows[0].n,n);
   await admin.query(`drop trigger synthetic_fault on integridade_privado.${table};drop function integridade_privado.synthetic_fault()`);
  }
 });
 await test('100 content changes create one additive checkpoint; following version-only writes create none',async()=>{
  const before=(await admin.query('select count(*)::int as n from integridade_privado.baselines')).rows[0].n;
  for(let i=0;i<100;i++)await update({...body,checkpoint:i});
  const after=(await admin.query('select count(*)::int as n from integridade_privado.baselines')).rows[0].n;assert.equal(after,before+1);
  for(let i=0;i<5;i++)await update(null,{actor:service,versionOnly:true});
  assert.equal((await admin.query('select count(*)::int as n from integridade_privado.baselines')).rows[0].n,after);
 });
 await test('every old and new revision reconstructs exactly against independent complete snapshots',async()=>{
  for(const item of oracle){assert.deepEqual(await state(item.op,'antes'),item.before);assert.deepEqual(await state(item.op,'depois'),item.after)}
 });
 await test('tampered synthetic chain is rejected rather than offered for recovery',async()=>{
  const op=oracle.at(-1).op;
  await admin.query('alter table integridade_privado.operacoes disable trigger operacao_imutavel');
  await admin.query("update integridade_privado.operacoes set hash_depois=repeat('0',64) where user_id=$1 and operacao_id=$2",[A,op.operacao_id]);
  await admin.query('alter table integridade_privado.operacoes enable trigger operacao_imutavel');
  await assert.rejects(state(op,'depois'),e=>e.code==='PT409');
 });
 console.log(JSON.stringify({passed,failed:0,oracle_revisions:oracle.length,scope:'temporary loopback PostgreSQL; synthetic data; no production endpoints'}));
}))().catch(e=>{console.error(e.stack);process.exitCode=1});
