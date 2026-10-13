// Somente Supabase local descartável. Não usa login, token ou URL de produção.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {createDemoHandler} from '../supabase/functions/_shared/atendimento/demo-api.mjs';
import {createDemoRepository} from '../supabase/functions/_shared/atendimento/demo-repository.mjs';
import {verifyWithExistingAuth} from '../supabase/functions/_shared/atendimento/handler.mjs';
import {demoPdf} from '../js/atendimento-demo.mjs';
const project=process.env.VCK_LOCAL_SUPABASE_WORKDIR;
if(process.env.VCK_LOCAL_TEST!=='1'||!project?.endsWith('/atendimento-supabase-local')||!readFileSync(`${project}/.vck-synthetic-only`,'utf8').includes('synthetic only'))throw Error('Exige projeto local sintético.');
const lines=execFileSync('supabase',['status','--workdir',project,'--output','env'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
const cfg=Object.fromEntries(lines.trim().split('\n').map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).replace(/^"|"$/g,'')];}));
assert.equal(cfg.API_URL,'http://127.0.0.1:54321');assert.match(cfg.DB_URL,/^postgresql:\/\/postgres:postgres@127\.0\.0\.1:54322\//);
const service=createClient(cfg.API_URL,cfg.SERVICE_ROLE_KEY,{auth:{persistSession:false}}),auth=createClient(cfg.API_URL,cfg.ANON_KEY,{auth:{persistSession:false}});
async function signup(){const email=`demo-${crypto.randomUUID()}@example.test`,password=`Local-${crypto.randomUUID()}!`;const {data,error}=await auth.auth.signUp({email,password});assert.ifError(error);assert.ok(data.session?.access_token);return {id:data.user.id,token:data.session.access_token};}
const a=await signup(),b=await signup(),origin='http://127.0.0.1:17869';
const handler=createDemoHandler({allowedOrigin:origin,ownerId:a.id,verifyUser:verifyWithExistingAuth(auth),repositoryFor:id=>createDemoRepository(service,id)});
const call=async(token,body,extra={})=>{const response=await handler(new Request(origin,{method:'POST',headers:{origin,authorization:token?`Bearer ${token}`:'',...extra},body:JSON.stringify(body)}));return {status:response.status,payload:await response.json()};};
assert.equal((await call(null,{acao:'listar'})).status,401);
assert.equal((await call(b.token,{acao:'listar'})).status,403);
assert.equal((await call(a.token,{acao:'listar'},{origin:'http://evil.invalid'})).status,403);
let listed=await call(a.token,{acao:'listar'});assert.equal(listed.status,200,JSON.stringify(listed.payload));assert.equal(listed.payload.result.length,2);
const ana=listed.payload.result.find(c=>c.clienteId==='p-ana');assert.equal(ana.unread,2);assert.equal(ana.context.vendas[0].recebidoLiquido,900);
assert.equal((await call(a.token,{acao:'listar'})).payload.result.length,2);
assert.equal((await call(a.token,{acao:'listar',search:'bagagem'})).payload.result.length,1);
assert.equal((await call(a.token,{acao:'mensagens',chatId:b.id})).status,404);
assert.equal((await call(a.token,{acao:'vincular',chatId:ana.id,clienteId:'p-bruno',vendaId:'v-ana'})).status,422);
assert.equal((await call(a.token,{acao:'lida',chatId:ana.id})).status,200);
listed=await call(a.token,{acao:'listar',unread:true});assert.equal(listed.payload.result.length,1);
const pdf=[...demoPdf()],pdf64=Buffer.from(pdf).toString('base64'),requestId=crypto.randomUUID();let archived=await call(a.token,{acao:'anexar',chatId:ana.id,name:'exemplo.pdf',bytes:pdf64,requestId});assert.equal(archived.status,200,JSON.stringify(archived.payload));const fileId=archived.payload.result.id;
archived=await call(a.token,{acao:'anexar',chatId:ana.id,name:'exemplo.pdf',bytes:pdf64,requestId});assert.equal(archived.payload.result.id,fileId);
const downloaded=await call(a.token,{acao:'arquivo',attachmentId:fileId});assert.deepEqual([...Buffer.from(downloaded.payload.result.bytes,'base64')],pdf);
const maxPdf=new Uint8Array(5*1024*1024);maxPdf.fill(32);maxPdf.set(demoPdf());const maxFile=await call(a.token,{acao:'anexar',chatId:ana.id,name:'limite.pdf',bytes:Buffer.from(maxPdf).toString('base64'),requestId:crypto.randomUUID()});assert.equal(maxFile.status,200,JSON.stringify(maxFile.payload));const maxDownload=await call(a.token,{acao:'arquivo',attachmentId:maxFile.payload.result.id});assert.equal(Buffer.from(maxDownload.payload.result.bytes,'base64').length,maxPdf.length);
const composed=await call(a.token,{acao:'compor',chatId:ana.id,text:'Rascunho fictício',attachmentId:fileId,requestId:crypto.randomUUID()});assert.equal(composed.status,200,JSON.stringify(composed.payload));
assert.equal((await call(a.token,{acao:'mensagens',chatId:ana.id})).payload.result.length,3);
assert.equal((await call(a.token,{acao:'simular_envio'})).status,422);
const {data:jobs,error:jobError}=await service.from('atendimento_outbox').select('id').eq('user_id',a.id);assert.ifError(jobError);assert.equal(jobs.length,0);
const {data:otherRows,error:otherError}=await service.from('atendimento_conversas').select('id').eq('user_id',b.id);assert.ifError(otherError);assert.equal(otherRows.length,0);
console.log('OK: Auth local, proprietário permitido, exemplos, busca, leitura, vínculo, PDF privado, idempotência e outbox vazia.');

const deno=spawn('deno',['run','--allow-env','--allow-net','--allow-read','supabase/functions/atendimento-demo/index.ts'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,DENO_DIR:'/Volumes/HD externo/Codex-eval-preparation/.deno-cache',SUPABASE_URL:cfg.API_URL,SUPABASE_ANON_KEY:cfg.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:cfg.SERVICE_ROLE_KEY,ATENDIMENTO_DEMO_ORIGIN:origin,ATENDIMENTO_DEMO_OWNER_ID:a.id},stdio:'ignore'});
try{
 let ready=false;for(let i=0;i<100;i++){if(deno.exitCode!==null)throw Error('Edge Function local não iniciou.');try{const r=await fetch('http://127.0.0.1:8000/',{method:'POST',headers:{origin},body:'{}'});if(r.status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,'Edge Function local indisponível');
 const edge=async(user,body)=>{const r=await fetch('http://127.0.0.1:8000/',{method:'POST',headers:{origin,authorization:`Bearer ${user.token}`,apikey:cfg.ANON_KEY},body:JSON.stringify(body)});return r;};
 assert.equal((await edge(a,{acao:'listar'})).status,200);assert.equal((await edge(b,{acao:'listar'})).status,403);assert.equal((await edge(a,{acao:'simular_envio'})).status,422);
 console.log('OK: entrypoint Deno real autenticado, isolamento e transporte proibido.');
}finally{deno.kill('SIGTERM');}
