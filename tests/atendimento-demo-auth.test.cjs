const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('../cotador/node_modules/jsdom');
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ready=Promise.all([import('../supabase/functions/_shared/atendimento/demo-api.mjs'),import('../js/atendimento-persistente.mjs'),import('../js/atendimento-auth-client.mjs')]);
test('API demonstrativa exige Auth, dono permitido e origem exata; não expõe transporte',async()=>{
 const [{createDemoHandler}]=await ready;let calls=[];
 const handler=createDemoHandler({allowedOrigin:'https://sistema.voecomkennedy.tur.br',ownerId:owner,verifyUser:async token=>token==='Bearer owner'?{id:owner}:token==='Bearer other'?{id:other}:null,repositoryFor:id=>({listar:async body=>{calls.push([id,body]);return [];}})});
 const request=(body,token='Bearer owner',origin='https://sistema.voecomkennedy.tur.br')=>handler(new Request('https://test.invalid/',{method:'POST',headers:{origin,authorization:token},body:JSON.stringify(body)}));
 assert.equal((await request({acao:'listar'},'')).status,401);
 assert.equal((await request({acao:'listar'},'Bearer other')).status,403);
 assert.equal((await request({acao:'listar'},'Bearer owner','https://evil.invalid')).status,403);
 assert.equal((await request({acao:'ingressar_sintetico'})).status,422);
 assert.equal((await request({acao:'simular_envio'})).status,422);
 assert.equal((await request({acao:'listar',owner:other})).status,422);
 assert.equal((await handler(new Request('https://test.invalid/',{method:'POST',headers:{origin:'https://sistema.voecomkennedy.tur.br',authorization:'Bearer owner'},body:'{'}))).status,422);
 assert.equal((await request({acao:'listar',search:'Ana'})).status,200);
 assert.deepEqual(calls,[[owner,{acao:'listar',search:'Ana'}]]);
 assert.equal((await createDemoHandler({allowedOrigin:'https://sistema.voecomkennedy.tur.br',ownerId:'',verifyUser:async()=>({id:owner}),repositoryFor:()=>{throw Error('called');}})(new Request('https://test.invalid/',{method:'POST',headers:{origin:'https://sistema.voecomkennedy.tur.br'},body:'{}'}))).status,503);
});
test('cliente HTTP usa token atual por chamada e não aceita sessão encerrada',async()=>{
 const [,,{createAtendimentoAuthClient}]=await ready;globalThis.SUPABASE_CONFIG={anonKey:'public-test-key'};
 let token='first',requests=[];const old=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{requests.push([url,options.headers.authorization,options.body]);return new Response(JSON.stringify({result:[]}),{status:200});};
 try{const api=createAtendimentoAuthClient({client:{auth:{getSession:async()=>({data:{session:token?{access_token:token}:null}})}},endpoint:'http://127.0.0.1/test'});await api.list();token='second';await api.list({search:'x'});token='';await assert.rejects(api.list(),/Sessão encerrada/);assert.equal(requests.length,2);assert.equal(requests[1][1],'Bearer second');}finally{globalThis.fetch=old;}
});
test('UI autenticada só salva mensagem fictícia, sem ação de envio ou recepção',async()=>{
 const [,{mountAtendimentoPersistente}]=await ready;
 const dom=new JSDOM(fs.readFileSync(require.resolve('../atendimento.html'),'utf8'),{url:'https://sistema.voecomkennedy.tur.br/atendimento.html?demo=autenticado'}),d=dom.window.document;
 const chat={id:owner,nome:'Ana Exemplo',phone:'5562999990001',clienteId:'p-ana',cotacaoId:'q-ana',vendaId:'v-ana',origemContato:'',etiquetas:['Proposta'],unread:1,last:{text:'Olá'},context:{cliente:{id:'p-ana',nome:'Ana Exemplo'},origemContato:'Não informada',cotacoes:[],vendas:[]}};
 let composed=0;const api={list:async()=>[chat],messages:async()=>[],read:async()=>{},link:async()=>{},compose:async()=>{composed++;return {id:other};},archive:async()=>{},file:async()=>{}};
 await mountAtendimentoPersistente({root:d,api,authenticated:true});
 assert.equal(d.querySelector('.archive').hidden,true);assert.equal(d.getElementById('at-receive').hidden,true);
 assert.equal(d.querySelector('nav a').getAttribute('href'),'index.html');
 d.getElementById('at-text').value='Somente demonstração';d.getElementById('at-compose').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
 await new Promise(resolve=>setTimeout(resolve,20));assert.equal(composed,1);assert.match(d.getElementById('at-status').textContent,/Nenhuma mensagem foi enviada/);
 dom.window.close();
});
