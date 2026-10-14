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

test('legacy quote without client ID converts using the explicitly selected contact, never a matching name',async()=>{
  const legacy={...quote,clienteId:null,nomeCliente:'Outro cliente sintético'};
  const a=await fixture({storedQuote:legacy,transfer:legacy});
  try{
    const w=a.w;await a.waitFor(()=>w.document.getElementById('origem').value==='BSB');
    assert.equal(w.document.getElementById('clienteId').value,'');
    completeSale(w,person.id);w.salvarVenda();
    assert.equal(w.StorageManager.getTodasVendas().length,1);
    const sale=w.StorageManager.getTodasVendas()[0],saved=w.StorageManager.getCotacaoById(legacy.id);
    assert.equal(sale.clienteId,person.id);assert.equal(sale.cotacaoOrigemId,legacy.id);
    assert.equal(saved.clienteId,person.id);assert.equal(saved.vendaId,sale.id);
    assert.equal(saved.nomeCliente,legacy.nomeCliente);assert.equal(saved.status,'convertida');
  }finally{a.dom.window.close();}
});

test('legacy conversion requires a registered selected client and rejects an existing divergent quote link',async()=>{
  const legacy={...quote,clienteId:null};const a=await fixture({storedQuote:legacy,transfer:legacy});
  try{
    const store=a.w.StorageManager;
    assert.throws(()=>store.salvarConversaoCotacao(legacy.id,{clienteId:'missing-contact'}),/cliente cadastrado/);
    assert.equal(store.getTodasVendas().length,0);assert.equal(store.getCotacaoById(legacy.id).clienteId,null);
    store.updateCotacao(legacy.id,{clienteId:'client-independent'});
    assert.throws(()=>store.salvarConversaoCotacao(legacy.id,{clienteId:person.id}),/vinculado à cotação/);
    assert.equal(store.getTodasVendas().length,0);assert.equal(store.getCotacaoById(legacy.id).clienteId,'client-independent');
  }finally{a.dom.window.close();}
});

test('partial legacy conversion keeps its chosen client, rejects another client on retry and finishes without duplicates',async()=>{
  const legacy={...quote};delete legacy.clienteId;
  const a=await fixture({storedQuote:legacy,transfer:legacy});
  try{
    const store=a.w.StorageManager,finish=store.concluirConversaoCotacao;
    store.concluirConversaoCotacao=()=>{throw new Error('synthetic quote write failure');};
    assert.throws(()=>store.salvarConversaoCotacao(legacy.id,{clienteId:person.id,valorVenda:1500}),/sem criar outra venda/);
    assert.equal(store.getTodasVendas().length,1);assert.equal(store.getCotacaoById(legacy.id).clienteId,undefined);
    const saleId=store.getTodasVendas()[0].id;store.concluirConversaoCotacao=finish;
    assert.throws(()=>store.salvarConversaoCotacao(legacy.id,{clienteId:'client-independent',valorVenda:9000}),/já vinculada/);
    const result=store.salvarConversaoCotacao(legacy.id,{clienteId:person.id,valorVenda:9000});
    assert.equal(result.retomada,true);assert.equal(result.venda.id,saleId);assert.equal(result.venda.valorVenda,1500);
    assert.equal(store.getTodasVendas().length,1);assert.equal(store.getCotacaoById(legacy.id).clienteId,person.id);
    assert.equal(store.getCotacaoById(legacy.id).vendaId,saleId);
    store.salvarConversaoCotacao(legacy.id,{clienteId:person.id});assert.equal(store.getTodasVendas().length,1);
  }finally{a.dom.window.close();}
});

test('a registered contact with an existing quote link stays valid if its person type changes',async()=>{
  const a=await fixture();
  try{
    const store=a.w.StorageManager;store.updatePessoa(person.id,{tipo:'passageiro'});
    const result=store.salvarConversaoCotacao(quote.id,{clienteId:person.id,valorVenda:1500});
    assert.equal(result.venda.clienteId,person.id);assert.equal(store.getCotacaoById(quote.id).vendaId,result.venda.id);
    assert.equal(store.getPessoaById(person.id).tipo,'passageiro');
  }finally{a.dom.window.close();}
});
