(function (root) {
  'use strict';
  const count = value => Math.max(0, Math.floor(Number(value) || 0));
  const money = value => {
    if (typeof value === 'number') return value;
    const raw = String(value ?? '').replace(/R\$|\s/g, '');
    if (raw === '') return NaN;
    if (raw.includes(',')) return Number(raw.replace(/\./g, '').replace(',', '.'));
    return Number(/^-?\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, '') : raw);
  };
  function summary(d) {
    const adults = count(d.adultos), children = count(d.criancas), babies = count(d.bebes);
    const basePax = Math.max(1, adults + children || (!babies ? count(d.totalPax) : 0)), totalPax = Math.max(1, adults + children + babies || count(d.totalPax));
    const mode = d.babyPricing?.mode || 'revisar';
    const known = !babies || mode === 'isento' || mode === 'valor';
    const fee = babies && mode === 'valor' ? money(d.babyPricing.valorPorBebe) : 0;
    if (!Number.isFinite(fee) || fee < 0) throw new Error('Informe um valor válido para a tarifa de bebê.');
    return { basePax, totalPax, babies, known, mode, fee, babyTotal: fee * babies,
      payingPax: known ? adults + children + (fee > 0 ? babies : 0) : null };
  }
  function quote(base, perPerson, d) {
    const p = summary(d);
    if (!p.known) throw new Error('Confira a isenção ou tarifa de bebê antes de recalcular.');
    const ordinary = perPerson ? base * p.basePax : base;
    return { total: ordinary + p.babyTotal, porPessoa: ordinary / p.basePax };
  }
  function perPerson(total, d) {
    const p = summary(d);
    if (!p.known) return total / p.totalPax; // Legacy totals are preserved until reviewed.
    if (total < p.babyTotal) throw new Error('A tarifa dos bebês supera o total informado. Confira os valores.');
    return (total - p.babyTotal) / p.basePax;
  }
  function presentation(d) {
    const p = summary(d);
    if (p.babies && p.known && money(d.valTotalPix) >= 0) perPerson(money(d.valTotalPix), d);
    const brl = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    return {
      label: p.babies && p.known ? 'Por adulto/criança no Pix' : 'Por pessoa no Pix',
      basis: p.babies && p.known ? p.basePax + ' na tarifa principal' : p.totalPax + ' passageiro' + (p.totalPax > 1 ? 's' : ''),
      note: !p.babies || !p.known ? '' : p.fee > 0
        ? 'Tarifa de bebê: ' + brl(p.fee) + ' por bebê · ' + p.babies + (p.babies === 1 ? ' bebê' : ' bebês') + ' · total ' + brl(p.babyTotal)
        : p.babies + (p.babies === 1 ? ' bebê isento' : ' bebês isentos'),
      ...p
    };
  }
  const api = { summary, quote, perPerson, presentation };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PassengerPricing = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
