const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture,fill,frame} = require('./helpers/proposal-form.cjs');
const {page,person} = require('./helpers/proposal-dom.cjs');

test('three same-client proposals remain independent through Novo, Limpar, PDF, editing and reload', async () => {
  const a=await fixture(); let entries;
  try {
    const w=a.window,f=frame(w); f.ProposalDownload.download=async()=>{};
    w.novaPropostaCompleta();fill(w,'A',4);await f.gerarProposta();
    f.limparProposta();fill(w,'B',3);await f.gerarProposta();
    w.novaPropostaCompleta();fill(w,'C',3);await w.salvarPropostaCompleta();
    const quotes=w.StorageManager.getCotacoes();
    assert.equal(new Set(quotes.map(q=>q.id)).size,3);
    assert.deepEqual(Array.from(quotes,q=>q.totalPassageiros),[4,3,3]);
    await w.editarPropostaCompleta(quotes[1].id);fill(w,'B edited',3);await w.salvarPropostaCompleta();
    assert.equal(w.StorageManager.getCotacaoById(quotes[0].id).propostaCompleta.obs,'A');
    assert.equal(w.StorageManager.getCotacaoById(quotes[1].id).propostaRevisao,2);
    assert.match(w.document.getElementById('propostaModo').textContent,/Editando cotação/);
    assert.equal(w.document.getElementById('salvarPropostaCompleta').textContent,'Salvar alterações');
    entries={emissao_pessoas:[person],emissao_cotacoes:JSON.parse(w.localStorage.getItem('emissao_cotacoes'))};
  }finally{a.dom.window.close();}
  const loaded=await page('cotacoes',entries);
  try{assert.equal(loaded.window.StorageManager.getCotacoes().length,3);}finally{loaded.dom.window.close();}
});

test('Limpar during PDF saves A first and allows B to save without overwriting A', async () => {
  const a=await fixture();
  try{
    const w=a.window,f=frame(w);let release,pdf;
    w.novaPropostaCompleta();fill(w,'A',4);
    f.ProposalDownload.download=data=>{pdf=data;return new Promise(r=>{release=r;});};
    const pending=f.gerarProposta();
    assert.equal(w.StorageManager.getCotacoes().length,1);
    f.limparProposta();fill(w,'B',3);await w.salvarPropostaCompleta();
    assert.equal(w.StorageManager.getCotacoes().length,2);
    release();await pending;
    assert.deepEqual(Array.from(w.StorageManager.getCotacoes(),q=>q.propostaCompleta.obs),['A','B']);
    assert.equal(pdf.obs,'A');assert.equal(pdf.totalPax,4);
  }finally{a.dom.window.close();}
});

test('Editar a different quote during PDF never redirects the pending save to that quote', async () => {
  const a=await fixture();
  try{
    const w=a.window,f=frame(w);let release;
    w.novaPropostaCompleta();fill(w,'Existing B',3);await w.salvarPropostaCompleta();
    const idB=w.StorageManager.getCotacoes()[0].id;
    w.novaPropostaCompleta();fill(w,'A',4);
    f.ProposalDownload.download=()=>new Promise(r=>{release=r;});const pending=f.gerarProposta();
    await w.editarPropostaCompleta(idB);release();await pending;
    assert.equal(w.StorageManager.getCotacoes().length,2);
    assert.equal(w.StorageManager.getCotacaoById(idB).propostaCompleta.obs,'Existing B');
    assert.match(w.document.getElementById('propostaModo').textContent,new RegExp(idB));
  }finally{a.dom.window.close();}
});

test('Novo and change of client during PDF keep the saved identity and PDF snapshot bound to the original client', async () => {
  const a=await fixture();
  try{
    const w=a.window,f=frame(w);let release,pdf;
    w.novaPropostaCompleta();fill(w,'A');
    f.ProposalDownload.download=data=>{pdf=data;return new Promise(r=>{release=r;});};
    const pending=f.gerarProposta();
    const other=w.StorageManager.addPessoa({tipo:'cliente',nome:'Other synthetic client'});
    w.novaPropostaCompleta();fill(w,'B');w.selecionarContatoProposta(other.id);await w.salvarPropostaCompleta();
    release();await pending;
    const quotes=w.StorageManager.getCotacoes();
    assert.equal(quotes[0].clienteId,person.id);assert.equal(quotes[1].clienteId,other.id);
    assert.equal(pdf.cliente,person.nome);assert.equal(pdf.obs,'A');
  }finally{a.dom.window.close();}
});

test('saving a later revision while PDF downloads preserves both the new editor revision and the PDF data', async () => {
  const a=await fixture();
  try{
    const w=a.window,f=frame(w);let release,pdf;
    w.novaPropostaCompleta();fill(w,'Revision 1');
    f.ProposalDownload.download=data=>{pdf=data;return new Promise(r=>{release=r;});};
    const pending=f.gerarProposta();
    fill(w,'Revision 2');await w.salvarPropostaCompleta();release();await pending;
    const quote=w.StorageManager.getCotacoes()[0];
    assert.equal(quote.propostaRevisao,2);assert.equal(quote.propostaCompleta.obs,'Revision 2');
    assert.equal(pdf.obs,'Revision 1');assert.equal(w.StorageManager.getCotacoes().length,1);
  }finally{a.dom.window.close();}
});

test('failed PDF keeps its saved proposal; repeated click during download creates one file and no extra revision', async () => {
  const a=await fixture();
  try{
    const w=a.window,f=frame(w);w.novaPropostaCompleta();fill(w,'A');
    f.ProposalDownload.download=async()=>{throw new Error('synthetic PDF failure');};
    await f.gerarProposta();assert.equal(w.StorageManager.getCotacoes().length,1);
    let release,calls=0;f.ProposalDownload.download=()=>{calls++;return new Promise(r=>{release=r;});};
    const first=f.gerarProposta();const revision=w.StorageManager.getCotacoes()[0].propostaRevisao;
    await f.gerarProposta();release();await first;
    assert.equal(calls,1);assert.equal(w.StorageManager.getCotacoes()[0].propostaRevisao,revision);
    assert.equal(w.StorageManager.getCotacoes().length,1);
  }finally{a.dom.window.close();}
});

test('failed local save stops PDF generation and retains the form; stale editor cannot overwrite a changed quote', async () => {
  const a=await fixture();
  try{
    const w=a.window,f=frame(w);w.novaPropostaCompleta();fill(w,'A');let pdfs=0;
    f.ProposalDownload.download=async()=>{pdfs++;};
    const save=w.StorageManager.saveCotacoes;
    w.StorageManager.saveCotacoes=()=>{throw new Error('synthetic quota');};
    await f.gerarProposta();assert.equal(pdfs,0);assert.equal(f.document.getElementById('p-obs').value,'A');
    w.StorageManager.saveCotacoes=save;await w.salvarPropostaCompleta();
    const id=w.StorageManager.getCotacoes()[0].id;
    w.StorageManager.updateCotacao(id,{observacao:'Changed in other tab'});
    fill(w,'Stale form');await w.salvarPropostaCompleta();
    assert.match(w.document.getElementById('propostaEstado').textContent,/mudou em outra tela/);
    assert.equal(w.StorageManager.getCotacaoById(id).observacao,'Changed in other tab');
  }finally{a.dom.window.close();}
});
