const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('../cotador/node_modules/jsdom');
const ready=import('../js/atendimento-teste-unico.mjs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../atendimento-teste-unico.html'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup({response={data:{estado:'aceito'}},invoke,user={id:'synthetic-owner'},storage}={}){
  const dom=new JSDOM(html,{url:'https://example.invalid/atendimento-teste-unico.html'});
  global.document=dom.window.document;let calls=[];
  const memory=new Map();storage=storage||{getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)};
  const client={functions:{invoke:async(...args)=>{calls.push(args);return invoke?invoke():response;}}};
  const auth={getUser:async()=>user};
  await (await ready).startOneShotPage({client,auth,storage});
  const el=id=>dom.window.document.getElementById(id);
  const submit=()=>{el('test-confirm').checked=true;el('test-confirm').dispatchEvent(new dom.window.Event('change'));el('test-form').dispatchEvent(new dom.window.Event('submit',{cancelable:true}));};
  return{dom,calls,memory,el,submit,client,auth,storage};
}
test('sem sessão não habilita envio e a página mostra texto/destinatário aprovados',async()=>{
  const f=await setup({user:null});assert.equal(f.el('test-form').hidden,true);assert.equal(f.el('test-send').disabled,true);assert.equal(f.calls.length,0);
  assert.match(f.el('test-destination').textContent,/7399/);
  assert.equal(f.el('test-text').textContent,'Teste de conexão do CRM Voecomkennedy. Kennedy, pode responder TESTE RECEBIDO para conferirmos a chegada?');
  assert.equal(f.el('test-login').hidden,false);
});
test('clique duplo faz uma chamada sem corpo e conserva bloqueio após aceite e recarga',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});const f=await setup({invoke:()=>pending});
  assert.equal(f.calls.length,0);f.submit();f.submit();await tick();assert.equal(f.calls.length,1);
  assert.equal(f.el('test-send').disabled,true);assert.deepEqual(f.calls[0],['atendimento-teste-unico',{method:'POST'}]);
  release({data:{estado:'aceito'}});await tick();assert.match(f.el('test-result').textContent,/entrega.*ainda não foi confirmada/);
  f.submit();await tick();assert.equal(f.calls.length,1);
  const reloaded=await setup({storage:f.storage});assert.equal(reloaded.el('test-send').disabled,true);assert.equal(reloaded.el('test-confirm').disabled,true);assert.equal(reloaded.calls.length,0);
});
test('flag desligada mostra ausência de envio sem habilitar repetição',async()=>{
  const f=await setup({response:{error:{context:{status:503,json:async()=>({erro:'Teste desativado ou configuração incompleta.'})}}}});
  f.submit();await tick();assert.equal(f.calls.length,1);assert.match(f.el('test-result').textContent,/Nenhum envio foi iniciado/);assert.equal(f.el('test-send').disabled,true);
});
test('resultado incerto e falha de rede não provocam retry automático',async()=>{
  for(const config of[{response:{data:{estado:'incerto'}}},{invoke:async()=>{throw Error('timeout');}},{response:{error:{context:{status:503,json:async()=>({erro:'Resultado não persistido. Teste reservado; não repetir.'})}}}}]){
    const f=await setup(config);f.submit();await tick();f.submit();await tick();assert.equal(f.calls.length,1);assert.match(f.el('test-result').textContent,/Não repita/);assert.equal(f.el('test-send').disabled,true);
  }
});
test('reserva existente e usuário recusado mostram resultado sem incentivar retry',async()=>{
  for(const status of[409,403]){
    const f=await setup({response:{error:{context:{status,json:async()=>({erro:'recusado'})}}}});f.submit();await tick();assert.equal(f.calls.length,1);assert.equal(f.el('test-send').disabled,true);assert.match(f.el('test-result').textContent,/Nenhum|Nenhuma/);
  }
});
test('falha no bloqueio local ou mudança de sessão impede chamada',async()=>{
  const f=await setup({storage:{getItem:()=>null,setItem(){throw Error('indisponível');}}});f.submit();await tick();assert.equal(f.calls.length,0);
  const changed=await setup();changed.auth.getUser=async()=>({id:'another-owner'});changed.submit();await tick();assert.equal(changed.calls.length,0);assert.match(changed.el('test-result').textContent,/sessão mudou/);
});
