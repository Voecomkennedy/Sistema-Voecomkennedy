const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const attribution = require('../js/atribuicao.js');

function manager(entries) {
  const data = new Map(Object.entries(entries).map(([k,v]) => [k,JSON.stringify(v)]));
  const localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
  const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/storage.js'),'utf8'),{window,localStorage});
  return window.StorageManager;
}

test('client acquisition and each sale source are independent; old rows remain unknown',()=>{
  const people=[{id:'c',origemCliente:'indicacao'}];
  const sales=[{id:'1',clienteId:'c',tipoVenda:'pacote',origemVenda:'alerta_grupo'},{id:'2',clienteId:'c',tipoVenda:'aereo',origemVenda:'atendimento_direto'},{id:'3',clienteId:'old'}];
  assert.deepEqual(attribution.filtrar(sales,people,{produto:'pacote',cliente:'indicacao',venda:'alerta_grupo'}).map(v=>v.id),['1']);
  assert.deepEqual(attribution.filtrar(sales,people,{cliente:'nao_informado',venda:'nao_informado'}).map(v=>v.id),['3']);
  assert.equal(sales[2].origemVenda,undefined);
  assert.equal(attribution.rotulo('cliente',undefined),'Não informado');
});

test('source-only edit preserves legacy dates, missing fields, raw financial values and links exactly',()=>{
  const old={id:'old',clienteId:'c',dataVenda:'2026-10-13T10:12:15-03:00',dataCadastro:'2026-10-16T12:00:00Z',valorVenda:123.456,valorCusto:null,cotacaoOrigemId:'q',passageiros:[{nome:'Sintético'}],custom:{legacy:true}};
  const s=manager({emissao_vendas:[old],emissao_pessoas:[{id:'c',origemCliente:'indicacao'}]});
  s.updateVenda('old',{origemVenda:'alerta_grupo'});
  const saved=s.getVendaById('old');
  for (const [key,value] of Object.entries(old)) assert.deepEqual(JSON.parse(JSON.stringify(saved[key])),value,key);
  assert.equal(saved.horaVenda,undefined);assert.equal(saved.valorLucro,undefined);
  assert.equal(saved.origemVenda,'alerta_grupo');
  assert.deepEqual(Array.from(saved.historicoAlteracoes[0].campos),['origemVenda']);
  assert.equal(s.getPessoaById('c').origemCliente,'indicacao');
  assert.throws(()=>s.updateVenda('old',{origemVenda:'inventado'}),/inválida/);
  assert.throws(()=>s.updatePessoa('c',{origemCliente:'inventado'}),/inválida/);
});

test('model accepts every source offered by the UI without populating legacy reads',()=>{
 const s=manager({emissao_pessoas:[{id:'c'}],emissao_vendas:[{id:'v'}]});
 for(const source of Object.keys(attribution.cliente)) s.updatePessoa('c',{origemCliente:source});
 for(const source of Object.keys(attribution.venda)) s.updateVenda('v',{origemVenda:source});
 const legacy=manager({emissao_vendas:[{id:'old'}]});legacy.getVendas();assert.equal(legacy.getVendaById('old').origemVenda,undefined);
});
