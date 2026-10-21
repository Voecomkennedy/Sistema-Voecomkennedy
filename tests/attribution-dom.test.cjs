const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fixture,completeSale,person}=require('./helpers/sales-form.cjs');
const {JSDOM,ResourceLoader,VirtualConsole}=require('../cotador/node_modules/jsdom');
const root=path.resolve(__dirname,'..');
class Local extends ResourceLoader {
 fetch(url){const u=new URL(url);
  if(u.hostname==='qa.local'){
   const stubs={'/js/auth.js':'window.Auth={proteger:async()=>true,logout(){}};', '/js/cloud-sync.js':'window.CloudSync={init:async()=>true,agendarBackup(){}};', '/js/supabase-config.js':'window.getSupabaseClient=()=>({});'};
   if(stubs[u.pathname])return Promise.resolve(Buffer.from(stubs[u.pathname]));
   const f=path.join(root,decodeURIComponent(u.pathname));return Promise.resolve(fs.existsSync(f)&&fs.statSync(f).isFile()?fs.readFileSync(f):Buffer.alloc(0));
  }
  if(u.pathname.includes('bootstrap.bundle')) return Promise.resolve(Buffer.from('window.bootstrap={Modal:class{show(){}hide(){}}};'));
  return Promise.resolve(Buffer.alloc(0));
 }
}
async function page(name,entries){
 const dom=new JSDOM(fs.readFileSync(path.join(root,name+'.html'),'utf8'),{url:'https://qa.local/'+name+'.html',runScripts:'dangerously',resources:new Local(),virtualConsole:new VirtualConsole(),beforeParse(w){
  w.fetch=()=>{throw Error('NETWORK FORBIDDEN')};w.alert=()=>{};w.confirm=()=>true;w.HTMLElement.prototype.scrollIntoView=()=>{};
  for(const [k,v] of Object.entries(entries))w.localStorage.setItem(k,JSON.stringify(v));
 }});
 const deadline=Date.now()+10000;
 while(dom.window.document.documentElement.dataset.appAutenticado!=='true'){
  if(Date.now()>deadline){dom.window.close();throw Error('Página não inicializou');}await new Promise(r=>setTimeout(r,15));
 }
 return dom;
}

test('sale on the 13th entered on the 16th preserves the commercial date and independent source through conversion',async()=>{
 const a=await fixture();try{
  const w=a.w,d=w.document;await a.waitFor(()=>d.getElementById('clienteId').value===person.id);
  const OriginalDate=w.Date;
  w.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-10-16T15:00:00Z']));}static now(){return new OriginalDate('2026-10-16T15:00:00Z').getTime();}};
  w.DateFields.today=()=> '2026-10-16';
  w.StorageManager.updatePessoa(person.id,{origemCliente:'indicacao'});
  completeSale(w);
  d.getElementById('dataVendaAutomatica').checked=false;w.toggleDataVenda();
  d.getElementById('dataEmbarque').value='2026-10-14';
  d.getElementById('dataVendaManual').value='2026-10-13';d.getElementById('horaVendaManual').value='10:30';d.getElementById('origemVenda').value='alerta_grupo';
  await w.salvarVenda();const sale=w.StorageManager.getTodasVendas()[0];assert.ok(sale,w.__errors.join(' '));
  assert.equal(sale.dataVenda,'2026-10-13');assert.match(sale.dataCadastro,/2026-10-16/);assert.equal(sale.origemVenda,'alerta_grupo');assert.equal(w.StorageManager.getPessoaById(person.id).origemCliente,'indicacao');
  assert.ok(sale.cotacaoOrigemId);
  w.abrirModalVenda(sale.id);assert.equal(d.getElementById('origemVenda').value,'alerta_grupo');
  w.abrirOrigemVenda(sale.id);d.getElementById('origemVendaRetroativa').value='atendimento_direto';await w.salvarOrigemVendaRetroativa();
  const after=w.StorageManager.getVendaById(sale.id);assert.equal(after.dataVenda,sale.dataVenda);assert.equal(after.horaVenda,sale.horaVenda);assert.equal(after.dataCadastro,sale.dataCadastro);assert.equal(after.valorVenda,sale.valorVenda);assert.equal(after.origemVenda,'atendimento_direto');
 }finally{a.dom.window.close();}
});

test('source-only UI edit handles incomplete legacy sale without enforcing unrelated form fields',async()=>{
 const old={id:'old',dataVenda:'2026-10-13',dataCadastro:'2026-10-16T15:00:00Z',valorVenda:12.345,clienteId:person.id};
 const a=await fixture({transfer:null,storedQuote:null,sales:[old]});try{
  const w=a.w;w.abrirOrigemVenda('old');assert.equal(w.document.getElementById('origemVendaRetroativa').value,'nao_informado');
  w.document.getElementById('origemVendaRetroativa').value='alerta_grupo';await w.salvarOrigemVendaRetroativa();
  const saved=w.StorageManager.getVendaById('old');for(const [k,v]of Object.entries(old))assert.equal(saved[k],v);
  assert.equal(saved.valorCusto,undefined);assert.equal(saved.origemVenda,'alerta_grupo');
 }finally{a.dom.window.close();}
});

test('client source is editable in People, while suppliers do not expose it',async()=>{
 const dom=await page('pessoas',{emissao_pessoas:[{...person,origemCliente:'indicacao'}]});try{
  const w=dom.window,d=w.document;w.abrirModalPessoa(person.id);assert.equal(d.getElementById('origemCliente').value,'indicacao');
  d.getElementById('origemCliente').value='grupo_promocoes';await w.salvarPessoa();assert.equal(w.StorageManager.getPessoaById(person.id).origemCliente,'grupo_promocoes');
  w.abrirModalPessoa();d.getElementById('tipo').value='fornecedor';w.alterarCamposPorTipo();assert.equal(d.getElementById('campoOrigemCliente').hidden,true);
 }finally{dom.window.close();}
});

test('balance combines period, product and both sources; CSV includes sources for selected rows',async()=>{
 const sale={id:'s1',clienteId:person.id,tipoVenda:'pacote',origemVenda:'alerta_grupo',dataVenda:'2026-10-13',valorVenda:1500,valorCusto:1400,valorLucro:100,statusVenda:'emitida',statusPagamento:'pendente'};
 const dom=await page('balanco',{emissao_pessoas:[{...person,origemCliente:'indicacao'}],emissao_vendas:[sale,{...sale,id:'s2',dataVenda:'2026-09-13'},{...sale,id:'s3',tipoVenda:'aereo'},{...sale,id:'s4',origemVenda:'atendimento_direto'},{id:'legacy',dataVenda:'2026-10-13'}]});try{
  const w=dom.window,d=w.document;
  for(const [id,v]of Object.entries({periodoBalanco:'personalizado',dataInicioBalanco:'2026-10-01',dataFimBalanco:'2026-10-31',tipoBalanco:'pacote',origemClienteBalanco:'indicacao',origemVendaBalanco:'alerta_grupo'}))d.getElementById(id).value=v;
  assert.deepEqual(Array.from(w.filtrarVendas(),v=>v.id),['s1']);w.atualizarBalanco();assert.match(d.getElementById('contagemOrigens').textContent,/1 venda/);
  let blob;w.URL.createObjectURL=b=>{blob=b;return 'blob:synthetic'};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=()=>{};w.exportarBalanco();assert.ok(blob);
  const csv=await new Promise((resolve,reject)=>{const fr=new w.FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsText(blob)});
  assert.match(csv,/Origem inicial do cliente/);assert.match(csv,/Origem da venda/);assert.match(csv,/Indicação/);assert.match(csv,/Alerta do grupo/);assert.doesNotMatch(csv,/Atendimento direto/);
 }finally{dom.window.close();}
});

test('Sales combines period, product and source filters and clears them together',async()=>{
 const a=await fixture({transfer:null,storedQuote:null});try{
  const w=a.w,d=w.document;
  w.StorageManager.updatePessoa(person.id,{origemCliente:'indicacao'});
  w.StorageManager.addVenda({clienteId:person.id,tipoVenda:'pacote',origemVenda:'alerta_grupo',dataVenda:'2026-10-13'});
  w.StorageManager.addVenda({clienteId:person.id,tipoVenda:'aereo',origemVenda:'alerta_grupo',dataVenda:'2026-10-13'});
  for(const [id,v]of Object.entries({filtroPeriodo:'customizado',dataInicio:'2026-10-01',dataFim:'2026-10-31',filtroProduto:'pacote',filtroOrigemCliente:'indicacao',filtroOrigemVenda:'alerta_grupo'}))d.getElementById(id).value=v;
  w.aplicarFiltros();assert.equal(d.querySelectorAll('#tabelaVendas tr').length,1);w.limparFiltros();
  for(const id of ['filtroProduto','filtroOrigemCliente','filtroOrigemVenda'])assert.equal(d.getElementById(id).value,'todos');
 }finally{a.dom.window.close();}
});
