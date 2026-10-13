const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('../cotador/node_modules/jsdom');
const html=fs.readFileSync(require.resolve('../atendimento.html'),'utf8');
const ready=Promise.all([import('../js/atendimento-page.mjs'),import('../js/atendimento-demo.mjs')]);
const idle=f=>new Promise((resolve,reject)=>{
    if(!f.doc.querySelector('button:disabled')) return resolve();
    const observer=new f.dom.window.MutationObserver(()=>{if(!f.doc.querySelector('button:disabled')){observer.disconnect();clearTimeout(timer);resolve();}});
    const timer=setTimeout(()=>{observer.disconnect();reject(new Error('Interface não concluiu a ação em 5 segundos.'));},5000);
    observer.observe(f.doc,{subtree:true,attributes:true,attributeFilter:['disabled']});
});
async function fixture(){ const [page,demo]=await ready;const dom=new JSDOM(html,{url:'http://localhost/atendimento.html?demo=1'}),doc=dom.window.document;const service=demo.createDemo();page.mountAtendimentoPage({service,root:doc});return{dom,doc,service,owner:demo.DEMO_OWNER,click:id=>doc.getElementById(id).click(),submit:id=>doc.getElementById(id).dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}))}; }
test('UI carrega conversas, busca texto, filtra não lidas e marca leitura',async()=>{
    const f=await fixture(),$=id=>f.doc.getElementById(id);
    assert.equal($('at-workspace').hidden,false);assert.equal(f.doc.querySelectorAll('[data-chat-id]').length,2);
    $('at-search').value='Recife';$('at-search').dispatchEvent(new f.dom.window.Event('input'));assert.equal(f.doc.querySelectorAll('[data-chat-id]').length,1);
    $('at-search').value='';$('at-search').dispatchEvent(new f.dom.window.Event('input'));f.click('at-read');await idle(f);
    $('at-unread').checked=true;$('at-unread').dispatchEvent(new f.dom.window.Event('change'));assert.equal(f.doc.querySelectorAll('[data-chat-id]').length,1);
    f.click('at-receive');await idle(f);assert.equal(f.doc.querySelectorAll('[data-chat-id]').length,2);f.dom.window.close();
});
test('UI preserva rascunho por conversa e escapa conteúdo HTML',async()=>{
    const f=await fixture(),input=f.doc.getElementById('at-text'),buttons=()=>[...f.doc.querySelectorAll('[data-chat-id]')];
    input.value='<img src=x onerror=alert(1)>';input.dispatchEvent(new f.dom.window.Event('input'));buttons()[1].click();assert.equal(input.value,'');buttons()[0].click();assert.match(input.value,/<img/);
    f.submit('at-compose');await idle(f);assert.equal(f.doc.querySelectorAll('.timeline img').length,0);assert.match(f.doc.getElementById('at-messages').textContent,/<img/);f.dom.window.close();
});
test('UI PDF e falha/retry usam bytes e a mesma mensagem; incerto bloqueia repetição',async()=>{
    const f=await fixture(),$=id=>f.doc.getElementById(id);f.click('at-sample-pdf');await idle(f);
    assert.match($('at-attachment').textContent,/proposta-exemplo.pdf/);$('at-outcome').value='failure';f.submit('at-compose');await idle(f);
    assert.equal(f.service.export(f.owner).files.length,1);const retry=f.doc.querySelector('[data-retry]');assert.ok(retry);retry.click();await idle(f);assert.match($('at-messages').textContent,/Sucesso simulado/);
    $('at-outcome').value='uncertain';$('at-text').value='Teste incerto';f.submit('at-compose');await idle(f);assert.match($('at-messages').textContent,/Repetição bloqueada/);assert.equal(f.doc.querySelector('[data-retry]'),null);f.dom.window.close();
});
test('UI erro de validação preserva rascunho e alteração de vínculo é explícita',async()=>{
    const f=await fixture(),$=id=>f.doc.getElementById(id);f.submit('at-compose');await idle(f);assert.equal($('at-error').hidden,false);
    $('at-origin').value='Não inferir origem';$('at-tags').value='Novo rótulo';f.submit('at-link');await idle(f);assert.match($('at-context').textContent,/Não inferir origem/);assert.match($('at-chats').textContent,/Novo rótulo/);f.dom.window.close();
});
