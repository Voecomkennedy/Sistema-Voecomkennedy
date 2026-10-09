const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const WhatsApp = require('../js/proposal-whatsapp.js');
const PDF = require('../cotador/js/proposal-pdf.js');

function snapshot(overrides = {}) {
    return {
        cliente: 'Cliente sintético', adultos: 2, criancas: 0, bebes: 0, totalPax: 2,
        orig: 'GYN — Goiânia', dest: 'GRU — São Paulo', cia: 'LATAM', classe: 'Econômica',
        dataIdaISO: '2026-11-01', dataVoltaISO: '2026-11-10',
        depIda: '10:00', chegIda: '11:30', depVolta: '12:00', chegVolta: '13:30',
        paradaIda: 'direto', paradaVolta: 'direto', bagMao: '1 peça de 10 kg',
        bagDespIda: '1 mala de 23 kg', bagDespVolta: '2 malas de 23 kg',
        valPix: 'R$ 1.000,00', valTotalPix: 'R$ 2.000,00',
        ...overrides
    };
}
const generate = d => WhatsApp.generate({ propostaCompleta: d });

test('complete snapshot overrides the lossy legacy summary for each route and carrier', () => {
    const d = snapshot({ multitrecho: true, origVolta: 'CWB — Curitiba', destVolta: 'VCP — Campinas', ciaVolta: 'GOL', ciaOperadoraVolta: 'Companhia parceira' });
    const quote = { origem: 'ROTA ANTIGA', companhiaAerea: 'CIA ANTIGA', valorTotalPix: 1, propostaCompleta: d };
    const before = JSON.stringify(quote);
    const message = WhatsApp.generate(quote);
    const [outbound, inbound] = message.split('*VOLTA*');
    assert.match(outbound, /GYN — Goiânia → GRU — São Paulo/);
    assert.match(outbound, /Companhia: LATAM/);
    assert.match(inbound, /CWB — Curitiba → VCP — Campinas/);
    assert.match(inbound, /Companhia: GOL\nOperado por Companhia parceira/);
    assert.doesNotMatch(inbound, /GRU — São Paulo → GYN — Goiânia/);
    assert.doesNotMatch(message, /ROTA ANTIGA|CIA ANTIGA/);
    assert.equal(JSON.stringify(quote), before, 'generation must not mutate stored data');
});

test('hand baggage and checked baggage remain scoped to the correct leg', () => {
    const [outbound, inbound] = generate(snapshot()).split('*VOLTA*');
    assert.match(outbound, /Bagagem de mão: 1 peça de 10 kg/);
    assert.match(outbound, /Bagagem despachada: 1 mala de 23 kg/);
    assert.match(inbound, /Bagagem despachada: 2 malas de 23 kg/);
    assert.doesNotMatch(outbound, /2 malas de 23 kg/);
});

test('one-way suppresses stale return values and preserves all flight connections', () => {
    const message = generate(snapshot({
        somenteIda: true, ciaVolta: 'COMPANHIA NÃO UTILIZADA', paradaIda: '3escalas',
        escalaCidadeIda: 'BSB', escalaTempoIda: '1h', escalaCidade2Ida: 'GRU', escalaTempo2Ida: '4h',
        escalaCidade3Ida: 'CWB', escalaTempo3Ida: '2h', trocaIda2: true, trocaIda2Dest: 'CGH',
        vooIda: 'LA1111', vooIda2: 'LA2222', vooIda3: 'LA3333', vooIda4: 'LA4444',
        timing: { fields: { 'p-data-chegada-ida': '2026-11-02' } }
    }));
    assert.doesNotMatch(message, /VOLTA|COMPANHIA NÃO UTILIZADA|2 malas de 23 kg/);
    assert.match(message, /Data de chegada: 02\/11\/2026/);
    assert.match(message, /LA1111 · LA2222 · LA3333 · LA4444/);
    assert.match(message, /Troca de aeroporto: GRU → CGH · espera 4h/);
    assert.match(message, /Conexão em CWB · espera 2h/);
});

test('absent or invalid prices never become zero-value card or Pix offers', () => {
    const pixOnly = generate(snapshot());
    assert.match(pixOnly, /Total no Pix · 2 passageiro\(s\): R\$ 2\.000,00/);
    assert.doesNotMatch(pixOnly, /Cartão:|0x|1x de|Taxas inclusas/);
    for (const invalid of ['', '0', '-10', 'NaN', 'Infinity']) {
        const message = generate(snapshot({ valPix: invalid, valTotalPix: invalid, valCartaoBase: invalid, valCartaoFinal: invalid, valParcela: invalid, parcelas: '10' }));
        assert.doesNotMatch(message, /\*VALORES\*|Cartão:|R\$|NaN|Infinity/);
    }
});

test('recorded card total and installments survive without recalculation', () => {
    const message = generate(snapshot({ valCartaoBase: '2.000,00', valCartaoFinal: '2.333,30', valParcela: '233,33', parcelas: '10', comJuros: true }));
    assert.match(message, /Cartão: 10x de R\$ 233,33\ntotal R\$ 2\.333,30/);
    assert.doesNotMatch(message, /sem juros/);
    const cashCard = generate(snapshot({ valCartaoBase: '2.100,00', valCartaoFinal: '2.100,00', parcelas: '1', comJuros: false }));
    assert.match(cashCard, /Cartão: R\$ 2\.100,00\nà vista no cartão/);
});

test('Brazilian thousands without cents are not reduced to single-real prices', () => {
    const message = generate(snapshot({ valPix: '1.000', valTotalPix: '2.000', valCartaoBase: '2.500', valCartaoFinal: '2.500', valParcela: '250', parcelas: '10' }));
    assert.match(message, /Por pessoa no Pix: R\$ 1\.000,00/);
    assert.match(message, /Total no Pix · 2 passageiro\(s\): R\$ 2\.000,00/);
    assert.match(message, /Cartão: 10x de R\$ 250,00\ntotal R\$ 2\.500,00/);
    const decimal = generate(snapshot({ valPix: 1000.5, valTotalPix: '2001.00' }));
    assert.match(decimal, /Por pessoa no Pix: R\$ 1\.000,50/);
    assert.match(decimal, /Total no Pix · 2 passageiro\(s\): R\$ 2\.001,00/);
});

test('baby fare presentation uses the same customer labels as the PDF', () => {
    const paidBaby = generate(snapshot({ bebes: 1, totalPax: 3, valTotalPix: '2.200,00', babyPricing: { mode: 'valor', valorPorBebe: '200,00' } }));
    assert.match(paidBaby, /2 adultos, 1 bebê/);
    assert.match(paidBaby, /Por adulto\/criança no Pix: R\$ 1\.000,00/);
    assert.match(paidBaby, /Total no Pix · 3 passageiro\(s\): R\$ 2\.200,00/);
    assert.match(paidBaby, /Tarifa de bebê: R\$ 200,00 por bebê/);
    const freeBaby = generate(snapshot({ bebes: 1, totalPax: 3, babyPricing: { mode: 'isento' } }));
    assert.match(freeBaby, /1 bebê isento/);
    assert.doesNotMatch(freeBaby, /Por pessoa no Pix/);
});

test('hotel, public observations and safe links are preserved without leaking internal calculation data', () => {
    const message = generate(snapshot({
        hotelNome: 'Hotel sintético', hotelCheckin: '2026-11-01', hotelCheckout: '2026-11-10', hotelNoites: '9', hotelRegime: 'Café da manhã',
        linkHotel: 'https://example.test/hotel', linkAereo: 'https://example.test/voo', obs: 'Reembolso não permitido.\nConfira a grafia dos nomes.',
        calc: { fornecedor: 'FORNECEDOR PRIVADO', lucro: 'LUCRO PRIVADO', milhas: 'MILHAS PRIVADAS', milheiro: 'CUSTO PRIVADO' }
    }));
    for (const expected of ['Hotel sintético', 'Check-in: 01/11/2026', 'Check-out: 10/11/2026', '9 noite(s)', 'Café da manhã', 'https://example.test/hotel', 'https://example.test/voo', 'Reembolso não permitido.']) assert.ok(message.includes(expected), expected);
    assert.doesNotMatch(message, /PRIVADO|PRIVADAS|Taxas inclusas/);
    const unsafe = generate(snapshot({ hotelNome: 'Hotel', linkHotel: 'javascript:alert(1)', linkAereo: 'https://user:password@example.test/' }));
    assert.doesNotMatch(unsafe, /javascript:|user:password/);
});

test('comparisons reuse validated public PDF options instead of exposing their source calculation', () => {
    const calc = { compAtivo: true, compOpcaoSelecionada: 'b', fornecedor: 'FORNECEDOR PRIVADO' };
    for (const [i, key] of ['A', 'B', 'C', 'D'].entries()) {
        calc['compOpt' + key] = JSON.stringify({ label: 'Tarifa ' + key, total: 2000 + i * 200, porPessoa: 1000 + i * 100, custoInterno: 'SEGREDO INTERNO' });
    }
    const d = snapshot({ calc, valTotalPix: '2.200,00', valCartaoBase: '2.300,00', valCartaoFinal: '2.500,00', valParcela: '250,00', parcelas: '10' });
    const message = generate(d);
    for (const row of PDF.options(d)) assert.ok(message.includes(row.label), row.label);
    assert.equal((message.match(/Opção \d/g) || []).length, 4);
    assert.match(message, /Opção 2 · selecionada: Tarifa B/);
    assert.equal((message.match(/Cartão:/g) || []).length, 1, 'negotiated card must stay on its selected option');
    assert.match(message, /Bagagem despachada conforme opção escolhida/);
    assert.doesNotMatch(message, /Bagagem despachada: 1 mala|FORNECEDOR PRIVADO|SEGREDO INTERNO/);
});

test('baggage comparison uses the saved interest rate and the existing PDF card rules', () => {
    const d = snapshot({
        valPix: 'R$ 3.665,89', valTotalPix: 'R$ 7.331,78', valCartaoBase: 'R$ 7.331,78', valCartaoFinal: 'R$ 8.097,84', valParcela: 'R$ 809,78', parcelas: '10', comJuros: true,
        juroInfo: { n: 10, taxa: '9,46%' },
        calc: { bagAdd: { ativo: true, opcaoSelecionada: 'sem', bagRes: { baseTotal: '7331.78', basePP: '3665.89', comTotal: '8731.78', comPP: '4365.89', detalhe: '1 mala por pessoa', trechoLabel: 'ida e volta' } } }
    });
    const message = generate(d);
    for (const option of PDF.options(d)) {
        const expected = PDF.cardForOption(d, option, { cardDivisor: .9054 });
        assert.ok(message.includes(expected.label.replace(/\u00a0/g, ' ')), expected.label);
    }
    assert.match(message, /Sem mala despachada/);
    assert.match(message, /Com mala despachada/);
    assert.match(message, /1 mala por pessoa · ida e volta/);
    const negotiated = generate({ ...d, valCartaoFinal: '9.000,00', valParcela: '900,00' });
    assert.equal((negotiated.match(/Cartão:/g) || []).length, 1);
    assert.match(negotiated, /10x de R\$ 900,00/);
});

test('invalid comparison blocks copying rather than falling back to the lossy quote summary', () => {
    assert.throws(() => generate(snapshot({ calc: { compAtivo: true } })), /Recalcule/);
    assert.throws(() => generate(snapshot({ calc: { bagAdd: { ativo: true } } })), /Recalcule/);
});

test('panel copies complete proposals through the new generator and keeps the legacy clipboard path', async () => {
    const html = fs.readFileSync(path.join(__dirname, '../cotacoes.html'), 'utf8');
    assert.match(html, /src="js\/proposal-whatsapp\.js\?v=2"/);
    const code = html.slice(html.indexOf('        function copiarParaWhatsApp(id)'), html.indexOf('        // Fallback: mostrar texto em modal'));
    const full = { id: 'full', propostaCompleta: snapshot({ multitrecho: true, origVolta: 'CWB', destVolta: 'VCP' }) };
    const legacy = { id: 'legacy', origem: 'BSB', destino: 'GIG', companhiaAerea: 'LATAM', tipoTarifa: 'Light', adultos: 1, tipoViagem: 'so-ida', dataSaidaIda: '2026-11-01', horaSaidaIda: '10:00', horaChegadaIda: '11:00', valorTotalPix: 1000, valorParcela: 100, totalParcelado: 1000, numParcelas: 10 };
    const messages = [], successes = [], alerts = [];
    const context = {
        AEROPORTOS_IATA: [], URL,
        StorageManager: { getCotacaoById: id => [full, legacy].find(q => q.id === id) },
        navigator: { clipboard: { writeText: async text => { messages.push(text); } } },
        Utils: { formatCurrency: n => 'R$ ' + Number(n).toFixed(2), showSuccess: text => successes.push(text) },
        alert: text => alerts.push(text), console
    };
    vm.createContext(context);
    for (const file of ['cotador/js/passenger-pricing.js', 'cotador/js/proposal-pdf.js', 'js/proposal-whatsapp.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
    }
    vm.runInContext(code, context);
    context.copiarParaWhatsApp('full');
    context.copiarParaWhatsApp('legacy');
    await new Promise(resolve => setImmediate(resolve));
    assert.match(messages[0], /CWB → VCP/);
    assert.match(messages[1], /BSB → GIG/);
    assert.equal(successes.length, 2);
    assert.deepEqual(alerts, []);
    assert.doesNotMatch(code, /window\.open|fetch\(|\.send\(/, 'copy action must not send or open WhatsApp');
});
