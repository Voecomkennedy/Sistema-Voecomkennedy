const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/passenger-pricing');
const PDF = require('../js/proposal-pdf');
const d = { adultos: 2, criancas: 0, bebes: 1, totalPax: 3, babyPricing: { mode: 'isento' } };

test('babies below two years are travelers without a standard fare when exempt', () => {
  for (const age of ['menos de 1 ano', '1 ano']) {
    const data = { ...d, idadesBebes: [age] };
    assert.equal(P.summary(data).totalPax, 3);
    assert.equal(P.summary(data).payingPax, 2);
    assert.deepEqual(P.quote(1000, true, data), { total: 2000, porPessoa: 1000 });
    assert.equal(P.perPerson(2000, data), 1000);
  }
  const child = { ...d, bebes: 0, criancas: 1, idadesCriancas: ['2'] };
  assert.equal(P.summary(child).payingPax, 3);
  assert.equal(P.quote(1000, true, child).total, 3000);
});

test('only the explicitly configured infant fare is added in any itinerary', () => {
  assert.equal(P.summary({ ...d, babyPricing: { mode: 'valor', valorPorBebe: '1.000' } }).babyTotal, 1000);
  for (const dest of ['POA', 'LIS']) {
    const data = { ...d, dest, babyPricing: { mode: 'valor', valorPorBebe: 'R$ 200,00' } };
    assert.deepEqual(P.quote(1000, true, data), { total: 2200, porPessoa: 1000 });
    assert.deepEqual(P.quote(2000, false, data), { total: 2200, porPessoa: 1000 });
    assert.equal(P.summary(data).payingPax, 3);
    assert.equal(P.perPerson(2200, data), 1000);
    assert.equal(P.perPerson(4778.43, data), 2289.215); // closed total already includes the infant fee
  }
});

test('legacy prices are not repriced or labeled exempt without a recorded decision', () => {
  const legacy = { ...d, babyPricing: undefined, valPix: 'R$ 900,00', valTotalPix: 'R$ 2.700,00' };
  assert.equal(P.summary(legacy).known, false);
  assert.equal(P.summary(legacy).payingPax, null);
  assert.throws(() => P.quote(1000, true, legacy), /Confira/);
  const html = PDF.render(legacy);
  assert.match(html, /R\$ 900,00/);
  assert.match(html, /R\$ 2.700,00/);
  assert.doesNotMatch(html, /bebê isento/);
});

test('invalid infant charges and charges exceeding a closed total require review', () => {
  for (const value of ['', '-10', 'abc', 'Infinity']) assert.throws(() => P.summary({ ...d, babyPricing: { mode: 'valor', valorPorBebe: value } }), /valor válido/);
  assert.throws(() => PDF.render({ ...d, valTotalPix: '100,00', babyPricing: { mode: 'valor', valorPorBebe: '200,00' } }), /supera/);
  assert.equal(P.summary({ ...d, babyPricing: { mode: 'valor', valorPorBebe: '0,00' } }).payingPax, 2);
});

test('PDF labels distinguish three travelers, the main fare and infant charges', () => {
  const html = PDF.render({ ...d, valPix: 'R$ 1.000,00', valTotalPix: 'R$ 2.000,00' });
  assert.match(html, /2 adultos · 1 bebê/);
  assert.match(html, /2 na tarifa principal/);
  assert.match(html, /1 bebê isento/);
  assert.match(html, /Por adulto\/criança no Pix/);
  const charged = PDF.render({ ...d, valPix: '1000', valTotalPix: '2200', babyPricing: { mode: 'valor', valorPorBebe: '200,00' } });
  assert.match(charged, /Tarifa de bebê: R\$\s200,00/);
});
