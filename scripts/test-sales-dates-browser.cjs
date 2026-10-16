// Fresh Chromium profile; synthetic fixtures; all external requests are intercepted.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline');
const source=file=>baseline?require('node:child_process').execFileSync('git',['show','be0bf86f3770f7cf06c19bb49c22a7ae38086035:'+file],{cwd:root}):fs.readFileSync(path.join(root,file));
const person={id:'synthetic-original',tipo:'cliente',nome:'Cliente Sintético'};
const quote={id:'synthetic-quote',clienteId:person.id,nomeCliente:person.nome,status:'aberta',origem:'BSB',destino:'GRU',dataSaidaIda:'2026-12-15',horaSaidaIda:'10:00',tipoViagem:'so-ida',companhiaAerea:'LATAM',valorTotalPix:1500,adultos:1};
const stubs={
 '/js/auth.js':'window.Auth={proteger:async()=>true,logout(){}};',
 '/js/cloud-sync.js':'window.CloudSync={init:async()=>true,agendarBackup(){}};',
 '/js/supabase-config.js':`window.getSupabaseClient=()=>({auth:{getUser:async()=>({data:{user:{id:'synthetic-owner',user_metadata:{}}}}),onAuthStateChange(){}}});`
};
const evidence=process.env.VCK_EVIDENCE_DIR||path.join(root,'evidence');fs.mkdirSync(evidence,{recursive:true});
(async()=>{
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://127.0.0.1').pathname;
  if(stubs[name]){res.setHeader('content-type','text/javascript');return res.end(stubs[name]);}
  const file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  try{res.setHeader('content-type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':name.endsWith('.svg')?'image/svg+xml':'text/html');res.end(source(path.relative(root,file)));}catch{res.writeHead(404);res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;const errors=[],forbidden=[];let passed=0;
 try{
  const binary=process.env.VCK_BROWSER_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  browser=await chromium.launch({headless:true,executablePath:binary});
  const context=await browser.newContext({locale:'pt-BR',timezoneId:'America/Sao_Paulo',viewport:{width:1440,height:1000}});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();
   if(u.pathname.includes('bootstrap.min.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync(process.env.VCK_BOOTSTRAP_CSS||'/tmp/vck-bootstrap.css')});
   if(u.pathname.includes('bootstrap.bundle.min.js'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.VCK_BOOTSTRAP_JS||'/tmp/vck-bootstrap.js')});
   if(['cdn.jsdelivr.net','cdnjs.cloudflare.com','fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname))return route.fulfill({body:''});
   forbidden.push(u.origin);return route.abort();
  });
  await context.addInitScript(({person,quote})=>{
   if(!localStorage.getItem('__seed')){
    localStorage.setItem('__seed','1');localStorage.setItem('emissao_pessoas',JSON.stringify([person]));
    localStorage.setItem('emissao_cotacoes',JSON.stringify([quote]));localStorage.setItem('cotacao_para_venda',JSON.stringify(quote));
   }
   window.alert=()=>{};window.confirm=()=>true;
  },{person,quote});
  const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});
  await page.goto('http://127.0.0.1:'+server.address().port+'/vendas.html?from_cotacao=true');
  await page.waitForFunction(id=>document.getElementById('clienteId').value===id,person.id);
  await page.waitForSelector('#modalVenda.show');
  await page.evaluate(()=>{window.__errors=[];Utils.showError=m=>__errors.push(m);});
  if(baseline){
   // The old quick form creates a second identity then the integrity guard blocks.
   await page.evaluate(async()=>{abrirCadastroClienteRapido();document.getElementById('novoClienteNome').value='Cliente Sintético Nome Completo';await salvarCadastroClienteRapido();window.__errors=[];Utils.showError=m=>__errors.push(m);await salvarVenda();});
   assert.match(await page.evaluate(()=>__errors.join(' ')),/vínculo com a cotação mudou/);
   assert.equal(await page.evaluate(()=>StorageManager.getPessoas().length),2);
   assert.equal(await page.evaluate(()=>StorageManager.getTodasVendas().length),0);
   console.log('REPRODUCED main: quick client completion creates another ID and saving fails at the link guard.');
   await page.evaluate(()=>{document.getElementById('dataEmbarque').value='2020-01-01';validarDatasVenda();});
   assert.equal(await page.locator('#dataEmbarque').evaluate(el=>el.validity.valid),true);
   console.log('REPRODUCED main: a new trip accepts a past departure.');
   await page.screenshot({path:path.join(evidence,'baseline-conversion.png')});return;
  }
  await page.getByRole('button',{name:'Completar cadastro do cliente vinculado',exact:true}).click();
  await page.locator('#novoClienteNome').fill('Cliente Sintético Nome Completo');
  await page.evaluate(()=>salvarCadastroClienteRapido());
  assert.equal(await page.evaluate(()=>StorageManager.getPessoas().length),1);
  assert.equal(await page.locator('#clienteId').inputValue(),person.id);
  await page.locator('#valorVenda').fill('150045');await page.locator('#valorVenda').dispatchEvent('input');
  await page.locator('#valorCusto').fill('140022');await page.locator('#valorCusto').dispatchEvent('input');
  assert.match(await page.locator('#valorLucro').inputValue(),/100,23/);
  await page.locator('#valorCusto').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(evidence,'sales-finance.png')});
  await page.locator('#formaPagamento').selectOption('pix');
  await page.locator('#clienteViaja').check();
  await page.evaluate(()=>gerarCamposPassageiros());
  await page.locator('#localizador_1').fill('SINT123');
  await page.locator('#observacoes').fill('Dados sintéticos para revisão');
  await page.locator('#dataVolta').fill('2026-01-01');await page.locator('#dataVolta').dispatchEvent('input');
  await page.evaluate(()=>salvarVenda());
  assert.equal(await page.evaluate(()=>document.activeElement.id),'dataVolta');
  assert.match(await page.locator('#dataVolta-date-error').innerText(),/01\/01\/2027/);
  assert.equal(await page.locator('#dataVolta').inputValue(),'2026-01-01');
  await page.screenshot({path:path.join(evidence,'sales-date-error.png')});
  await page.locator('#dataVolta').fill('2027-01-01');await page.locator('#dataVolta').dispatchEvent('input');
  await page.evaluate(async()=>{await salvarVenda();await salvarVenda();});
  assert.equal(await page.evaluate(()=>StorageManager.getTodasVendas().length),1, JSON.stringify(await page.evaluate(()=>({errors:__errors,invalid:[...document.getElementById('formVenda').elements].filter(el=>el.willValidate&&!el.validity.valid).map(el=>({id:el.id,message:el.validationMessage,value:el.value}))}))));
  assert.equal(await page.evaluate(()=>StorageManager.getTodasVendas()[0].valorLucro),100.23);
  assert.equal(await page.evaluate(()=>StorageManager.getCotacaoById('synthetic-quote').vendaId),'cotacao-synthetic-quote');
  console.log('PASS native conversion: updated original ID, retained fields, cent profit, focused error and idempotent save.');passed++;
  await page.reload();assert.equal(await page.evaluate(()=>StorageManager.getTodasVendas().length),1);
  await page.goto('http://127.0.0.1:'+server.address().port+'/cotacoes.html');
  await page.waitForFunction(()=>document.querySelector('#quadroProposta')?.contentWindow?.TimingUI?.ready,{},{timeout:8000});
  const simple=async(values={})=>{
   await page.evaluate(values=>{
    abrirModalCotacao();
    const fields={nomeCliente:'Cliente Sintético',origemCotacao:'BSB',destinoCotacao:'GRU',companhiaCotacao:'LATAM',tipoTarifa:'Light',quantidadeMilhas:'1000',valorMilheiro:'25',tipoViagem:'ida-volta',dataSaidaIda:'2027-02-01',dataChegadaIda:'2027-02-01',horaSaidaIda:'10:00',horaChegadaIda:'12:00',dataSaidaVolta:'2027-02-05',dataChegadaVolta:'2027-02-05',horaSaidaVolta:'12:00',horaChegadaVolta:'14:00',...values};
    for(const[id,value]of Object.entries(fields))document.getElementById(id).value=value;
    for(const[id,value]of Object.entries({valorPorPessoa:'R$ 1.000,00',valorTotalPix:'R$ 1.000,00',valorParcela:'R$ 100,00',totalParcelado:'R$ 1.000,00'}))document.getElementById(id).textContent=value;
    toggleVolta();
   },values);
   await page.waitForSelector('#modalCotacao.show');
   await page.waitForFunction(()=>!bootstrap.Modal.getInstance(document.getElementById('modalCotacao'))._isTransitioning);
  };
  const simpleCount=await page.evaluate(()=>StorageManager.getCotacoes().length);
  await simple();
  await page.locator('#horaChegadaVolta').fill('10:00');await page.locator('#horaChegadaVolta').dispatchEvent('input');
  assert.equal(await page.locator('#horaChegadaVolta').evaluate(el=>el.validity.customError),true);
  await page.locator('#tipoViagem').selectOption('so-ida');
  assert.equal(await page.locator('#horaChegadaVolta').inputValue(),'10:00');
  assert.equal(await page.locator('#horaChegadaVolta').evaluate(el=>el.disabled&&!el.willValidate&&!el.validity.customError),true);
  await page.locator('#tipoViagem').selectOption('ida-volta');
  assert.equal(await page.locator('#horaChegadaVolta').evaluate(el=>!el.disabled&&el.validity.customError),true);
  await page.locator('#tipoViagem').selectOption('so-ida');
  assert.equal(await page.locator('#formCotacao').evaluate(el=>el.checkValidity()),true);
  await page.evaluate(()=>salvarCotacao());
  await page.waitForSelector('#modalCotacao',{state:'hidden'});
  assert.equal(await page.evaluate(()=>StorageManager.getCotacoes().length),simpleCount+1);
  assert.equal(await page.evaluate(()=>StorageManager.getCotacoes().at(-1).dataSaidaVolta),'');
  console.log('PASS simple quote: hidden invalid return is disabled, round-trip restores validation, one-way saves without discarded return.');passed++;
  await simple({tipoViagem:'so-ida',origemCotacao:'HND',destinoCotacao:'LAX',horaSaidaIda:'17:00',horaChegadaIda:'10:00'});
  await page.locator('#horaChegadaIda').fill('10:00');await page.locator('#horaChegadaIda').dispatchEvent('change');
  assert.equal(await page.locator('#tempoTotalIda').inputValue(),'10h 00m');
  assert.equal(await page.locator('#formCotacao').evaluate(el=>el.checkValidity()),true);
  await page.evaluate(()=>salvarCotacao());await page.waitForSelector('#modalCotacao',{state:'hidden'});
  await simple({origemCotacao:'AKL',destinoCotacao:'LAX',dataSaidaIda:'2027-02-02',horaSaidaIda:'01:00',dataChegadaIda:'2027-02-01',horaChegadaIda:'16:00',dataSaidaVolta:'2027-02-01',horaSaidaVolta:'23:00',dataChegadaVolta:'2027-02-03',horaChegadaVolta:'12:00'});
  assert.equal(await page.locator('#formCotacao').evaluate(el=>el.checkValidity()),true);
  await page.locator('#horaSaidaVolta').fill('15:00');await page.locator('#horaSaidaVolta').dispatchEvent('input');
  assert.match(await page.locator('#horaSaidaVolta').evaluate(el=>el.validationMessage),/depois da chegada/);
  await page.evaluate(()=>salvarCotacao());
  assert.equal(await page.evaluate(()=>document.activeElement.id),'horaSaidaVolta');
  assert.equal(await page.evaluate(()=>StorageManager.getCotacoes().length),simpleCount+2);
  await page.locator('#horaSaidaVolta').fill('23:00');await page.locator('#horaSaidaVolta').dispatchEvent('input');
  await page.evaluate(()=>{calcularTempoVoo('ida');calcularTempoVoo('volta');});
  assert.equal(await page.locator('#tempoTotalVolta').inputValue(),'16h 00m');
  await page.locator('#dataChegadaIda').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(evidence,'simple-quote-date-line.png')});
  await page.evaluate(()=>salvarCotacao());await page.waitForSelector('#modalCotacao',{state:'hidden'});
  assert.equal(await page.evaluate(()=>StorageManager.getCotacoes().length),simpleCount+3);
  console.log('PASS simple quote: HND-LAX earlier local clock is ten hours; date-line round trip saves and still rejects premature return.');passed++;
  await page.locator('#editorProposta > summary').click();
  const editor=page.frames().find(f=>f.url().includes('/cotador/index.html?embedded=1'));
  const set=async(id,value)=>{const el=editor.locator('#'+id);if(await el.evaluate(el=>el.tagName==='SELECT'))await el.selectOption(value);else await el.fill(value);await editor.locator('#'+id).dispatchEvent('input');await editor.locator('#'+id).dispatchEvent('change');};
  await set('p-orig','BSB');await set('p-dest','GRU');
  await set('p-data-chegada-ida','2026-12-15');
  // Keyboard edits native date segments, including the four-digit year.
  await editor.locator('#p-data-ida').fill('2026-12-14');
  await editor.locator('#p-data-ida').focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  const typed=await editor.locator('#p-data-ida').inputValue();
  assert.match(typed,/^\d{4}-\d{2}-\d{2}$/);
  await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
  await page.keyboard.type('2027');await page.keyboard.press('Tab');
  assert.match(await editor.locator('#p-data-ida').inputValue(),/^2027-/);
  console.log('PASS native date keyboard segments and sequential four-digit year typing:',await editor.locator('#p-data-ida').inputValue());passed++;
  await set('p-data-ida','0026-12-15');
  assert.equal(await editor.locator('#p-data-ida').inputValue(),'0026-12-15');
  assert.equal(await editor.locator('#p-data-chegada-ida').inputValue(),'2026-12-15');
  assert.equal(await editor.evaluate(()=>TimingUI.validate('proposta')),false);
  assert.match(await editor.locator('#p-data-ida-date-error').innerText(),/15\/12\/2026/);
  await set('p-data-ida','2026-12-15');await set('p-hora-dep','10:00');await set('p-hora-cheg','12:00');
  await set('p-data-volta','2027-01-01');await set('p-data-chegada-volta','2027-01-01');await set('p-hora-dep-v','10:00');await set('p-hora-cheg-v','12:00');
  assert.equal(await editor.evaluate(()=>TimingUI.validate('proposta')),true);
  await set('p-parada-ida','1escala');await set('p-escala-cidade','GIG');
  await editor.locator('details:has(#p-conexao-ida1-chegada-data) > summary').evaluate(el=>el.click());
  await set('p-conexao-ida1-chegada-data','2026-12-15');await set('p-conexao-ida1-chegada-hora','10:30');
  await set('p-conexao-ida1-saida-data','2026-12-16');await set('p-conexao-ida1-saida-hora','11:00');
  assert.equal(await editor.evaluate(()=>TimingUI.validate('proposta')),false);
  assert.equal(await editor.evaluate(()=>document.activeElement.id),'p-conexao-ida1-saida-data');
  await editor.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.screenshot({path:path.join(evidence,'proposal-connection-error.png')});
  await set('p-conexao-ida1-saida-data','2026-12-15');
  assert.equal(await editor.evaluate(()=>TimingUI.validate('proposta')),true);
  console.log('PASS proposal native dates: incomplete year preserved and suggested, year rollover and connection chronology.');passed++;
  await set('p-data-ida','2020-02-29');assert.equal(await editor.evaluate(()=>TimingUI.validate('proposta')),false);
  await page.setViewportSize({width:390,height:844});await editor.evaluate(()=>DateFields.focus(document.getElementById('p-data-ida')));await editor.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:path.join(evidence,'proposal-mobile-date-error.png')});
  console.log('PASS new past travel blocked, desktop and mobile screenshots saved.');passed++;
  assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
  console.log(`PASS ${passed} browser groups; no JavaScript errors; zero operational or production requests.`);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
