// Fresh headless context and loopback fixtures only. No existing browser profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const empty = () => Object.fromEntries(['emissao_vendas','emissao_pessoas','emissao_pacotes','emissao_cotacoes'].map(k=>[k,[]]));
const pageSource = `<!doctype html><html><body><script src="/js/integrity-store.js"></script><script src="/js/storage.js"></script><script src="/js/cloud-sync.js"></script><script>
window.boot=async owner=>{CloudSync._userId=owner;CloudSync._prepararCacheDoUsuario();CloudSync.agendarBackup=()=>{};await IntegrityStore.init(owner);};
</script></body></html>`;
let rows = new Map(), histories = new Map(), forbidden = [], commits = 0, failNext = false, lostAckNext = false, holdNext = false, held = [];
const mockSource = `window.getSupabaseClient=()=>({from(table){let op={table,kind:'read',filters:{}};const send=()=>fetch('/__mock_cas',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(op)}).then(r=>r.json());const c={select(){return c},eq(k,v){op.filters[k]=v;return c},order(){return c},range(a,b){op.range=[a,b];return send()},update(v){op.kind='update';op.payload=v;return c},insert(v){op.kind='insert';op.payload=v;return c},maybeSingle:send};return c}});`;

(async()=>{
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/__fixture'){res.setHeader('content-type','text/html');res.end(pageSource);return;}
  if(req.url==='/__mock_cas'){
   let data='';for await(const part of req)data+=part;
   const op=JSON.parse(data),owner=op.filters.user_id||op.payload?.user_id;
   let row=rows.get(owner),result;
   if(op.table==='dados_app_historico')result={data:(histories.get(owner)||[]).slice().reverse().slice(op.range?.[0]||0,(op.range?.[1]||49)+1),error:null};
   else if(op.kind==='read')result={data:row||null,error:null};
   else if(failNext){failNext=false;result={data:null,error:{message:'synthetic transport failure'}};}
   else if(op.kind==='insert' && row)result={data:null,error:{code:'23505',message:'synthetic unique owner'}};
   else if(op.kind==='update' && row?.versao!==op.filters.versao)result={data:null,error:null};
   else{rows.set(owner,op.payload);commits++;
    histories.set(owner,[...(histories.get(owner)||[]),{operacao_id:op.payload.ultima_operacao_id,versao_antes:row?.versao,versao_depois:op.payload.versao,conteudo_antes:row?.conteudo,conteudo_depois:op.payload.conteudo,criado_em:'2026-10-14T00:00:00Z'}]);
    result=lostAckNext?{data:null,error:{message:'synthetic lost reply'}}:{data:{versao:op.payload.versao,atualizado_em:op.payload.atualizado_em},error:null};lostAckNext=false;
   }
   const reply=()=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(result))};
   if(holdNext && op.kind!=='read'){holdNext=false;held.push(reply);}else reply();return;
  }
  const file=path.resolve(root,'.'+new URL(req.url,'http://127.0.0.1').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'text/plain');res.end(fs.readFileSync(file));}
  catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url='http://127.0.0.1:'+server.address().port;
 let browser,passed=0;
 try{
  const binary=process.env.VCK_BROWSER_BIN || [chromium.executablePath(),'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p=>fs.existsSync(p));
  if(!binary)throw new Error('Install a test Chromium binary or set VCK_BROWSER_BIN. Existing user profiles are never used.');
  browser=await chromium.launch({headless:true,executablePath:binary});
  async function test(name,fn){
   const filters=process.argv.filter(arg=>arg.startsWith('--case=')).map(arg=>arg.slice(7));
   if(filters.length && !filters.some(filter=>name.includes(filter)))return;
   rows=new Map();histories=new Map();commits=0;failNext=false;lostAckNext=false;holdNext=false;held=[];
   const context=await browser.newContext();
   await context.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='127.0.0.1')return route.continue();
    if(u.pathname.includes('bootstrap.bundle'))return route.fulfill({contentType:'text/javascript',body:'window.bootstrap={Modal:class{show(){}hide(){}},Tooltip:class{},Toast:class{show(){}}};'});
    if(['cdn.jsdelivr.net','cdnjs.cloudflare.com','fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname))return route.fulfill({body:''});
    forbidden.push(u.origin);return route.abort();
   });
   try{await fn(context);passed++;console.log('PASS '+name);}finally{await context.close();}
  }
  const fixture=async(context,owner=A)=>{const page=await context.newPage();await page.goto(url+'/__fixture');await page.evaluate(o=>boot(o),owner);return page;};
  const createContact=p=>p.evaluate(()=>StorageManager.gravar('addPessoa',[{tipo:'cliente',nome:'Contato sintético'}]));
  async function appContext(c){
   await c.route('**/js/auth.js*',r=>r.fulfill({contentType:'text/javascript',body:`window.Auth={proteger:async()=>true,getUserId:async()=>${JSON.stringify(A)},_saidaSolicitada:false};`}));
   await c.route('**/js/supabase-config.js*',r=>r.fulfill({contentType:'text/javascript',body:mockSource}));
  }
  async function appPage(c,name='pessoas'){
   const p=await c.newPage();p.setDefaultTimeout(8000);await p.goto(url+'/'+name+'.html');
   await p.waitForFunction(()=>document.documentElement.dataset.appAutenticado==='true');
   await p.evaluate(()=>{CloudSync._programarEnvio=()=>{};window.__errors=[];if(window.Utils)Utils.showError=m=>__errors.push(m)});return p;
  }
  await test('two native tabs preserve simultaneous inclusions',async c=>{
   const p=await fixture(c),q=await fixture(c);
   await Promise.all([createContact(p),createContact(q)]);
   const count=await p.evaluate(async()=>{await IntegrityStore.refresh();return StorageManager.getPessoas().length});assert.equal(count,2);
   assert.equal(await p.evaluate(async()=>(await IntegrityStore.history()).length),2);
  });
  await test('two editors reject an old record after other-tab commit',async c=>{
   const p=await fixture(c),contact=await createContact(p),q=await fixture(c);
   for(const page of[p,q])await page.evaluate(id=>StorageManager.abrirEditor('PESSOAS',id),contact.id);
   await p.evaluate(id=>StorageManager.gravar('updatePessoa',[id,{nome:'Primeira revisão sintética'}]),contact.id);
   const failure=await q.evaluate(async id=>{try{await StorageManager.gravar('updatePessoa',[id,{nome:'Editor antigo'}]);return null}catch(e){return e.code}},contact.id);
   assert.equal(failure,'INTEGRITY_CONFLICT');
   assert.equal(await q.evaluate(async()=>{await IntegrityStore.refresh();return StorageManager.getPessoas()[0].nome}),'Primeira revisão sintética');
  });
  await test('three proposals for one contact preserve ten passengers after reload',async c=>{
   const p=await fixture(c),contact=await createContact(p);
   for(const count of[4,3,3])await p.evaluate(({id,count})=>StorageManager.gravar('addCotacao',[{clienteId:id,totalPassageiros:count,propostaRevisao:1}]),{id:contact.id,count});
   await p.reload();await p.evaluate(o=>boot(o),A);
   const stats=await p.evaluate(()=>{const q=StorageManager.getCotacoes();return[q.length,new Set(q.map(x=>x.id)).size,q.reduce((n,x)=>n+x.totalPassageiros,0)]});assert.deepEqual(stats,[3,3,10]);
  });
  await test('conversion failure rolls back both sale and quote',async c=>{
   const p=await fixture(c),contact=await createContact(p);
   const quote=await p.evaluate(id=>StorageManager.gravar('addCotacao',[{clienteId:id,status:'aberta'}]),contact.id);
   const result=await p.evaluate(async id=>{
    const finish=StorageManager.concluirConversaoCotacao;StorageManager.concluirConversaoCotacao=()=>{throw new Error('synthetic interruption')};
    try{await StorageManager.gravar('salvarConversaoCotacao',[id,{clienteId:StorageManager.getPessoas()[0].id,valorVenda:100}])}catch{}finally{StorageManager.concluirConversaoCotacao=finish}
    return[StorageManager.getTodasVendas().length,StorageManager.getCotacaoById(id).status,(await IntegrityStore.history()).length];
   },quote.id);assert.deepEqual(result,[0,'aberta',2]);
  });
  await test('conversion reload/repeat retains one original sale',async c=>{
   const p=await fixture(c),contact=await createContact(p);
   const q=await p.evaluate(id=>StorageManager.gravar('addCotacao',[{clienteId:id,status:'aberta'}]),contact.id);
   await p.evaluate(q=>StorageManager.gravar('salvarConversaoCotacao',[q.id,{clienteId:q.clienteId,valorVenda:100}]),q);
   await p.reload();await p.evaluate(o=>boot(o),A);
   await p.evaluate(q=>StorageManager.gravar('salvarConversaoCotacao',[q.id,{clienteId:q.clienteId,valorVenda:999}]),q);
   assert.deepEqual(await p.evaluate(()=>StorageManager.getTodasVendas().map(s=>s.valorVenda)),[100]);
  });
  await test('durable uncertain request survives reload; old ack retains new edit',async c=>{
   const p=await fixture(c);await createContact(p);
   const saved=await p.evaluate(async()=>{const body=JSON.parse(JSON.stringify(IntegrityStore.state.body));const attempt=await IntegrityStore.prepareAttempt(body,1);return{body,id:attempt.id}});
   await createContact(p);await p.reload();await p.evaluate(o=>boot(o),A);
   assert.equal(await p.evaluate(async()=>(await IntegrityStore.attempts()).length),1);
   await p.evaluate(body=>IntegrityStore.metadata({version:2,body}),saved.body);
   assert.deepEqual(await p.evaluate(()=>[IntegrityStore.state.pending,StorageManager.getPessoas().length]),[true,2]);
  });
  await test('account switch preserves private namespace and rejects late mutation',async c=>{
   const p=await fixture(c);await createContact(p);
   const late=await p.evaluate(async()=>{const op=IntegrityStore.transact(body=>body.emissao_pessoas.push({id:'late'}));IntegrityStore.suspend();try{await op;return null}catch(e){return e.code}});assert.equal(late,'INTEGRITY_SCOPE');
   await p.evaluate(o=>boot(o),B);assert.equal(await p.evaluate(()=>StorageManager.getPessoas().length),0);
   assert.equal(await p.evaluate(async()=>(await IntegrityStore.history()).length),0);
   await p.evaluate(o=>boot(o),A);assert.equal(await p.evaluate(()=>StorageManager.getPessoas().length),1);
  });
  await test('selective recovery is read-only preview and a new revision',async c=>{
   const p=await fixture(c),contact=await createContact(p);
   const q=await p.evaluate(id=>StorageManager.gravar('addCotacao',[{clienteId:id,observacao:'Primeira',propostaRevisao:1}]),contact.id);
   await p.evaluate(async q=>{
    const source=(await IntegrityStore.history()).at(-1).after;
    await StorageManager.gravar('addCotacao',[{clienteId:q.clienteId,observacao:'Independente'}]);
    await StorageManager.gravar('updateCotacao',[q.id,{observacao:'Segunda',propostaRevisao:2}]);
    const before=IntegrityStore.state.revision;const preview=await IntegrityStore.previewQuote(source,q.id);
    if(IntegrityStore.state.revision!==before)throw new Error('Preview mutated state');
    await IntegrityStore.restoreQuote(preview);
   },q);
   assert.deepEqual(await p.evaluate(()=>StorageManager.getCotacoes().map(q=>q.observacao)),['Primeira','Independente']);
   assert.equal(await p.evaluate(async()=>(await IntegrityStore.history()).length),5);
  });
  await test('stale recovery preview cannot replace later edit',async c=>{
   const p=await fixture(c),contact=await createContact(p);
   const result=await p.evaluate(async id=>{
    const q=await StorageManager.gravar('addCotacao',[{clienteId:id,observacao:'Primeira'}]);
    const source=(await IntegrityStore.history()).at(-1).after,preview=await IntegrityStore.previewQuote(source,q.id);
    await StorageManager.gravar('updateCotacao',[q.id,{observacao:'Posterior'}]);
    try{await IntegrityStore.restoreQuote(preview);return null}catch(e){return[e.code,StorageManager.getCotacaoById(q.id).observacao]}
   },contact.id);assert.deepEqual(result,['INTEGRITY_CONFLICT','Posterior']);
  });
  await test('deleted proposal can be recovered without deleting other proposals',async c=>{
   const p=await fixture(c),contact=await createContact(p);
   await p.evaluate(async id=>{
    const q=await StorageManager.gravar('addCotacao',[{clienteId:id,observacao:'Recuperar'}]);
    const source=(await IntegrityStore.history()).at(-1).after;
    await StorageManager.gravar('addCotacao',[{clienteId:id,observacao:'Conservar'}]);
    await StorageManager.gravar('deleteCotacao',[q.id]);
    await IntegrityStore.restoreQuote(await IntegrityStore.previewQuote(source,q.id));
   },contact.id);
   assert.deepEqual(await p.evaluate(()=>StorageManager.getCotacoes().map(q=>q.observacao)),['Conservar','Recuperar']);
  });
  await test('raw synchronous storage methods fail closed after initialization',async c=>{
   const p=await fixture(c);
   assert.equal(await p.evaluate(()=>{try{StorageManager.addPessoa({nome:'Bypass'});return null}catch(e){return e.code}}),'INTEGRITY_WRITE_REQUIRED');
   assert.equal(await p.evaluate(()=>StorageManager.getPessoas().length),0);
  });
  await test('real People form preserves stale editor and displays conflict',async c=>{
   rows=new Map([[A,{user_id:A,versao:1,conteudo:{...empty(),emissao_pessoas:[{id:'synthetic-client',tipo:'cliente',nome:'Contato Sintético'}]}}]]);
   await c.route('**/js/auth.js*',r=>r.fulfill({contentType:'text/javascript',body:`window.Auth={proteger:async()=>true,getUserId:async()=>${JSON.stringify(A)},_saidaSolicitada:false};`}));
   await c.route('**/js/supabase-config.js*',r=>r.fulfill({contentType:'text/javascript',body:mockSource}));
   const p=await c.newPage(),q=await c.newPage();
   for(const page of[p,q]){await page.goto(url+'/pessoas.html');await page.waitForFunction(()=>document.documentElement.dataset.appAutenticado==='true');await page.evaluate(()=>{window.__errors=[];Utils.showError=m=>__errors.push(m);abrirModalPessoa('synthetic-client')});}
   await p.fill('#nome','Nome Atual Sintético');await p.evaluate(()=>salvarPessoa());
   await q.fill('#nome','Nome Editor Antigo');await q.evaluate(()=>salvarPessoa());
   assert.match(await q.evaluate(()=>__errors.join(' ')),/mudou em outra aba/);
   assert.equal(await q.inputValue('#nome'),'Nome Editor Antigo');
   assert.equal(await q.evaluate(async()=>{await IntegrityStore.refresh();return StorageManager.getPessoas()[0].nome}),'Nome Atual Sintético');
  });
  await test('same legacy ID in different collections returns the correct saved entity',async c=>{
   const p=await fixture(c);
   const result=await p.evaluate(async()=>{
    await IntegrityStore.transact(body=>{body.emissao_pessoas.push({id:'shared-id',nome:'Pessoa'});body.emissao_cotacoes.push({id:'shared-id',observacao:'Cotação'});});
    return StorageManager.gravar('updateCotacao',['shared-id',{observacao:'Cotação atualizada'}]);
   });assert.equal(result.observacao,'Cotação atualizada');assert.equal(result.nome,undefined);
  });
  await test('IDB quota fault rolls back state and history together',async c=>{
   const p=await fixture(c);await createContact(p);
   const result=await p.evaluate(async()=>{
    const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='accounts')throw new DOMException('synthetic quota','QuotaExceededError');return put.apply(this,args)};
    let failed=false;try{await StorageManager.gravar('addPessoa',[{nome:'Não gravar'}])}catch{failed=true}finally{IDBObjectStore.prototype.put=put}
    await IntegrityStore.refresh();return[failed,StorageManager.getPessoas().length,(await IntegrityStore.history()).length];
   });assert.deepEqual(result,[true,1,1]);
  });
  await test('projection quota retains committed authority and reload recovers it',async c=>{
   const p=await fixture(c);
   const result=await p.evaluate(async()=>{
    let events=0;document.addEventListener('integrity:projection-error',()=>events++);
    const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='emissao_pessoas')throw new DOMException('synthetic projection quota','QuotaExceededError');return set.call(this,key,value)};
    try{await StorageManager.gravar('addPessoa',[{nome:'Preservada'}])}finally{Storage.prototype.setItem=set}
    return[StorageManager.getPessoas().length,(await IntegrityStore.history()).length,events];
   });assert.deepEqual(result,[1,1,1]);await p.reload();await p.evaluate(o=>boot(o),A);assert.equal(await p.evaluate(()=>StorageManager.getPessoas().length),1);
  });
  await test('legacy tab bypass is preserved and blocks writes even when backup fails',async c=>{
   const p=await fixture(c);await createContact(p);const q=await fixture(c);
   await p.evaluate(()=>{CloudSync._preservarCache=()=>{throw new Error('synthetic recovery quota')}});
   await q.evaluate(()=>Storage.prototype.setItem.call(localStorage,'emissao_pessoas',JSON.stringify([{id:'legacy-change'}])));
   await p.waitForFunction(()=>IntegrityStore._blocked===true);
   assert.equal(await p.evaluate(async()=>{try{await StorageManager.gravar('addPessoa',[{nome:'Blocked'}]);return null}catch(e){return e.code}}),'INTEGRITY_SCOPE');
  });
  await test('partially projected conversion reloads its complete durable sale and quote',async c=>{
   const p=await fixture(c),contact=await createContact(p);
   const quote=await p.evaluate(id=>StorageManager.gravar('addCotacao',[{clienteId:id,status:'aberta'}]),contact.id);
   await p.evaluate(async quote=>{
    const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='emissao_cotacoes')throw new DOMException('synthetic last-collection quota','QuotaExceededError');return set.call(this,key,value)};
    try{await StorageManager.gravar('salvarConversaoCotacao',[quote.id,{clienteId:quote.clienteId,valorVenda:100}])}finally{Storage.prototype.setItem=set}
   },quote);
   await p.addInitScript(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='emissao_cache_recuperacao_v1')throw new DOMException('synthetic full backup quota','QuotaExceededError');return set.call(this,key,value)}});
   await p.reload();await p.evaluate(o=>boot(o),A);
   assert.deepEqual(await p.evaluate(id=>[StorageManager.getTodasVendas().length,StorageManager.getCotacaoById(id).status],quote.id),[1,'convertida']);
  });
  await test('old tab cannot read or mutate the new account through legacy fallback',async c=>{
   const p=await fixture(c);await createContact(p);const q=await fixture(c,B);
   await p.waitForFunction(()=>IntegrityStore.ready===false);
   const denied=await p.evaluate(()=>{
    const codes=[];for(const call of[()=>StorageManager.getPessoas(),()=>StorageManager.gravar('addPessoa',[{nome:'Conta antiga'}])])try{call();codes.push(null)}catch(e){codes.push(e.code)}return codes;
   });assert.deepEqual(denied,['INTEGRITY_SCOPE','INTEGRITY_SCOPE']);assert.equal(await q.evaluate(()=>StorageManager.getPessoas().length),0);
  });
  await test('full cloud sends across two tabs share one confirmed snapshot',async c=>{
   rows.set(A,{user_id:A,versao:1,conteudo:empty()});await appContext(c);
   const p=await appPage(c),q=await appPage(c);await Promise.all([createContact(p),createContact(q)]);
   await Promise.all([p.evaluate(()=>CloudSync.enviarParaNuvem()),q.evaluate(()=>CloudSync.enviarParaNuvem())]);
   assert.equal(commits,1);assert.equal(rows.get(A).conteudo.emissao_pessoas.length,2);
   for(const page of[p,q])assert.deepEqual(await page.evaluate(async()=>{await IntegrityStore.refresh();return[IntegrityStore.state.pending,(await IntegrityStore.attempts()).length]}),[false,0]);
  });
  await test('lost cloud reply plus later edit resumes after actual reload without overwrite choice',async c=>{
   rows.set(A,{user_id:A,versao:1,conteudo:empty()});await appContext(c);const p=await appPage(c);await createContact(p);
   lostAckNext=true;assert.equal(await p.evaluate(()=>CloudSync.enviarParaNuvem()),false);await createContact(p);
   await p.reload();await p.waitForFunction(()=>document.documentElement.dataset.appAutenticado==='true',{},{timeout:8000});
   await p.evaluate(()=>{CloudSync._programarEnvio=()=>{}});assert.equal(await p.evaluate(()=>CloudSync._conflitoPendente),null);
   await p.evaluate(()=>CloudSync.enviarParaNuvem());assert.equal(rows.get(A).conteudo.emissao_pessoas.length,2);
   assert.equal(await p.evaluate(()=>IntegrityStore.state.pending),false);
  });
  await test('failed local ack stays pending and retry recognizes the committed cloud request',async c=>{
   rows.set(A,{user_id:A,versao:1,conteudo:empty()});await appContext(c);const p=await appPage(c);await createContact(p);
   const result=await p.evaluate(async()=>{
    const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='accounts')throw new DOMException('synthetic ack quota','QuotaExceededError');return put.apply(this,args)};
    let ok;try{ok=await CloudSync.enviarParaNuvem()}finally{IDBObjectStore.prototype.put=put}
    return[ok,IntegrityStore.state.pending,(await IntegrityStore.attempts()).length];
   });assert.deepEqual(result,[false,true,1]);assert.equal(commits,1);
   assert.equal(await p.evaluate(()=>CloudSync.tentarNovamente()),true);assert.equal(commits,1);
   assert.equal(await p.evaluate(()=>IntegrityStore.state.pending),false);
  });
  await test('cloud error keeps durable changes and explicit retry confirms them',async c=>{
   rows.set(A,{user_id:A,versao:1,conteudo:empty()});await appContext(c);const p=await appPage(c);await createContact(p);
   failNext=true;assert.equal(await p.evaluate(()=>CloudSync.enviarParaNuvem()),false);assert.equal(commits,0);
   assert.equal(await p.evaluate(()=>CloudSync.tentarNovamente()),true);assert.equal(commits,1);assert.equal(await p.evaluate(()=>IntegrityStore.state.pending),false);
  });
  await test('old cloud ack during a newer native edit cannot turn the indicator green',async c=>{
   rows.set(A,{user_id:A,versao:1,conteudo:empty()});await appContext(c);const p=await appPage(c);await createContact(p);
   holdNext=true;await p.evaluate(()=>{window.__send=CloudSync.enviarParaNuvem();});
   const limit=Date.now()+5000;while(!held.length){if(Date.now()>limit)throw new Error('Synthetic held reply did not arrive');await new Promise(r=>setTimeout(r,5));}
   await createContact(p);held.shift()();await p.evaluate(()=>window.__send);
   assert.deepEqual(await p.evaluate(()=>[IntegrityStore.state.pending,CloudSync._backupPendente,StorageManager.getPessoas().length]),[true,true,2]);
   await p.evaluate(()=>CloudSync.enviarParaNuvem());assert.equal(rows.get(A).conteudo.emissao_pessoas.length,2);
  });
  await test('actual recovery UI previews without writing and restores only the chosen proposal',async c=>{
   await appContext(c);const seed=await fixture(c),contact=await createContact(seed);
   const quote=await seed.evaluate(async id=>{
    const q=await StorageManager.gravar('addCotacao',[{clienteId:id,observacao:'Antiga',propostaRevisao:1}]);
    await StorageManager.gravar('addCotacao',[{clienteId:id,observacao:'Independente'}]);
    await StorageManager.gravar('updateCotacao',[q.id,{observacao:'Atual',propostaRevisao:2}]);return q;
   },contact.id);
   const body=await seed.evaluate(()=>IntegrityStore.state.body);rows.set(A,{user_id:A,versao:1,conteudo:body});
   const p=await appPage(c,'integridade');await p.waitForFunction(()=>document.querySelectorAll('#historyVersion option').length>1);
   // Reverse local history: revisions 4,3,2,1; revision 2 contains the old quote.
   await p.selectOption('#historyVersion','2');await p.selectOption('#historyQuote',quote.id);
   const revision=await p.evaluate(()=>IntegrityStore.state.revision);await p.click('#previewRecovery');await p.waitForFunction(()=>!document.getElementById('recoveryPreview').hidden);
   assert.equal(await p.evaluate(()=>IntegrityStore.state.revision),revision);assert.match(await p.textContent('#recoveryAfter'),/Antiga/);
   p.once('dialog',d=>d.accept());await p.click('#applyRecovery');await p.waitForFunction(()=>document.getElementById('historyStatus').textContent.includes('recuperada neste aparelho'));
   assert.deepEqual(await p.evaluate(()=>StorageManager.getCotacoes().map(q=>q.observacao)),['Antiga','Independente']);
   await p.evaluate(()=>CloudSync.enviarParaNuvem());assert.equal(rows.get(A).conteudo.emissao_cotacoes.length,2);
   await p.reload();await p.waitForFunction(()=>document.documentElement.dataset.appAutenticado==='true');
   assert.deepEqual(await p.evaluate(()=>StorageManager.getCotacoes().map(q=>q.observacao)),['Antiga','Independente']);
  });
  await test('actual recovery UI refuses a preview invalidated by another tab',async c=>{
   await appContext(c);const seed=await fixture(c),contact=await createContact(seed);
   const quote=await seed.evaluate(id=>StorageManager.gravar('addCotacao',[{clienteId:id,observacao:'Antiga'}]),contact.id);
   rows.set(A,{user_id:A,versao:1,conteudo:await seed.evaluate(()=>IntegrityStore.state.body)});
   const p=await appPage(c,'integridade');await p.waitForFunction(()=>document.querySelectorAll('#historyVersion option').length>1);
   await p.selectOption('#historyVersion','0');await p.selectOption('#historyQuote',quote.id);await p.click('#previewRecovery');await p.waitForFunction(()=>!document.getElementById('recoveryPreview').hidden);
   await seed.evaluate(q=>StorageManager.gravar('updateCotacao',[q.id,{observacao:'Posterior'}]),quote);
   p.once('dialog',d=>d.accept());await p.click('#applyRecovery');await p.waitForFunction(()=>document.getElementById('historyStatus').textContent.includes('mudaram depois da prévia'));
   assert.equal(await p.evaluate(async()=>{await IntegrityStore.refresh();return StorageManager.getCotacoes()[0].observacao}),'Posterior');
  });
  await test('native quotation form keeps three independent proposals and edits only one',async c=>{
   rows.set(A,{user_id:A,versao:1,conteudo:{...empty(),emissao_pessoas:[{id:'client-1',tipo:'cliente',nome:'Contato Sintético'}]}});
   await appContext(c);const p=await appPage(c,'cotacoes');await p.waitForFunction(()=>typeof document.getElementById('quadroProposta').contentWindow?.coletarDadosProposta==='function' && document.getElementById('quadroProposta').contentWindow.TimingUI?.ready===true);
   for(const pax of[4,3,3])await p.evaluate(async pax=>{
    novaPropostaCompleta();selecionarContatoProposta('client-1');const f=document.getElementById('quadroProposta').contentWindow;
    // This fixture has no account card-rate service. Choose the real, valid
    // no-interest mode; do not bypass the application's with-interest guard.
    f.document.getElementById('p-com-juros').checked=false;
    f.document.getElementById('p-com-juros').dispatchEvent(new f.Event('change',{bubbles:true}));
    for(const[id,value]of Object.entries({'p-orig':'BSB','p-dest':'POA','p-data-ida':'2027-10-27','p-hora-dep':'10:10','p-hora-cheg':'12:45','p-data-volta':'2027-11-02','p-hora-dep-v':'05:15','p-hora-cheg-v':'07:45','p-cia':'LATAM','p-classe':'Economica','p-adultos':String(pax),'p-val-total-pix':String(pax*1000),'p-val-pix-pessoa':'1000','p-val-cartao':String(pax*1100),'p-parcelas':'10','p-obs':'Proposta sintética '+pax})){
     const el=f.document.getElementById(id);el.value=value;el.dispatchEvent(new f.Event('input',{bubbles:true}));el.dispatchEvent(new f.Event('change',{bubbles:true}));
    }
    const toasts=[];const toast=f.showToast;f.showToast=message=>{toasts.push(message);return toast(message)};
    const proposal=f.coletarDadosProposta();f.showToast=toast;
    if(!proposal)throw new Error('Invalid synthetic quotation form: '+JSON.stringify({toasts,timingReady:f.TimingUI?.ready,invalid:[...f.document.querySelectorAll('#panel-proposta input,#panel-proposta select')].filter(el=>!el.checkValidity()).map(el=>({id:el.id,type:el.type,message:el.validationMessage})),clientPresent:!!f.document.getElementById('p-cliente').value}));await salvarPropostaCompleta();
   },pax);
   const initial=await p.evaluate(()=>StorageManager.getCotacoes());assert.equal(initial.length,3);assert.equal(initial.reduce((n,q)=>n+q.totalPassageiros,0),10);
   await p.evaluate(async id=>{await editarPropostaCompleta(id);document.getElementById('quadroProposta').contentWindow.document.getElementById('p-obs').value='Somente primeira';await salvarPropostaCompleta()},initial[0].id);
   const updated=await p.evaluate(()=>StorageManager.getCotacoes());assert.equal(updated[0].observacao,'Somente primeira');assert.deepEqual(updated.slice(1),initial.slice(1));
   await p.evaluate(()=>CloudSync.enviarParaNuvem());await p.reload();await p.waitForFunction(()=>document.documentElement.dataset.appAutenticado==='true');
   assert.equal(await p.evaluate(()=>StorageManager.getCotacoes().length),3);
  });
  await test('contact save after Novo preserves contact without retargeting the new form',async c=>{
   rows.set(A,{user_id:A,versao:1,conteudo:{...empty(),emissao_pessoas:[{id:'client-1',tipo:'cliente',nome:'Contato Sintético'}]}});
   await appContext(c);const p=await appPage(c,'cotacoes');await p.waitForFunction(()=>typeof document.getElementById('quadroProposta').contentWindow?.coletarDadosProposta==='function' && document.getElementById('quadroProposta').contentWindow.TimingUI?.ready===true);
   await p.evaluate(()=>{
    const save=StorageManager.gravar;window.__restoreSave=()=>{StorageManager.gravar=save};
    StorageManager.gravar=function(method,args,options){return method==='addPessoa'?new Promise(resolve=>{window.__resumeContact=()=>resolve(save.call(this,method,args,options))}):save.call(this,method,args,options)};
    abrirCadastroContatoProposta();document.getElementById('contatoPropostaNome').value='Novo';document.getElementById('contatoPropostaSobrenome').value='Contato';document.getElementById('contatoPropostaWhatsapp').value='61999990000';
    window.__contact=salvarContatoProposta();novaPropostaCompleta();
   });
   await p.evaluate(async()=>{__resumeContact();await __contact;__restoreSave()});
   assert.equal(await p.evaluate(()=>StorageManager.getClientes().length),2);assert.equal(await p.inputValue('#clienteProposta'),'');
  });
  await test('backup scheduling failure cannot report an already durable mutation as failed',async c=>{
   const p=await fixture(c);
   const result=await p.evaluate(async()=>{
    CloudSync.agendarBackup=()=>{throw new Error('synthetic scheduler failure')};
    const person=await StorageManager.gravar('addPessoa',[{nome:'Durável'}]);
    return[!!person.id,StorageManager.getPessoas().length,IntegrityStore.state.pending,CloudSync._backupPendente];
   });assert.deepEqual(result,[true,1,true,true]);
  });
  assert.equal(forbidden.length,0,'Unexpected external request');
  console.log(JSON.stringify({passed,failed:0,production_requests:0,playwright:require('playwright/package.json').version,browser:browser.version(),scope:'fresh native browser contexts and synthetic loopback fixtures'}));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);process.exitCode=1});
