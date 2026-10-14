// Uses only a new loopback PostgreSQL cluster; never an environment DB URL.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {execFileSync}=require('node:child_process');
const {Client}=require('pg');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const bin=[process.env.VCK_PG_BIN,'/opt/homebrew/opt/postgresql@17/bin','/usr/lib/postgresql/17/bin','/usr/local/opt/postgresql@17/bin'].filter(Boolean).find(p=>fs.existsSync(path.join(p,'initdb')));
if(!bin)throw new Error('PostgreSQL 17 required. Set VCK_PG_BIN to a test binary directory.');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const body=label=>({emissao_pessoas:[{id:'synthetic-contact',nome:label}],emissao_vendas:[],emissao_pacotes:[],emissao_cotacoes:[]});
(async()=>{
 const dir=fs.mkdtempSync(path.join(root,'../integrity-db-')),cluster=path.join(dir,'data'),user=os.userInfo().username;
 const run=(name,args)=>execFileSync(path.join(bin,name),args,{cwd:root,encoding:'utf8',stdio:'pipe'});
 let started=false,admin,p,q,passed=0;
 async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
 try{
  const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
  run('initdb',['-D',cluster,'--auth=trust','--no-locale','-E','UTF8','-U',user]);
  run('pg_ctl',['-D',cluster,'-l',path.join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ''`,'-w','start']);started=true;
  run('createdb',['-h','127.0.0.1','-p',String(port),'-U',user,'vck_central_test']);
  const args=['-X','-h','127.0.0.1','-p',String(port),'-U',user,'-d','vck_central_test','-v','ON_ERROR_STOP=1'];
  run('psql',[...args,'-f','tests/db/bootstrap.sql']);
  run('psql',[...args,'-f','supabase/migrations/20261014170118_integridade_historico.sql']);
  const config={host:'127.0.0.1',port,user,database:'vck_central_test'};
  admin=new Client(config);await admin.connect();
  await admin.query('insert into auth.users(id) values ($1),($2)',[A,B]);
  async function actor(owner){const c=new Client(config);await c.connect();await c.query('set role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);return c;}
  p=await actor(A);q=await actor(B);
  await test('authenticated initial snapshot is journaled with owner',async()=>{
   await p.query('insert into public.dados_app(user_id,conteudo,versao) values($1,$2,1)',[A,body('initial-A')]);
   await q.query('insert into public.dados_app(user_id,conteudo,versao) values($1,$2,1)',[B,body('initial-B')]);
   assert.equal((await p.query('select * from public.dados_app_historico')).rowCount,1);
   assert.equal((await q.query('select * from public.dados_app_historico')).rowCount,1);
  });
  await test('CAS winner captures before/after; stale writer changes nothing',async()=>{
   const other=await actor(A);try{
    const op='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const results=await Promise.all([p.query('update dados_app set conteudo=$1,versao=2,ultima_operacao_id=$2 where user_id=$3 and versao=1 returning versao',[body('winner'),op,A]),other.query('update dados_app set conteudo=$1,versao=2 where user_id=$2 and versao=1 returning versao',[body('competitor'),A])]);
    assert.deepEqual(results.map(r=>r.rowCount).sort(),[0,1]);
    const h=(await p.query('select * from dados_app_historico where versao_depois=2')).rows[0];
    assert.equal(h.conteudo_antes.emissao_pessoas[0].nome,'initial-A');assert.equal(h.versao_antes,'1');
    assert.equal((await p.query('select * from dados_app_historico')).rowCount,2);
   }finally{await other.end();}
  });
  await test('legacy update without operation ID is captured',async()=>{
   await p.query('update dados_app set conteudo=$1,versao=3 where user_id=$2 and versao=2',[body('legacy'),A]);
   assert.equal((await p.query('select * from dados_app_historico')).rowCount,3);
   assert.equal((await p.query('select conteudo_depois from dados_app_historico where versao_depois=3')).rows[0].conteudo_depois.emissao_pessoas[0].nome,'legacy');
  });
  await test('cross-account read and update are denied by RLS',async()=>{
   assert.equal((await q.query('select * from dados_app_historico where user_id=$1',[A])).rowCount,0);
   assert.equal((await q.query('update dados_app set versao=4 where user_id=$1',[A])).rowCount,0);
   await assert.rejects(q.query('insert into dados_app(user_id,conteudo,versao) values($1,$2,5)',[A,body('wrong-owner')]),e=>['42501','23505'].includes(e.code));
  });
  await test('owner cannot reassign account during update',async()=>{
   await assert.rejects(p.query('update dados_app set user_id=$1,versao=4 where user_id=$2',[B,A]),e=>['42501','23505'].includes(e.code));
   assert.equal((await p.query('select versao from dados_app')).rows[0].versao,'3');
  });
  await test('unrelated forged history snapshot is rejected',async()=>{
   await assert.rejects(p.query('insert into dados_app_historico(user_id,operacao_id,versao_depois,conteudo_depois) values($1,$2,99,$3)',[A,'ffffffff-ffff-4fff-8fff-ffffffffffff',body('forged')]),e=>e.code==='42501');
  });
  await test('history is not mutable by authenticated users',async()=>{
   for(const sql of['update dados_app_historico set conteudo_antes=null','delete from dados_app_historico','truncate dados_app_historico'])await assert.rejects(p.query(sql),e=>e.code==='42501');
  });
  await test('anon has no history read or write privilege',async()=>{
   const anon=new Client(config);await anon.connect();try{await anon.query('set role anon');await assert.rejects(anon.query('select * from dados_app_historico'),e=>e.code==='42501');}finally{await anon.end();}
  });
  await test('journal failure rolls back account update atomically',async()=>{
   await admin.query("create function public.synthetic_history_fault() returns trigger language plpgsql as $$ begin raise exception 'synthetic journal failure'; end $$; create trigger synthetic_fault before insert on dados_app_historico for each row execute function public.synthetic_history_fault();");
   await assert.rejects(p.query('update dados_app set conteudo=$1,versao=4 where user_id=$2',[body('must-rollback'),A]),/synthetic journal failure/);
   assert.equal((await p.query('select versao from dados_app')).rows[0].versao,'3');
   assert.equal((await p.query('select * from dados_app_historico')).rowCount,3);
   await admin.query('drop trigger synthetic_fault on dados_app_historico; drop function public.synthetic_history_fault()');
  });
  await test('non-advancing version rejects state mutation',async()=>{
   await assert.rejects(p.query('update dados_app set conteudo=$1 where user_id=$2',[body('stale'),A]),e=>e.code==='40001');
   assert.equal((await p.query('select versao from dados_app')).rows[0].versao,'3');
  });
  await test('service version-only writer remains compatible and journaled',async()=>{
   await admin.query('grant update(versao),select on dados_app to service_role');
   const service=new Client(config);await service.connect();try{await service.query('set role service_role');await service.query('update dados_app set versao=versao+1 where user_id=$1',[A]);}finally{await service.end();}
   assert.equal((await p.query('select * from dados_app_historico')).rowCount,4);
  });
  await test('new connection retains durable history and old snapshots',async()=>{
   const reopened=await actor(A);try{const rows=(await reopened.query('select * from dados_app_historico order by versao_depois')).rows;assert.equal(rows.length,4);assert.equal(rows[0].conteudo_depois.emissao_pessoas[0].nome,'initial-A');}finally{await reopened.end();}
  });
  console.log(JSON.stringify({passed,failed:0,scope:'isolated PostgreSQL 17; synthetic owners; no operational database'}));
 }finally{
  await Promise.allSettled([p?.end(),q?.end(),admin?.end()]);
  if(started)run('pg_ctl',['-D',cluster,'-m','immediate','-w','stop']);
  fs.rmSync(dir,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1});
