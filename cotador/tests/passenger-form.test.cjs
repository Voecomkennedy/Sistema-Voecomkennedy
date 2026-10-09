const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
async function app() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script src="(?:js|assets)\/[^"]+"><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'http://localhost:8765', runScripts: 'dangerously',
    beforeParse(w) { require('../../tests/fixtures/card-rates.cjs').install(w); w.HTMLElement.prototype.scrollIntoView = () => {}; w.alert = () => {}; }
  });
  const w = dom.window;
  for (const file of ['passenger-pricing.js','airport-timezones.js','flight-time.js','timing-form.js']) w.eval(fs.readFileSync(path.join(root, 'js', file), 'utf8'));
  if (w.document.readyState === 'loading') await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  const el = id => w.document.getElementById(id);
  const set = (id, value) => {
    if (el(id).type === 'checkbox') el(id).checked = value; else el(id).value = value;
    el(id).dispatchEvent(new w.Event('input', { bubbles: true }));
    el(id).dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  for (const [id, value] of Object.entries({ 'p-cliente':'Cotação sintética', 'p-orig':'BSB', 'p-dest':'POA',
    'p-data-ida':'2026-10-27', 'p-data-chegada-ida':'2026-10-27', 'p-hora-dep':'10:10', 'p-hora-cheg':'12:45',
    'p-somente-ida':true, 'p-adultos':'2', 'p-bebes':'1', 'p-calc-milhas':'100000', 'p-calc-milheiro':'10,00',
    'p-calc-parcelas':'10', 'p-com-juros':false })) set(id, value);
  return { dom, w, el, set, total: () => Number(el('calc-resultado-box').dataset.totalPix) };
}

test('ages below one and one year do not add a fare; age two uses the child fare', async () => {
  const a = await app();
  try {
    for (const age of ['0','1']) {
      a.set('p-bebe-idade-0', age);
      a.w.calcCotacao();
      assert.equal(a.w.getTotalPax(), 3);
      assert.equal(a.total(), 2000);
      a.w.calcAplicar();
      const data = a.w.coletarDadosProposta();
      assert.equal(data.totalPagantes, 2);
      assert.equal(data.totalPax, 3);
      assert.equal(data.valPix, 'R$ 1.000,00');
      assert.equal(data.valTotalPix, 'R$ 2.000,00');
      assert.equal(data.valCartaoFinal, 'R$ 2.000,00');
      assert.equal(data.valParcela, 'R$ 200,00');
      assert.equal(data.idadesBebes[0], age === '0' ? 'menos de 1 ano' : '1 ano');
    }
    a.set('p-bebes', '0'); a.set('p-criancas', '1'); a.set('p-crianca-idade-0', '2');
    assert.equal(a.total(), 3000);
    a.set('p-calc-cia-milhas', 'GOL'); a.set('p-calc-milhas', '200000');
    assert.equal(a.total(), 2000); // other carriers already quote a group total
  } finally { a.dom.window.close(); }
});

test('explicit infant fee is applied once, with no automatic rule based on destination', async () => {
  const a = await app();
  try {
    for (const dest of ['POA','LIS']) {
      a.set('p-dest', dest);
      assert.equal(a.total(), 2000);
      a.set('p-bebe-valor', '200,00'); a.set('p-bebe-cobranca', 'valor');
      assert.equal(a.total(), 2200);
      a.set('p-bebe-cobranca', 'isento');
      assert.equal(a.total(), 2000);
    }
    a.set('p-dest', 'POA'); a.set('p-bebe-cobranca', 'valor'); a.w.calcAplicar();
    const data = a.w.coletarDadosProposta();
    assert.equal(data.totalPagantes, 3);
    assert.equal(data.paxTarifaBase, 2);
    assert.equal(data.valPix, 'R$ 1.000,00');
    assert.equal(data.valTotalPix, 'R$ 2.200,00');
    assert.equal(data.valParcela, 'R$ 220,00');
    a.w.limparProposta(); a.w.restaurarProposta(JSON.parse(JSON.stringify(data)));
    const restored = a.w.coletarDadosProposta();
    assert.equal(restored.babyPricing.valorPorBebe, '200,00');
    assert.equal(restored.valTotalPix, data.valTotalPix);
    assert.equal(restored.valParcela, data.valParcela);
    assert.equal(a.el('p-bebe-cobranca').value, 'valor');
    a.set('p-calc-tipo', 'por-valor-real'); a.set('p-calc-valor-vista', '2000,00');
    a.w.calcCotacao(); assert.equal(a.total(), 2200);
  } finally { a.dom.window.close(); }
});

test('passenger edits preserve typed totals and restored negotiated card amounts', async () => {
  const a = await app();
  try {
    a.set('p-val-total-pix', '4778,43'); a.set('p-val-cartao', '5277,70'); a.set('p-parcelas', '10');
    a.set('p-bebe-idade-0', '1'); a.set('p-bebes', '2');
    assert.equal(a.el('p-bebe-idade-0').value, '1');
    assert.equal(a.el('p-val-total-pix').value, '4778,43');
    assert.equal(a.el('p-val-cartao').value, '5277,70');
    assert.equal(a.el('p-val-pix-pessoa').value, 'R$ 2.389,22');
    a.set('p-bebes', '1');
    const data = a.w.coletarDadosProposta();
    data.valCartaoFinal = 'R$ 5.400,00'; data.valParcela = 'R$ 540,00';
    a.w.restaurarProposta(data);
    assert.equal(a.w.coletarDadosProposta().valCartaoFinal, 'R$ 5.400,00');
    assert.equal(a.w.coletarDadosProposta().valParcela, 'R$ 540,00');
    a.set('p-adultos', '3');
    assert.equal(a.el('p-val-total-pix').value, '4778,43');
    assert.equal(a.el('p-val-cartao').value, '5277,70');
    assert.equal(a.w.coletarDadosProposta().valCartaoFinal, 'R$ 5.400,00');
    a.set('p-bebe-cobranca', 'valor'); a.set('p-bebe-valor', '5000,00');
    assert.equal(a.w.coletarDadosProposta(), undefined);
  } finally { a.dom.window.close(); }
});

test('baggage and all four fares use the main fare count and keep hotel totals on restore', async () => {
  const a = await app();
  try {
    a.set('p-bebe-valor', '200,00'); a.set('p-bebe-cobranca', 'valor');
    a.set('p-calc-bag-custo', '100,00'); a.set('p-calc-bag-ativo', true); a.w.calcCotacao();
    const bag = a.el('calc-bag-resultado').dataset;
    assert.equal(Number(bag.baseTotal), 2200);
    assert.equal(Number(bag.comTotal), 2600);
    assert.equal(Number(bag.comPP), 1200);
    a.set('p-bebe-valor', '300,00');
    assert.equal(Number(bag.baseTotal), 2300);
    assert.equal(Number(bag.comTotal), 2700);
    a.set('p-bebe-valor', '200,00');
    a.w.calcBagAplicar('com');
    const legacyBag = a.w.coletarDadosProposta();
    delete legacyBag.babyPricing;
    a.w.restaurarProposta(legacyBag);
    assert.equal(a.w.coletarDadosProposta().calc.bagAdd.bagRes.comTotal, legacyBag.calc.bagAdd.bagRes.comTotal);
    a.set('p-bebe-cobranca', 'valor');
    a.set('p-bebe-valor', '200,00');
    a.set('p-calc-bag-ativo', false); a.set('p-calc-comp-ativo', true);
    for (const [id, value] of Object.entries({ 'p-calc-milhas-ida-light':'100000', 'p-calc-milhas-ida-standard':'150000',
      'p-calc-milhas-volta-light':'120000', 'p-calc-milhas-volta-standard':'170000' })) a.set(id, value);
    const opts = a.el('calc-comp-resultado').dataset;
    assert.deepEqual(['A','B','C','D'].map(key => JSON.parse(opts['opt'+key]).total), [4600,6600,5600,5600]);
    assert.equal(JSON.parse(opts.optA).porPessoa, 2200);
    a.w.calcCompAplicar('a'); a.set('p-hotel-nome', 'Hotel sintético');
    const data = a.w.coletarDadosProposta();
    a.w.restaurarProposta(data);
    const restored = a.w.coletarDadosProposta();
    assert.equal(restored.calc.compOptA, data.calc.compOptA);
    assert.equal(restored.valTotalPix, data.valTotalPix);
    assert.equal(restored.hotelNome, 'Hotel sintético');
  } finally { a.dom.window.close(); }
});

test('history stores infant pricing and legacy restoration preserves recorded prices', async () => {
  const a = await app();
  try {
    a.w.calcAplicar();
    a.w.ProposalPDF = {};
    a.w.ProposalDownload = { download: async () => true };
    await a.w.gerarProposta();
    const history = a.w.getHist();
    assert.equal(history.length, 1);
    assert.equal(history[0].dados.totalPax, 3);
    assert.equal(history[0].dados.totalPagantes, 2);
    a.w.limparProposta(); a.w.reabrirHist(history[0].id);
    assert.equal(a.w.coletarDadosProposta().valTotalPix, 'R$ 2.000,00');
    const legacy = { ...history[0].dados, babyPricing: undefined, valPix: 'R$ 900,00', valTotalPix: 'R$ 2.700,00' };
    a.w.restaurarProposta(legacy);
    assert.equal(a.el('p-bebe-cobranca').value, 'revisar');
    assert.equal(a.el('p-val-total-pix').value, 'R$ 2.700,00');
    assert.equal(a.el('p-val-pix-pessoa').value, 'R$ 900,00');
    assert.equal(a.w.coletarDadosProposta().totalPagantes, null);
    a.w.limparProposta();
    assert.equal(a.el('p-bebe-cobranca').value, 'isento');
    assert.equal(a.el('p-bebe-valor').value, '');
  } finally { a.dom.window.close(); }
});

test('12x uses the shared cloud table in calculator and proposal; restored totals and rate survive later changes', async () => {
  const a=await app();
  try {
    a.set('p-bebes','0'); a.set('p-calc-parcelas','12'); a.set('p-com-juros',true);
    a.w.calcCotacao();
    assert.equal(a.el('p-calc-parcelas').value,'12');
    a.w.calcAplicar();
    const data=a.w.coletarDadosProposta();
    assert.equal(data.parcelas,'12'); assert.equal(data.juroInfo.taxa,'18,29%');
    assert.equal(data.valCartaoFinal,a.el('calc-total-parcelado').textContent);
    const newer={...require('../../js/card-rates.js').DEFAULTS,12:25};
    const R=require('../../js/card-rates.js');
    a.w.CardRatesService={ready:true,entry:n=>R.entry(newer,n),calculate:(base,n)=>R.calculate(base,n,newer)};
    a.w.restaurarProposta(JSON.parse(JSON.stringify(data)));
    a.w.refreshCardRates();
    const restored=a.w.coletarDadosProposta();
    assert.equal(restored.valCartaoFinal,data.valCartaoFinal);
    assert.equal(restored.valParcela,data.valParcela);
    assert.equal(restored.juroInfo.taxa,'18,29%');
    a.set('p-val-cartao','3000,00');
    const changed=a.w.coletarDadosProposta();
    assert.equal(changed.juroInfo.taxa,'25,00%'); assert.equal(changed.valCartaoFinal,'R$ 4.000,00');
    a.w.CardRatesService.ready=false;
    assert.equal(a.w.coletarDadosProposta(),undefined);
  } finally { a.dom.window.close(); }
});
