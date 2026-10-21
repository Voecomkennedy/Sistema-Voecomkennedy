const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const Atribuicao=require('../js/atribuicao.js');
const DateFields=require('../cotador/js/date-fields.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
function fn(file,name){
 const source=read(file);const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);
 // Page functions are at one fixed indentation; this selects their original body.
 const end=source.indexOf('\n        }',start)+10;return source.slice(start,end);
}
function field(value=''){
 const note={textContent:'',hidden:true};
 return {value,required:false,checked:false,disabled:false,validity:{badInput:false},validationMessage:'',setCustomValidity(v){this.validationMessage=v},setAttribute(){},getAttribute(){return ''},ownerDocument:{getElementById:()=>note}};
}

test('actual sale-date validation accepts the 13th on the 16th, rejects future and malformed dates, and keeps return chronology',()=>{
 const fields={dataEmbarque:field('2026-10-20'),dataVolta:field('2026-10-22'),dataVendaManual:field('2026-10-13'),dataVendaAutomatica:field(),statusPagamento:field('pendente'),dataPagamentoDesconhecida:field(),dataPagamento:field()};
 const ctx=vm.createContext({document:{getElementById:id=>fields[id]},DateFields:{...DateFields,today:()=> '2026-10-16'},vendaEditandoId:null});
 vm.runInContext(fn('vendas.html','validarDatasVenda'),ctx);
 assert.equal(ctx.validarDatasVenda(),true);assert.equal(fields.dataVendaManual.value,'2026-10-13');
 fields.dataVendaManual.value='2026-10-17';assert.equal(ctx.validarDatasVenda(),false);assert.match(fields.dataVendaManual.validationMessage,/16\/10\/2026/);
 fields.dataVendaManual.value='0026-10-13';assert.equal(ctx.validarDatasVenda(),false);
 fields.dataVendaManual.value='2026-10-13';fields.dataEmbarque.value='2026-10-13';assert.equal(ctx.validarDatasVenda(),true);
 fields.dataVolta.value='2026-10-12';assert.equal(ctx.validarDatasVenda(),false);assert.match(fields.dataVolta.validationMessage,/anterior/);
 fields.dataVolta.value='2026-10-14';
 ctx.vendaEditandoId='historical';assert.equal(ctx.validarDatasVenda(),true);
});

test('actual origin-only save passes only origemVenda to the integrity mutation boundary',async()=>{
 const fields={salvarOrigemVenda:field(),origemVendaRetroativa:field('alerta_grupo'),erroOrigemVenda:{textContent:''}};
 let call;let rendered=0;const ctx=vm.createContext({document:{getElementById:id=>fields[id]},Atribuicao,origemVendaEditandoId:'old',modalOrigemVenda:{hide(){}},StorageManager:{async gravar(...args){call=args;return {id:'old'}}},carregarVendas(){rendered++}});
 vm.runInContext('async '+fn('vendas.html','salvarOrigemVendaRetroativa'),ctx);
 await ctx.salvarOrigemVendaRetroativa();assert.deepEqual(JSON.parse(JSON.stringify(call)),['updateVenda',['old',{origemVenda:'alerta_grupo'}]]);assert.equal(rendered,1);assert.equal(fields.salvarOrigemVenda.disabled,false);
});

test('actual balance filter and CSV use the same selection with both attribution columns',()=>{
 const fields=Object.fromEntries(Object.entries({tipoBalanco:'pacote',situacaoBalanco:'todas',buscaBalanco:'',origemClienteBalanco:'indicacao',origemVendaBalanco:'alerta_grupo'}).map(([id,value])=>[id,field(value)]));
 const sales=[{id:'a',clienteId:'c',tipoVenda:'pacote',origemVenda:'alerta_grupo',dataVenda:'2026-10-13'},{id:'b',clienteId:'c',tipoVenda:'pacote',origemVenda:'atendimento_direto',dataVenda:'2026-10-13'},{id:'c',clienteId:'c',tipoVenda:'pacote',origemVenda:'alerta_grupo',dataVenda:'2026-09-13'}];
 let csv;const ctx=vm.createContext({document:{getElementById:id=>fields[id],createElement:()=>({click(){},remove(){}}),body:{appendChild(){}}},Atribuicao,StorageManager:{getPessoas:()=>[{id:'c',nome:'Sintético',origemCliente:'indicacao'}],getVendas:()=>sales,getCodigosVenda:()=>['SINT'],obterResumoFinanceiroVenda:()=>({receitaProjetada:15,custoLiquido:10,receitaRealizada:0,lucroRealizado:0,statusVenda:'emitida',statusPagamento:'pendente'})},limitesDoPeriodo:()=>({inicio:'2026-10-01',fim:'2026-10-31'}),Blob:class{constructor(parts){csv=parts.join('')}},URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL(){}},Date,setTimeout:()=>{},chaveDataLocal:()=> '2026-10-16'});
 for(const name of ['normalizarTexto','vendaNoPeriodo','tipoDaVenda','filtrarVendas','protegerCelulaCsv','exportarBalanco'])vm.runInContext(fn('balanco.html',name),ctx);
 const selected=ctx.filtrarVendas();assert.deepEqual(Array.from(selected,v=>v.id),['a']);ctx.vendasClassificadasExibidas=selected;ctx.exportarBalanco();assert.match(csv,/Origem inicial do cliente/);assert.match(csv,/Origem da venda/);assert.match(csv,/"Indicação";"Alerta do grupo"/);
});

test('full editor preserves exact historical date/time when their displayed inputs were not changed',()=>{
 const ctx=vm.createContext({Utils:{dataHoraLocalParaInputs:()=>({hora:'10:30'})}});
 for(const name of ['obterDataHoraOriginalVenda','preservarDataHoraHistorica'])vm.runInContext(fn('vendas.html',name),ctx);
 const original={dataVenda:'2026-10-13T10:30:22-03:00',horaVenda:'10:30:22'};
 const patch={origemVenda:'alerta_grupo',dataVenda:'2026-10-13',horaVenda:'10:30'};ctx.preservarDataHoraHistorica(patch,original);
 assert.equal(patch.dataVenda,original.dataVenda);assert.equal(patch.horaVenda,original.horaVenda);
 const changed={dataVenda:'2026-10-12',horaVenda:'10:30'};ctx.preservarDataHoraHistorica(changed,original);assert.equal(changed.dataVenda,'2026-10-12');
 const missingHour={dataVenda:'2026-10-13',horaVenda:'00:00'};ctx.preservarDataHoraHistorica(missingHour,{dataVenda:'2026-10-13'});assert.equal(Object.hasOwn(missingHour,'horaVenda'),false);
});
