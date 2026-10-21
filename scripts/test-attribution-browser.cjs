// QA local: perfil descartável, dados sintéticos e rede operacional bloqueada.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),evidence=path.resolve(root,'../evidence-origens/visual');
fs.mkdirSync(evidence,{recursive:true});
const person={id:'qa-client',tipo:'cliente',nome:'Cliente Sintético',telefone:'61999990000',origemCliente:'indicacao'};
const sale={id:'qa-package',clienteId:person.id,tipoVenda:'pacote',origemVenda:'alerta_grupo',dataVenda:'2026-10-13',dataCadastro:'2026-10-16T15:00:00Z',dataEmbarque:'2026-10-14',dataVolta:'2026-10-15',origem:'BSB',destino:'GRU',valorVenda:1500,valorCusto:1400,valorLucro:100,statusVenda:'emitida',statusPagamento:'pendente',localizadores:['QA001'],quantidadePassageiros:1};
const legacy={id:'qa-legacy',clienteId:person.id,dataVenda:'2026-10-13T10:30:22-03:00',dataCadastro:'2026-10-16T15:00:00Z',valorVenda:123.456,observacoes:'Legado sintético; sem classificação financeira'};
const stubs={'/js/auth.js':'window.Auth={proteger:async()=>true,logout(){}};', '/js/cloud-sync.js':'window.CloudSync={init:async()=>true,agendarBackup(){}};', '/js/supabase-config.js':'window.getSupabaseClient=()=>({auth:{getUser:async()=>({data:{user:{id:"synthetic-owner",user_metadata:{}}}}),onAuthStateChange(){}}});'};
async function fillSale(page){
 await page.evaluate(()=>{
  definirClientePorId('qa-client');
  const values={origem:'BSB',destino:'GRU',dataEmbarque:'2026-10-14',horaEmbarque:'10:00',dataVolta:'2026-10-15',horaVolta:'15:00',quantidadePassageiros:'1',valorVenda:'R$ 1.500,00',valorCusto:'R$ 1.400,00',formaPagamento:'pix',statusPagamento:'pendente',valorRecebido:'R$ 0,00'};
  for(const [id,value]of Object.entries(values))document.getElementById(id).value=value;
  document.getElementById('dataVendaAutomatica').checked=false;toggleDataVenda();document.getElementById('dataVendaManual').value='2026-10-13';document.getElementById('horaVendaManual').value='10:30';
  const carrier=[...document.getElementById('companhiaAerea').options].find(o=>/LATAM/i.test(o.text));document.getElementById('companhiaAerea').value=carrier.value;
  document.getElementById('clienteViaja').checked=true;gerarCamposPassageiros();document.getElementById('localizador_1').value='QA002';calcularMargem();validarValoresFinanceiros();validarDatasVenda();
 });
}
(async()=>{
 const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://127.0.0.1').pathname;
  if(stubs[name]){res.setHeader('content-type','text/javascript');return res.end(stubs[name]);}
  const file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  try{res.setHeader('content-type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;const errors=[],forbidden=[],passed=[];
 try{
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const context=await browser.newContext({locale:'pt-BR',timezoneId:'America/Sao_Paulo',viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();
   if(u.pathname.includes('bootstrap.min.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync('/tmp/vck-bootstrap.css')});
   if(u.pathname.includes('bootstrap.bundle.min.js'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('/tmp/vck-bootstrap.js')});
   if(['cdn.jsdelivr.net','cdnjs.cloudflare.com','fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname))return route.fulfill({body:''});
   forbidden.push(u.origin);return route.abort();
  });
  await context.addInitScript(({person,sale,legacy})=>{
   const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-10-16T15:00:00Z']));}static now(){return new NativeDate('2026-10-16T15:00:00Z').getTime();}};
   if(!localStorage.getItem('__attribution_seed')){
    localStorage.setItem('__attribution_seed','1');localStorage.setItem('emissao_pessoas',JSON.stringify([person]));
    localStorage.setItem('emissao_vendas',JSON.stringify([sale,legacy,{...sale,id:'qa-outside',dataVenda:'2026-09-13'}]));
   }
   window.alert=()=>{};window.confirm=()=>true;
  },{person,sale,legacy});
  const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  const base='http://127.0.0.1:'+server.address().port;
  const ready=async path=>{await page.goto(base+path);await page.waitForFunction(()=>document.documentElement.dataset.appAutenticado==='true');};
  await ready('/vendas.html');
  await page.getByRole('button',{name:'Nova venda',exact:true}).click();await fillSale(page);
  await page.locator('#origemVenda').selectOption('alerta_grupo');await page.locator('#origemVenda').scrollIntoViewIfNeeded();await page.screenshot({animations:'disabled',path:path.join(evidence,'venda-origem-desktop.png')});
  await page.locator('#dataVendaManual').scrollIntoViewIfNeeded();await page.screenshot({animations:'disabled',path:path.join(evidence,'venda-retroativa-desktop.png')});
  assert.deepEqual(await page.evaluate(()=>[...document.getElementById('formVenda').elements].filter(el=>!el.checkValidity()).map(el=>({id:el.id,error:el.validationMessage}))),[]);
  await page.evaluate(()=>salvarVenda());await page.waitForFunction(()=>!document.querySelector('#modalVenda.show'));
  const created=await page.evaluate(()=>StorageManager.getTodasVendas().find(v=>v.localizadores?.includes('QA002')));assert.ok(created);assert.equal(created.dataVenda,'2026-10-13');assert.match(created.dataCadastro,/2026-10-16/);assert.equal(created.dataEmbarque,'2026-10-14');assert.equal(created.origemVenda,'alerta_grupo');passed.push('venda retroativa: venda 13, embarque 14, cadastro 16');
  await page.evaluate(()=>abrirOrigemVenda('qa-legacy'));await page.waitForSelector('#modalOrigemVenda.show');await page.locator('#origemVendaRetroativa').selectOption('atendimento_direto');await page.screenshot({animations:'disabled',path:path.join(evidence,'origem-historico-desktop.png')});await page.locator('#salvarOrigemVenda').click();
  await page.waitForFunction(()=>!document.querySelector('#modalOrigemVenda.show'));
  const after=await page.evaluate(()=>StorageManager.getVendaById('qa-legacy'));for(const [k,v]of Object.entries(legacy))assert.equal(after[k],v,k);assert.equal(after.origemVenda,'atendimento_direto');assert.equal(after.valorCusto,undefined);passed.push('patch de origem preserva registro histórico incompleto');
  await page.locator('#filtroPeriodo').selectOption('customizado');await page.locator('#dataInicio').fill('2026-10-01');await page.locator('#dataFim').fill('2026-10-31');await page.locator('#filtroProduto').selectOption('pacote');await page.locator('#filtroOrigemCliente').selectOption('indicacao');await page.locator('#filtroOrigemVenda').selectOption('alerta_grupo');assert.equal(await page.locator('#tabelaVendas tr').count(),1);await page.screenshot({animations:'disabled',path:path.join(evidence,'vendas-filtros-desktop.png')});passed.push('filtros de vendas por período, produto e duas origens');
  await page.setViewportSize({width:390,height:844});await page.screenshot({animations:'disabled',path:path.join(evidence,'vendas-filtros-celular.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#filtroOrigemVenda').scrollIntoViewIfNeeded();await page.screenshot({animations:'disabled',path:path.join(evidence,'vendas-origens-celular.png')});
  await page.evaluate(()=>abrirOrigemVenda('qa-package'));await page.waitForSelector('#modalOrigemVenda.show');await page.screenshot({animations:'disabled',path:path.join(evidence,'origem-historico-celular.png')});await page.getByRole('button',{name:'Cancelar',exact:true}).last().click();
  await page.setViewportSize({width:1440,height:1000});await ready('/pessoas.html?tipo=cliente');await page.evaluate(()=>abrirModalPessoa('qa-client'));await page.locator('#origemCliente').scrollIntoViewIfNeeded();await page.screenshot({animations:'disabled',path:path.join(evidence,'cliente-origem-desktop.png')});await page.locator('#origemCliente').selectOption('indicacao');await page.evaluate(()=>salvarPessoa());passed.push('cadastro/edição de origem inicial do cliente');
  await ready('/balanco.html');await page.locator('#periodoBalanco').selectOption('personalizado');await page.locator('#dataInicioBalanco').fill('2026-10-01');await page.locator('#dataFimBalanco').fill('2026-10-31');await page.locator('#tipoBalanco').selectOption('pacote');await page.locator('#origemClienteBalanco').selectOption('indicacao');await page.locator('#origemVendaBalanco').selectOption('alerta_grupo');assert.deepEqual(await page.evaluate(()=>filtrarVendas().map(v=>v.id)),['qa-package']);
  await page.screenshot({animations:'disabled',path:path.join(evidence,'balanco-filtros-desktop.png')});const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#exportarCsv').click()]);const csvFile=path.join(evidence,'balanco-sintetico.csv');await download.saveAs(csvFile);const csv=fs.readFileSync(csvFile,'utf8');assert.match(csv,/"Origem inicial do cliente"/);assert.match(csv,/"Indicação";"Alerta do grupo"/);passed.push('balanço e download nativo do CSV com origens');
  await page.setViewportSize({width:390,height:844});await page.screenshot({animations:'disabled',path:path.join(evidence,'balanco-filtros-celular.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('#origemVendaBalanco').scrollIntoViewIfNeeded();await page.screenshot({animations:'disabled',path:path.join(evidence,'balanco-origens-celular.png')});
  await ready('/cotacoes.html');await page.getByRole('button',{name:'Nova proposta',exact:true}).first().click();await page.waitForFunction(()=>typeof document.querySelector('#quadroProposta')?.contentWindow?.coletarDadosProposta==='function');await page.getByRole('button',{name:'Cadastrar contato',exact:true}).click();await page.locator('#contatoPropostaNome').fill('Contato Sintético Instagram');await page.locator('#contatoPropostaWhatsapp').fill('61988880000');await page.locator('#contatoPropostaOrigem').selectOption('instagram');await page.screenshot({animations:'disabled',path:path.join(evidence,'contato-rapido-celular.png')});await page.locator('#salvarContatoProposta').click();await page.waitForFunction(()=>StorageManager.getPessoas().some(p=>p.nome==='Contato Sintético Instagram'&&p.origemCliente==='instagram'));passed.push('cadastro rápido na cotação salva origem explícita');
  await page.setViewportSize({width:1440,height:1000});await ready('/vendas.html');await page.getByRole('button',{name:'Nova venda',exact:true}).click();await page.evaluate(()=>abrirCadastroClienteRapido());await page.locator('#novoClienteNome').fill('Contato Sintético Grupo');await page.locator('#novoClienteOrigem').selectOption('grupo_promocoes');await page.evaluate(()=>salvarCadastroClienteRapido());assert.equal(await page.evaluate(()=>StorageManager.getPessoas().find(p=>p.nome==='Contato Sintético Grupo').origemCliente),'grupo_promocoes');passed.push('cadastro rápido na venda salva origem explícita');
  await page.evaluate(async()=>{const q=await StorageManager.gravar('addCotacao',[{status:'aberta',clienteId:'qa-client',nomeCliente:'Cliente Sintético',origem:'BSB',destino:'GRU',dataSaidaIda:'2026-10-14',horaSaidaIda:'10:00',tipoViagem:'so-ida',companhiaAerea:'LATAM',valorTotalPix:1500,adultos:1}]);localStorage.setItem('cotacao_para_venda',JSON.stringify(q));});
  await ready('/vendas.html?from_cotacao=true');await page.waitForFunction(()=>document.getElementById('clienteId').value==='qa-client');assert.equal(await page.locator('#origemVenda').inputValue(),'nao_informado');await fillSale(page);await page.locator('#origemVenda').selectOption('alerta_grupo');await page.evaluate(async()=>{await salvarVenda();await salvarVenda();});
  const conversion=await page.evaluate(()=>StorageManager.getTodasVendas().filter(v=>v.cotacaoOrigemId));assert.equal(conversion.length,1);assert.equal(conversion[0].dataVenda,'2026-10-13');assert.equal(conversion[0].origemVenda,'alerta_grupo');assert.equal(await page.evaluate(()=>StorageManager.getPessoaById('qa-client').origemCliente),'indicacao');passed.push('conversão retroativa idempotente sem inferir origem da venda');
  assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);const result={passed,errors,forbidden,screenshots:fs.readdirSync(evidence).filter(f=>f.endsWith('.png'))};fs.writeFileSync(path.join(evidence,'resultado.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
