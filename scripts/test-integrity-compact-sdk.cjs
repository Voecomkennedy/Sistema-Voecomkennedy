// Exclusive scratch stack only. Never accepts a Supabase URL or credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),http=require('node:http'),net=require('node:net');
const {execFileSync,spawn}=require('node:child_process'),assert=require('node:assert/strict'),{Client}=require('pg'),{createClient}=require('@supabase/supabase-js');
const repo=path.resolve(__dirname,'..'),root='/Volumes/HD externo/Codex-eval-preparation/it2';
const docker='/opt/homebrew/bin/docker',host=`unix://${root}/c/hc/docker.sock`,prefix=`vck-hc-${process.pid}`;
const env={...process.env,PATH:'/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',DOCKER_CONFIG:root+'/d',DOCKER_CONTEXT:'',DOCKER_HOST:host};
const images={db:'postgres:17.11@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3',auth:'supabase/gotrue:v2.196.0@sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232',rest:'postgrest/postgrest:v14.17@sha256:c9dc201e555f5d8e37e7f39cdd4df0229774996e213bfd7de8d10ac609030f2c'};
const secrets=[],redact=s=>secrets.reduce((v,k)=>v.split(k).join('[synthetic credential redacted]'),String(s));
function secret(){const s=crypto.randomBytes(32).toString('hex');secrets.push(s);return s;}
const jwtSecret=secret(),dbPassword=secret(),authPassword=secret(),restPassword=secret(),userPassword=secret();
const scratch=path.join(root,'project',prefix),evidence=path.join(root,'evidence',prefix);let passed=0,phase='setup',gateway,admin,network=false,volume=false,requests=0;
const containers=[],clients=[],tunnels=[];
function run(args,input){try{return execFileSync(docker,['--host',host,...args],{env,input,encoding:'utf8',timeout:60000,stdio:['pipe','pipe','pipe']});}catch(e){fs.appendFileSync(path.join(evidence,'docker-errors.log'),redact(e.stderr||e.message)+'\n');throw new Error('Exclusive Docker action failed: '+args.slice(0,2).join(' '));}}
function envFile(name,vars){const file=path.join(scratch,name+'.env');fs.writeFileSync(file,Object.entries(vars).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600});return file;}
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(check,label){const end=Date.now()+45000;while(Date.now()<end){try{if(await check())return;}catch{}await wait(500);}throw new Error(label+' did not become ready');}
function token(role){const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),data=b64({alg:'HS256',typ:'JWT'})+'.'+b64({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600});const t=data+'.'+crypto.createHmac('sha256',jwtSecret).update(data).digest('base64url');secrets.push(t);return t;}
const anonKey=token('anon'),serviceKey=token('service_role');
const safeFetch=async(input,init)=>{const url=new URL(typeof input==='string'?input:input.url||String(input));assert.equal(url.hostname,'127.0.0.1');requests++;const timeout=AbortSignal.timeout(10000);return fetch(input,{...init,signal:init?.signal?AbortSignal.any([init.signal,timeout]):timeout,redirect:'error'});};
const good=async response=>{const r=await response;if(r.error)throw Object.assign(new Error(r.error.message),r.error);return r.data;};
async function test(name,fn){phase=name;await fn();passed++;console.log('PASS '+name);}
(async()=>{
 fs.mkdirSync(scratch,{recursive:true,mode:0o700});fs.mkdirSync(evidence,{recursive:true,mode:0o700});
 try{
  const pgPort=await port(),authPort=await port(),restPort=await port();
  run(['network','create','--internal',prefix]);network=true;run(['volume','create',prefix]);volume=true;
  const sshConfig=path.join(root,'c/_lima/colima-hc/ssh.config'),configText=fs.readFileSync(sshConfig,'utf8');
  assert.match(configText,/HostName\s+127\.0\.0\.1/i,'VM SSH must use loopback');
  // Reuse only the SSH identity generated for this exclusive VM. No keys are
  // read or displayed, no agent is forwarded and no global SSH file is edited.
  const hostAlias=configText.match(/^Host\s+(\S+)/m)?.[1];assert.ok(hostAlias);
  const start=(name,image,vars,bindings,extra=[])=>{
   const id=prefix+'-'+name;containers.push(id);run(['run','-d','--pull=never','--name',id,'--network',prefix,'--network-alias',name,'--env-file',envFile(name,vars),...extra,image]);
   const ip=run(['inspect','--format','{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',id]).trim();assert.match(ip,/^\d+\.\d+\.\d+\.\d+$/);
   for(const[a,b]of bindings){const proc=spawn('/usr/bin/ssh',['-F',sshConfig,'-N','-o','BatchMode=yes','-o','IdentityAgent=none','-o','ControlMaster=no','-o','ControlPath=none','-o','ControlPersist=no','-o','ExitOnForwardFailure=yes','-L',`127.0.0.1:${a}:${ip}:${b}`,hostAlias],{env,stdio:['ignore','ignore','pipe']});
    tunnels.push(proc);proc.stderr.on('data',v=>fs.appendFileSync(path.join(evidence,'forwarding.log'),redact(v)));proc.on('error',e=>fs.appendFileSync(path.join(evidence,'forwarding.log'),redact(e.message)));}
  };
  start('db',images.db,{POSTGRES_PASSWORD:dbPassword,POSTGRES_DB:'vck_central_test'},[[pgPort,5432]],['-v',prefix+':/var/lib/postgresql/data']);
  await ready(()=>{run(['exec',prefix+'-db','pg_isready','-U','postgres','-d','vck_central_test']);return true;},'PostgreSQL');
  // Colima's loopback forwarding can become ready after pg_isready inside
  // the container. Confirm the actual host connection before proceeding.
  await ready(async()=>{
   const c=new Client({host:'127.0.0.1',port:pgPort,user:'postgres',password:dbPassword,database:'vck_central_test',connectionTimeoutMillis:1000});
   try{await c.connect();await c.query('select 1');admin=c;return true;}catch{await c.end();return false;}
  },'PostgreSQL host loopback');
  console.log('READY isolated PostgreSQL loopback');
  await admin.query(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
   create role authenticator login noinherit password '${restPassword}';grant anon,authenticated,service_role to authenticator;
   create role supabase_auth_admin login noinherit password '${authPassword}';
   create schema auth authorization supabase_auth_admin;grant create on database vck_central_test to supabase_auth_admin;
   alter role supabase_auth_admin set search_path=auth;
   grant usage on schema auth to anon,authenticated,service_role;
   alter default privileges grant all on tables to anon,authenticated,service_role;`);
  gateway=http.createServer((req,res)=>{
   if(![anonKey,serviceKey].includes(req.headers.apikey)){res.writeHead(401);res.end();return;}
   const route=req.url.startsWith('/auth/v1/')?['/auth/v1',authPort]:req.url.startsWith('/rest/v1/')?['/rest/v1',restPort]:null;
   if(!route){res.writeHead(404);res.end();return;}
   const upstream=http.request({hostname:'127.0.0.1',port:route[1],path:req.url.slice(route[0].length),method:req.method,headers:{...req.headers,host:'127.0.0.1'}},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res)});
   upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end()});req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());req.pipe(upstream);
  });await new Promise(r=>gateway.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+gateway.address().port;
  start('auth',images.auth,{GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:url+'/auth/v1',GOTRUE_SITE_URL:url,GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:`postgres://supabase_auth_admin:${authPassword}@db:5432/vck_central_test?sslmode=disable`,GOTRUE_DB_NAMESPACE:'auth',GOTRUE_JWT_SECRET:jwtSecret,GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_EXTERNAL_PHONE_ENABLED:'false',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_DISABLE_SIGNUP:'false',GOTRUE_DB_MAX_POOL_SIZE:'3',GOTRUE_LOG_LEVEL:'error'},[[authPort,9999]]);
  await ready(async()=>{const r=await safeFetch(`http://127.0.0.1:${authPort}/health`);return r.ok;},'GoTrue');
  console.log('READY isolated Auth after its own migrations');
  // GoTrue owns and migrates auth.uid(). Only after those migrations, adapt
  // this scratch helper to the real PostgREST JSON claim setting.
  await admin.query(`create or replace function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
   grant execute on function auth.uid() to anon,authenticated,service_role;`);
  await admin.query(`create table public.dados_app(user_id uuid primary key references auth.users(id),conteudo jsonb not null default '{}',versao bigint not null default 0,atualizado_em timestamptz not null default now());
   alter table dados_app enable row level security;create policy dados_app_test_owner on dados_app to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
   revoke all on dados_app from public,anon,authenticated,service_role;
   grant select,insert,update,delete on dados_app to authenticated;grant select,update(versao) on dados_app to service_role;`);
  await admin.query(fs.readFileSync(path.join(repo,'supabase/migrations/20261014170118_integridade_historico.sql'),'utf8'));
  start('rest',images.rest,{PGRST_DB_URI:`postgres://authenticator:${restPassword}@db:5432/vck_central_test`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:jwtSecret,PGRST_DB_POOL:'3',PGRST_SERVER_PORT:'3000'},[[restPort,3000]]);
  await ready(async()=>{const r=await safeFetch(url+'/rest/v1/',{headers:{apikey:anonKey}});return r.ok;},'PostgREST');
  console.log('READY isolated PostgREST');
  const sdk=(key=anonKey,access)=>{const c=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:safeFetch},...(access?{accessToken:()=>access}:{})});if(!access)clients.push(c);return c;};
  const a=sdk(),b=sdk(),anon=sdk(),service=sdk(serviceKey);let A,B,access;
  await test('real Auth creates two synthetic identities, login, getUser and refresh succeed',async()=>{
   for(const[c,email]of[[a,'account-a@synthetic.invalid'],[b,'account-b@synthetic.invalid']]){const d=await good(c.auth.signUp({email,password:userPassword}));assert.ok(d.session);secrets.push(d.session.access_token,d.session.refresh_token);}
   const login=await good(a.auth.signInWithPassword({email:'account-a@synthetic.invalid',password:userPassword}));A=login.user.id;B=(await good(b.auth.getUser())).user.id;assert.notEqual(A,B);
   const refreshed=await good(a.auth.refreshSession());access=refreshed.session.access_token;secrets.push(access,refreshed.session.refresh_token);assert.equal((await good(a.auth.getUser())).user.id,A);
  });
  const body={emissao_pessoas:[{id:'p',nome:'Sintético'}],emissao_vendas:[],emissao_pacotes:[],emissao_cotacoes:[{id:'q1',clienteId:'p',observacao:'Antiga'},{id:'q2',clienteId:'p',observacao:'Independente'}],extra:null};
  await test('legacy snapshot capture works through real SDK and missing compact RPC is explicit',async()=>{
   await good(a.from('dados_app').insert({user_id:A,conteudo:body,versao:1}));const r=await a.rpc('integridade_listar_versoes',{p_user_id:A});assert.equal(r.error.code,'PGRST202');
  });
  await admin.query('begin');try{await admin.query(fs.readFileSync(path.join(repo,'supabase/migrations/20261014201423_integridade_historico_compacto.sql'),'utf8'));await admin.query('commit');}catch(e){await admin.query('rollback');throw e;}
  await ready(async()=>!(await a.rpc('integridade_listar_versoes',{p_user_id:A})).error,'RPC schema reload');
  const op=crypto.randomUUID(),next=structuredClone(body);next.emissao_cotacoes[0].observacao='Atual';let metadata;
  const get=(client,id,side)=>good(client.rpc('integridade_obter_estado',{p_user_id:A,p_operacao_id:id,p_lado:side}));
  await test('atomic compact SDK capture lists metadata only and reconstructs old and new states',async()=>{
   await good(a.from('dados_app').update({conteudo:next,versao:2,ultima_operacao_id:op}).eq('user_id',A).eq('versao',1).select().single());
   metadata=await good(a.rpc('integridade_listar_versoes',{p_user_id:A}));assert.deepEqual(metadata.map(x=>x.formato),[2,1]);assert.equal(metadata[0].conteudo_depois,undefined);
   assert.deepEqual(await get(a,op,'antes'),body);assert.deepEqual(await get(a,op,'depois'),next);assert.deepEqual(await get(a,metadata[1].operacao_id,'depois'),body);
  });
  await test('real JWT owner RLS blocks reads, writes and reconstruction by another account',async()=>{
   assert.deepEqual(await good(b.from('dados_app').select().eq('user_id',A)),[]);assert.deepEqual(await good(b.rpc('integridade_listar_versoes',{p_user_id:A})),[]);
   assert.equal((await b.rpc('integridade_obter_estado',{p_user_id:A,p_operacao_id:op,p_lado:'depois'})).error.code,'PT404');
   assert.deepEqual(await good(b.from('dados_app').update({versao:3}).eq('user_id',A).select()),[]);assert.equal((await b.from('dados_app').insert({user_id:A,conteudo:body,versao:1})).error.code,'42501');
  });
  await test('anonymous reader and direct legacy inserts are denied; private schema is not exposed',async()=>{
   assert.equal((await anon.rpc('integridade_listar_versoes',{p_user_id:A})).error.code,'42501');
   assert.equal((await a.schema('integridade_privado').from('operacoes').select()).error.code,'PGRST106');
   assert.equal((await service.from('dados_app_historico').insert({})).error.code,'42501');
  });
  await test('two real SDK actors with same JWT race CAS and commit exactly one effect',async()=>{
   const other=sdk(anonKey,access),results=await Promise.all([a,other].map((c,i)=>good(c.from('dados_app').update({versao:3,conteudo:{...next,race:i},ultima_operacao_id:crypto.randomUUID()}).eq('user_id',A).eq('versao',2).select())));
   assert.deepEqual(results.map(x=>x.length).sort(),[0,1]);assert.equal((await good(a.rpc('integridade_listar_versoes',{p_user_id:A}))).length,3);
  });
  await test('service version-only writer is captured without a payload duplicate and cannot edit content',async()=>{
   const before=await good(service.from('dados_app').select().eq('user_id',A).single());await good(service.from('dados_app').update({versao:4}).eq('user_id',A).eq('versao',3));
   const newest=(await good(a.rpc('integridade_listar_versoes',{p_user_id:A})))[0];assert.deepEqual(await get(a,newest.operacao_id,'depois'),before.conteudo);
   const change=(await admin.query('select alteracoes from integridade_privado.operacoes where operacao_id=$1',[newest.operacao_id])).rows[0];assert.deepEqual(change.alteracoes,{});
   assert.equal((await service.from('dados_app').update({conteudo:body,versao:5}).eq('user_id',A)).error.code,'42501');
  });
  await test('legacy SDK writer receives server identity; invalid advance and reused operation roll back',async()=>{
   await good(a.from('dados_app').update({versao:5}).eq('user_id',A).eq('versao',4));const row=await good(a.from('dados_app').select().single());assert.ok(row.ultima_operacao_id);assert.notEqual(row.ultima_operacao_id,op);
   const rejected=await a.from('dados_app').update({conteudo:body}).eq('user_id',A);assert.equal(rejected.status,409);assert.equal(rejected.error.code,'PT409');
   assert.equal((await a.from('dados_app').update({versao:6,ultima_operacao_id:op}).eq('user_id',A)).error.code,'23505');assert.deepEqual(await good(a.from('dados_app').select().single()),row);
  });
  await test('capture failure via REST rolls back source and journal together',async()=>{
   const before=await good(a.from('dados_app').select().single()),n=(await good(a.rpc('integridade_listar_versoes',{p_user_id:A}))).length;
   await admin.query("create function integridade_privado.synthetic_fault() returns trigger language plpgsql as $$begin raise exception 'synthetic fault';end$$;create trigger synthetic_fault before insert on integridade_privado.operacoes for each row execute function integridade_privado.synthetic_fault()");
   const r=await a.from('dados_app').update({versao:6,conteudo:body}).eq('user_id',A);assert.equal(r.error.code,'P0001');assert.deepEqual(await good(a.from('dados_app').select().single()),before);assert.equal((await good(a.rpc('integridade_listar_versoes',{p_user_id:A}))).length,n);
   await admin.query('drop trigger synthetic_fault on integridade_privado.operacoes;drop function integridade_privado.synthetic_fault()');
  });
  await test('real Auth logout ends the synthetic session',async()=>{await good(a.auth.signOut());assert.equal((await a.auth.getSession()).data.session,null);});
  const result={passed,failed:0,requests,production_requests:0,versions:{postgres:'17.11',gotrue:'2.196.0',postgrest:'14.17',sdk:require('@supabase/supabase-js/package.json').version},images,scope:'exclusive internal Docker network; temporary SSH loopback tunnels using existing exclusive VM identity; no published container ports; synthetic Auth identities; no SMTP/OAuth/jobs'};
  fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }catch(e){fs.writeFileSync(path.join(evidence,'failure.txt'),phase+'\n'+redact(e.stack));throw e;}finally{
  for(const c of clients){try{c.auth.stopAutoRefresh();}catch{}}await admin?.end();if(gateway){gateway.closeAllConnections();await new Promise(r=>gateway.close(r));}
  await Promise.all(tunnels.map(proc=>new Promise(resolve=>{if(proc.exitCode!=null)return resolve();proc.once('close',resolve);proc.kill('SIGTERM');})));
  for(const id of containers){try{fs.writeFileSync(path.join(evidence,id+'.log'),redact(run(['logs','--tail','100',id])));}catch{}run(['rm','-f',id]);}
  if(volume)run(['volume','rm',prefix]);if(network)run(['network','rm',prefix]);fs.rmSync(scratch,{recursive:true,force:true});
 }
})().catch(e=>{console.error('FAIL '+phase+'; '+redact(e.message));process.exitCode=1});
