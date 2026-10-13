// Integração exclusiva da pilha Supabase local descartável; nunca executar contra projeto remoto.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { createDurableHandler } from '../supabase/functions/_shared/atendimento/durable-handler.mjs';
import { createDurableBackup } from '../supabase/functions/_shared/atendimento/backup.mjs';
import { verifyWithExistingAuth } from '../supabase/functions/_shared/atendimento/handler.mjs';
import { createPgRepository } from '../supabase/functions/_shared/atendimento/repository.mjs';

const project=process.env.VCK_LOCAL_SUPABASE_WORKDIR;
if(process.env.VCK_LOCAL_TEST!=='1'||!project?.endsWith('/atendimento-supabase-local')||!readFileSync(`${project}/.vck-synthetic-only`,'utf8').includes('synthetic only'))throw new Error('Projeto local sintético exigido.');
const raw=execFileSync('supabase',['status','--workdir',project,'--output','env'],{encoding:'utf8',env:process.env,stdio:['ignore','pipe','ignore']});
const cfg=Object.fromEntries(raw.trim().split('\n').map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1).replace(/^"|"$/g,'')];}));
const api=cfg.API_URL;
if(api!=='http://127.0.0.1:54321'||!cfg.DB_URL?.startsWith('postgresql://postgres:postgres@127.0.0.1:54322/'))throw new Error('Somente Supabase loopback local permitido.');
const jsonHeaders={apikey:cfg.ANON_KEY,'content-type':'application/json'};
const request=async(path,options={})=>fetch(api+path,options);
async function signUp(label){
  const email=`vck-atendimento-${label}-${crypto.randomUUID()}@example.test`,password=`Local-only-${crypto.randomUUID()}!`;
  const response=await request('/auth/v1/signup',{method:'POST',headers:jsonHeaders,body:JSON.stringify({email,password})});
  const data=await response.json();assert.equal(response.status,200,JSON.stringify({status:response.status,error:data.msg||data.error}));
  assert.ok(data.user?.id&&data.access_token);return {id:data.user.id,token:data.access_token};
}
let pool=new Pool({connectionString:cfg.DB_URL,max:3});
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
const bucket='atendimento-arquivos';
const storagePath=key=>`/storage/v1/object/${bucket}/${key}`;
const storageHeaders={apikey:cfg.SERVICE_ROLE_KEY,authorization:`Bearer ${cfg.SERVICE_ROLE_KEY}`};
const objectStore={mode:'sintetico',digest,async put(key,bytes){
  let response=await request(storagePath(key),{method:'POST',headers:{...storageHeaders,'content-type':'application/pdf','x-upsert':'false'},body:bytes});
  if(response.ok)return;
  if(response.status===409||response.status===400){const existing=await this.get(key);if(await digest(existing)===await digest(bytes))return;}
  throw new Error(`Storage upload falhou: HTTP ${response.status}`);
},async get(key){const response=await request(`/storage/v1/object/authenticated/${bucket}/${key}`,{headers:storageHeaders});if(!response.ok)throw new Error(`Storage leitura falhou: HTTP ${response.status}`);return new Uint8Array(await response.arrayBuffer());}};
if(process.argv.includes('--verify-persistence')){
  const health=await request('/auth/v1/health');assert.equal(health.status,200);
  const chats=await pool.query('select count(*)::int as count from public.atendimento_conversas');
  const files=await pool.query("select caminho,tamanho,sha256 from public.atendimento_anexos where estado_arquivo='arquivado' limit 1");
  assert.ok(chats.rows[0].count>=1&&files.rowCount===1);
  const bytes=await objectStore.get(files.rows[0].caminho);
  assert.equal(bytes.length,Number(files.rows[0].tamanho));assert.equal(await digest(bytes),files.rows[0].sha256);
  await pool.end();
  console.log('OK: após reinício do PostgreSQL, Auth saudável, conversa persistida e PDF privado íntegro.');
  process.exit(0);
}
const a=await signUp('a'),b=await signUp('b');
const verify=verifyWithExistingAuth({auth:{async getUser(token){const response=await request('/auth/v1/user',{headers:{...jsonHeaders,authorization:`Bearer ${token}`}});return response.ok?{data:{user:await response.json()},error:null}:{data:null,error:await response.text()};}}});
const origin='http://127.0.0.1:17867';
const makeHandler=()=>createDurableHandler({enabled:true,allowedOrigin:origin,verifyUser:verify,repositoryFor:async id=>createPgRepository({pool,owner:id,objectStore}),backupFor:createDurableBackup,transport:{mode:'sintetico',send:async()=>({providerId:`mock-${crypto.randomUUID()}`})}});
let handler=makeHandler();
const server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const response=await handler(new Request(origin+'/',{method:req.method,headers:req.headers,body:Buffer.concat(chunks)}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end();}});
await new Promise(resolve=>server.listen(17867,'127.0.0.1',resolve));
const call=async(user,body,extra={})=>{const response=await fetch(origin,{method:'POST',headers:{origin,authorization:user?`Bearer ${user.token}`:'', 'content-type':'application/json',...extra},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
async function rls(user){const client=await pool.connect();try{await client.query('begin');await client.query('set local role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,true)",[user.id]);const result=await client.query('select id from public.atendimento_conversas order by id');await client.query('rollback');return result.rows;}finally{client.release();}}
try{
  assert.equal((await call(null,{acao:'listar'})).status,401);
  assert.equal((await call(a,{acao:'listar'},{origin:'http://evil.invalid'})).status,403);
  const group={instance:'mock',messageId:'group1',type:'message',status:'aceita',at:new Date().toISOString(),phone:'5511999990001',fromMe:false,text:'ignorar',isGroup:true};
  assert.equal((await call(a,{acao:'ingressar_sintetico',event:group})).body.data.ignored,true);
  const base={instance:'mock',messageId:'msg1',at:new Date().toISOString(),phone:'5511999990001',lid:'123456789@lid'};
  const status={...base,type:'status',status:'entregue'};
  const message={...base,type:'message',status:'aceita',fromMe:true,text:'Teste sintético'};
  assert.equal((await call(a,{acao:'ingressar_sintetico',event:status})).status,200);
  assert.equal((await call(a,{acao:'processar_sintetico'})).body.data.state,'processado');
  assert.equal((await call(a,{acao:'ingressar_sintetico',event:message})).status,200);
  assert.equal((await call(a,{acao:'ingressar_sintetico',event:message})).body.data.duplicate,true);
  assert.equal((await call(a,{acao:'processar_sintetico'})).body.data.state,'processado');
  const listed=await call(a,{acao:'listar'});assert.equal(listed.status,200);assert.equal(listed.body.data.length,1);
  const chatId=listed.body.data[0].id;
  assert.equal((await call(b,{acao:'listar'})).body.data.length,0);
  assert.equal((await rls(a)).length,1);assert.equal((await rls(b)).length,0);
  const timeline=await call(a,{acao:'mensagens',chatId});assert.equal(timeline.body.data[0].status,'entregue');
  assert.equal((await call(b,{acao:'mensagens',chatId})).status,404);
  const pdf=new TextEncoder().encode('%PDF-1.4\nSynthetic Atendimento local test\n%%EOF');
  const archived=await call(a,{acao:'anexar',chatId,name:'teste.pdf',bytes:Array.from(pdf),requestId:'local-pdf-1'});
  assert.equal(archived.status,200,JSON.stringify(archived.body));const fileId=archived.body.data.id;
  const duplicate=await call(a,{acao:'anexar',chatId,name:'teste.pdf',bytes:Array.from(pdf),requestId:'local-pdf-1'});
  assert.equal(duplicate.body.data.id,fileId);
  assert.deepEqual((await call(a,{acao:'arquivo',fileId})).body.data.bytes,Array.from(pdf));
  assert.equal((await call(b,{acao:'arquivo',fileId})).status,404);
  const key=`${a.id}/${chatId}/${fileId}.pdf`;
  for(const token of [b.token,cfg.ANON_KEY]){const response=await request(`/storage/v1/object/authenticated/${bucket}/${key}`,{headers:{apikey:cfg.ANON_KEY,authorization:`Bearer ${token}`}});assert.ok(!response.ok,`Storage leitura indevida: ${response.status}`);}
  const packResponse=await call(a,{acao:'exportar'});assert.equal(packResponse.status,200);const pack=packResponse.body.data;
  assert.equal(pack.files.length,1);assert.equal(Buffer.from(pack.files[0].base64,'base64').toString(),Buffer.from(pdf).toString());
  assert.equal((await call(b,{acao:'restaurar',package:pack})).status,422);
  const removed=await request(`/storage/v1/object/${bucket}`,{method:'DELETE',headers:{...storageHeaders,'content-type':'application/json'},body:JSON.stringify({prefixes:[key]})});
  assert.ok(removed.ok,`Remoção do PDF sintético: HTTP ${removed.status}`);
  await assert.rejects(objectStore.get(key));
  await pool.query('truncate public.atendimento_encaminhamentos,public.atendimento_ingressos,public.atendimento_outbox,public.atendimento_eventos,public.atendimento_mensagens,public.atendimento_anexos,public.atendimento_identidades,public.atendimento_conversas cascade');
  const restored=await call(a,{acao:'restaurar',package:pack});assert.equal(restored.status,200,JSON.stringify(restored.body));assert.equal(restored.body.data.files,1);
  assert.deepEqual(Array.from(await objectStore.get(key)),Array.from(pdf));
  assert.equal((await call(a,{acao:'restaurar',package:pack})).body.data.reused,true);
  assert.equal((await rls(a)).length,1);assert.equal((await rls(b)).length,0);
  await pool.end();pool=new Pool({connectionString:cfg.DB_URL,max:3});handler=makeHandler();
  assert.equal((await call(a,{acao:'listar'})).body.data.length,1);
  console.log('OK: Auth real, HTTP, RLS de dois usuários, status fora de ordem, deduplicação, grupo ignorado, PDF privado, backup, restauração de bytes e nova conexão PostgreSQL.');
}finally{await pool.end();await new Promise(resolve=>server.close(resolve));}
