const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture,completeSale,person,quote} = require('./helpers/sales-form.cjs');
const DateFields = require('../cotador/js/date-fields.js');

test('completing a linked client updates its ID, preserves passengers, and converts exactly once', async () => {
  const a = await fixture();
  try {
    const w = a.w, d = w.document;
    await a.waitFor(() => d.getElementById('clienteId').value === person.id);
    assert.equal(w.Utils.dataHoraBrasilParaInputs('2027-01-01T02:30:00Z').data,'2026-12-31');
    assert.equal(w.Utils.dataHoraBrasilParaInputs('2027-01-01T02:30:00Z').hora,'23:30');
    completeSale(w);
    const count = w.StorageManager.getPessoas().length;
    assert.equal(d.getElementById('buscaCliente').readOnly,true);
    w.abrirCadastroClienteRapido();
    d.getElementById('novoClienteNome').value = 'Cliente Sintético Nome Completo';
    await w.salvarCadastroClienteRapido();
    assert.equal(w.StorageManager.getPessoas().length,count);
    assert.equal(d.getElementById('clienteId').value,person.id);
    assert.equal(d.getElementById('localizador_1').value,'SINT123');
    await w.salvarVenda(); await w.salvarVenda();
    const sales = w.StorageManager.getTodasVendas();
    assert.equal(sales.length,1);
    assert.equal(sales[0].clienteId,person.id);
    assert.equal(sales[0].id,'cotacao-'+quote.id);
    assert.equal(sales[0].valorLucro,100);
    assert.equal(w.StorageManager.getCotacaoById(quote.id).vendaId,sales[0].id);
  } finally { a.dom.window.close(); }
});

test('selecting a different ID is rejected at selection, even with the same name', async () => {
  const a = await fixture();
  try {
    const w = a.w,d = w.document;
    await a.waitFor(() => d.getElementById('clienteId').value === person.id);
    w.StorageManager.addPessoa({tipo:'cliente',nome:person.nome}); w.carregarClientes();
    const duplicate = w.StorageManager.getPessoas().at(-1);
    w.selecionarCliente(duplicate.id);
    assert.equal(d.getElementById('clienteId').value,person.id);
    assert.match(w.__errors.join(' '),/preservar o vínculo/);
    assert.equal(w.StorageManager.getCotacaoById(quote.id).status,'aberta');
  } finally { a.dom.window.close(); }
});

test('sale and cost calculate cents, zero profit, loss and keep the milheiro informational', async () => {
  for (const [sale,cost,profit] of [[1500.45,1400.22,100.23],[1500,0,1500],[1500,1500,0],[100,150,-50]]) {
    const a = await fixture();
    try {
      const w=a.w,d=w.document;
      await a.waitFor(()=>d.getElementById('clienteId').value===person.id);
      completeSale(w);
      d.getElementById('valorVenda').value=w.Utils.numeroParaMoeda(sale);
      d.getElementById('valorCusto').value=w.Utils.numeroParaMoeda(cost);
      d.getElementById('valorMilhas').value='R$ 25,00';
      w.calcularMargem(); await w.salvarVenda();
      const saved=w.StorageManager.getTodasVendas()[0];
      assert.ok(saved,w.__errors.join(' '));
      assert.equal(saved.valorCusto,cost);assert.equal(saved.valorLucro,profit);assert.equal(saved.valorMilhas,25);
    } finally {a.dom.window.close();}
  }
});

test('unrelated historical edits preserve missing or inconsistent stored financial fields', async () => {
  for (const values of [{valorVenda:1500,valorCusto:1400},{valorVenda:1500,valorLucro:100},{valorVenda:1500},{valorVenda:1500,valorCusto:1400,valorLucro:123.45}]) {
    const old={id:'old',clienteId:person.id,origem:'BSB',destino:'POA',dataEmbarque:'2025-01-01',horaEmbarque:'10:10',dataVenda:'2024-12-10',horaVenda:'10:00',companhiaAerea:'LA',statusVenda:'emitida',statusPagamento:'pendente',formaPagamento:'pix',quantidadePassageiros:1,clienteViaja:true,localizadores:['SINT123'],...values};
    const a=await fixture({sales:[old]});
    try {
      const w=a.w;w.abrirModalVenda('old');w.document.getElementById('observacoes').value='Revisão sintética';
      await w.salvarVenda();const saved=w.StorageManager.getVendaById('old');
      assert.equal(saved.observacoes,'Revisão sintética');
      for(const k of ['valorVenda','valorCusto','valorLucro'])assert.equal(saved[k],old[k]);
      assert.equal(Object.hasOwn(saved,'valorLucro'),Object.hasOwn(old,'valorLucro'));
      w.abrirModalVenda('old');w.document.getElementById('valorCusto').value='R$ 1.350,00';w.calcularMargem();
      await w.salvarVenda();assert.equal(w.StorageManager.getVendaById('old').valorLucro,150);
    } finally {a.dom.window.close();}
  }
});

test('received payment still requires its date and switching to automatic sale date ignores hidden manual input', async () => {
  const a=await fixture();
  try {
    const w=a.w,d=w.document;await a.waitFor(()=>d.getElementById('clienteId').value===person.id);completeSale(w);
    d.getElementById('statusPagamento').value='recebido';w.toggleValorRecebido();
    d.getElementById('dataPagamento').value='';
    await w.salvarVenda();assert.equal(w.StorageManager.getTodasVendas().length,0);
    assert.equal(d.activeElement.id,'dataPagamento');
    d.getElementById('dataPagamento').value=w.DateFields.today();
    d.getElementById('dataVendaManual').value='9999-01-01';
    assert.equal(d.getElementById('dataVendaAutomatica').checked,true);
    await w.salvarVenda();assert.equal(w.StorageManager.getTodasVendas().length,1);
  } finally {a.dom.window.close();}
});

test('strict calendar, leap day and Brazilian midnight are timezone independent', () => {
  for(const date of ['2028-02-29','2026-12-15','2027-01-01'])assert.ok(DateFields.parse(date));
  for(const date of ['2027-02-29','2026-04-31','0026-12-15','20266-12-15','2026-13-01'])assert.equal(DateFields.parse(date),null);
  assert.equal(DateFields.today(new Date('2027-01-01T02:30:00Z')),'2026-12-31');
  assert.equal(DateFields.today(new Date('2027-01-01T03:00:00Z')),'2027-01-01');
});

test('sales date error focuses the field, retains input, suggests next year and accepts the correction', async () => {
  const a=await fixture();
  try {
    const w=a.w,d=w.document;await a.waitFor(()=>d.getElementById('clienteId').value===person.id);completeSale(w);
    d.getElementById('dataEmbarque').value='2026-12-15';d.getElementById('dataVolta').value='2026-01-01';
    await w.salvarVenda();assert.equal(w.StorageManager.getTodasVendas().length,0);
    assert.equal(d.activeElement.id,'dataVolta');assert.match(d.getElementById('dataVolta').validationMessage,/01\/01\/2027/);
    assert.equal(d.getElementById('dataVolta').value,'2026-01-01');assert.equal(d.getElementById('localizador_1').value,'SINT123');
    d.getElementById('dataVolta').value='2027-01-01';await w.salvarVenda();assert.equal(w.StorageManager.getTodasVendas().length,1);
  } finally {a.dom.window.close();}
});
