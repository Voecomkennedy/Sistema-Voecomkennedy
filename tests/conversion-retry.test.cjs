const test=require('node:test');
const assert=require('node:assert/strict');
const {fixture,completeSale,person,quote}=require('./helpers/sales-form.cjs');

test('partial conversion reports retained sale, retries its link and never duplicates or overwrites that sale',async()=>{
  const a=await fixture();
  try{
    const w=a.w;await a.waitFor(()=>w.document.getElementById('clienteId').value===person.id);
    completeSale(w);w.__success=[];w.Utils.showSuccess=text=>w.__success.push(text);
    const original=w.Storage.prototype.setItem;
    w.Storage.prototype.setItem=function(key,value){if(key==='emissao_cotacoes')throw new w.DOMException('synthetic full quota','QuotaExceededError');return original.call(this,key,value);};
    w.salvarVenda();
    assert.equal(w.StorageManager.getTodasVendas().length,1);
    const sale=w.StorageManager.getTodasVendas()[0];
    assert.equal(sale.cotacaoOrigemId,quote.id);
    assert.equal(w.StorageManager.getCotacaoById(quote.id).status,'aberta');
    assert.match(w.__errors.join(' '),/sem criar outra venda/);assert.equal(w.__success.length,0);
    w.Storage.prototype.setItem=original;
    // A retry resumes the operation already committed, not a new form snapshot.
    w.document.getElementById('valorVenda').value='R$ 2.000,00';w.calcularMargem();
    w.salvarVenda();w.salvarVenda();
    assert.equal(w.StorageManager.getTodasVendas().length,1);
    assert.equal(w.StorageManager.getTodasVendas()[0].id,sale.id);
    assert.equal(w.StorageManager.getTodasVendas()[0].valorVenda,1500);
    assert.equal(w.StorageManager.getCotacaoById(quote.id).vendaId,sale.id);
    assert.match(w.__success.join(' '),/formulário desta tentativa não alterou essa venda/);
  }finally{a.dom.window.close();}
});

test('retry after reload finds the origin link left by partial conversion',async()=>{
  const a=await fixture();let retained;
  try{
    const w=a.w;await a.waitFor(()=>w.document.getElementById('clienteId').value===person.id);completeSale(w);
    w.StorageManager.concluirConversaoCotacao=()=>{throw new Error('synthetic second write failure');};
    w.salvarVenda();retained=JSON.parse(w.localStorage.getItem('emissao_vendas'));
    assert.equal(retained.length,1);
  }finally{a.dom.window.close();}
  const b=await fixture({sales:retained});
  try{
    const w=b.w;await b.waitFor(()=>w.document.getElementById('clienteId').value===person.id);completeSale(w);w.salvarVenda();
    assert.equal(w.StorageManager.getTodasVendas().length,1);
    assert.equal(w.StorageManager.getCotacaoById(quote.id).vendaId,retained[0].id);
  }finally{b.dom.window.close();}
});

test('conversion of one of three same-client proposals preserves all originals and converts only the selected quote',async()=>{
  const quotes=[0,1,2].map(i=>({...quote,id:'quote-'+i,observacao:'Independent '+i}));
  const a=await fixture({storedQuote:quotes[1],storedQuotes:quotes,transfer:quotes[1]});
  try{
    const w=a.w;await a.waitFor(()=>w.document.getElementById('clienteId').value===person.id);completeSale(w);w.salvarVenda();
    const stored=w.StorageManager.getCotacoes();
    assert.equal(stored.length,3);assert.equal(stored.filter(q=>q.status==='convertida').length,1);
    assert.equal(w.StorageManager.getCotacaoById('quote-0').status,'aberta');
    assert.equal(w.StorageManager.getCotacaoById('quote-2').status,'aberta');
    assert.equal(w.StorageManager.getTodasVendas()[0].cotacaoOrigemId,'quote-1');
  }finally{a.dom.window.close();}
});

test('failure of the first sale write leaves both collections unchanged and permits a successful retry',async()=>{
  const a=await fixture();
  try{
    const w=a.w;await a.waitFor(()=>w.document.getElementById('clienteId').value===person.id);completeSale(w);
    const save=w.StorageManager.saveVendas;w.StorageManager.saveVendas=()=>{throw new Error('synthetic quota');};
    w.salvarVenda();assert.equal(w.StorageManager.getTodasVendas().length,0);assert.equal(w.StorageManager.getCotacaoById(quote.id).status,'aberta');
    w.StorageManager.saveVendas=save;w.salvarVenda();assert.equal(w.StorageManager.getTodasVendas().length,1);
    const result=w.StorageManager.salvarConversaoCotacao(quote.id,{clienteId:person.id});
    assert.equal(result.retomada,true);assert.equal(w.StorageManager.getTodasVendas().length,1);
  }finally{a.dom.window.close();}
});
