// Synthetic fixtures only: network and account synchronization are stubbed.
const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture, fill, frame} = require('./helpers/proposal-form.cjs');
const {page, person} = require('./helpers/proposal-dom.cjs');
const PDF = require('../cotador/js/proposal-pdf.js');
const Download = require('../cotador/js/proposal-download.js');
const WhatsApp = require('../js/proposal-whatsapp.js');
const pdfMake = require('../cotador/assets/vendor/pdfmake.min.js');
const fs = require('node:fs');
const path = require('node:path');
pdfMake.addVirtualFileSystem(require('../cotador/assets/vendor/vfs_fonts.js'));
pdfMake.addVirtualFileSystem(Object.fromEntries(Download.fontFiles.map(file => [file,
    fs.readFileSync(path.join(__dirname, '../cotador/assets/fonts/pdf', file)).toString('base64')])));
pdfMake.addFonts(Download.fontDefinitions);

const sample = {
    cliente:'Cliente sintético', orig:'BSB — Brasília', dest:'POA — Porto Alegre', cia:'LATAM',
    adultos:2, totalPax:2, dataIdaISO:'2027-10-27', dataVoltaISO:'2027-11-02',
    valPix:'R$ 1.000,00', valTotalPix:'R$ 2.000,00', valCartaoBase:'R$ 2.200,00',
    valCartaoFinal:'R$ 2.200,00', valParcela:'R$ 220,00', parcelas:'10', comJuros:false
};
function setPix(f, checked) {
    const el = f.document.getElementById('p-somente-pix');
    el.checked = checked;
    el.dispatchEvent(new f.Event('change', {bubbles:true}));
}
function assertPixOnly(text) {
    text = text.replace(/\u00a0/g, ' ');
    assert.ok(text.includes('R$ 2.000,00'));
    assert.equal(text.split(PDF.pixOnlyNote).length - 1, 1);
    assert.doesNotMatch(text, /Cartão de crédito|CARTÃO DE CRÉDITO|Cartão:|Cartão ·|10x|220,00|2\.200,00|sem juros|R\$ 0,00|gratuito/i);
}

test('Pix-only saves before PDF without card fields or a rate service, survives reload and copying into a new quote', async () => {
    const a = await fixture(); let entries, originalId;
    try {
        const w = a.window, f = frame(w);
        w.novaPropostaCompleta(); fill(w, 'Pix exclusivo', 2);
        f.document.getElementById('p-val-cartao').value = '';
        f.document.getElementById('p-parcelas').value = '';
        f.currentCardRate = () => { throw new Error('Rate lookup forbidden in Pix-only mode'); };
        setPix(f, true);
        assert.equal(f.document.getElementById('p-cartao-fields').hidden, true);
        for (const id of ['p-val-cartao','p-parcelas','p-com-juros']) assert.equal(f.document.getElementById(id).disabled, true);
        let exported;
        f.ProposalDownload.download = async data => {
            exported = data;
            assert.equal(w.StorageManager.getCotacoes().length, 1, 'commit precedes PDF');
        };
        await f.gerarProposta();
        assert.equal(exported.somentePix, true);
        assert.equal(exported.valCartaoFinal, '');
        assert.equal(exported.valParcela, '');
        assert.equal(exported.juroInfo, null);
        const quote = w.StorageManager.getCotacoes()[0]; originalId = quote.id;
        for (const key of ['numParcelas','valorParcela','totalParcelado']) assert.equal(quote[key], null);
        assert.equal(quote.somentePix, true);
        assertPixOnly(WhatsApp.generate(quote));
        entries = {emissao_pessoas:[person], emissao_cotacoes:JSON.parse(w.localStorage.getItem('emissao_cotacoes'))};
    } finally { a.dom.window.close(); }
    const loaded = await page('cotacoes', entries);
    try {
        const w = loaded.window, f = frame(w);
        await w.editarPropostaCompleta(originalId);
        assert.equal(f.document.getElementById('p-somente-pix').checked, true);
        assert.equal(f.coletarDadosProposta().somentePix, true);
        // Reuse the saved snapshot as a new proposal without adding a duplicate UI.
        const snapshot = JSON.parse(JSON.stringify(w.StorageManager.getCotacaoById(originalId).propostaCompleta));
        w.novaPropostaCompleta();
        assert.equal(f.document.getElementById('p-somente-pix').checked, false, 'Novo resets the choice');
        f.restaurarProposta(snapshot); w.selecionarContatoProposta(person.id);
        await w.salvarPropostaCompleta();
        const quotes = w.StorageManager.getCotacoes();
        assert.equal(quotes.length, 2);
        assert.notEqual(quotes[1].id, originalId);
        assert.equal(quotes[1].propostaCompleta.somentePix, true);
        assert.equal(quotes[0].propostaRevisao, 1);
    } finally { loaded.dom.window.close(); }
});

test('Pix-only ignores stale card rates, toggling off restores existing calculation, and old quotes reset the choice', async () => {
    const a = await fixture();
    try {
        const w = a.window, f = frame(w);
        w.novaPropostaCompleta(); fill(w, 'Cartão existente', 2);
        const before = f.coletarDadosProposta();
        const originalRate = f.currentCardRate;
        setPix(f, true);
        f.currentCardRate = () => { throw new Error('No card lookup'); };
        const pix = f.coletarDadosProposta();
        assert.equal(pix.somentePix, true);
        assert.equal(pix.valTotalPix, before.valTotalPix);
        f.currentCardRate = originalRate; setPix(f, false);
        const after = f.coletarDadosProposta();
        assert.equal(after.somentePix, false);
        for (const key of ['valCartaoBase','valCartaoFinal','valParcela','parcelas','comJuros']) assert.equal(after[key], before[key]);
        await w.salvarPropostaCompleta();
        const saved = w.StorageManager.getCotacoes()[0];
        assert.equal(saved.propostaCompleta.somentePix, false);
        assert.ok(saved.totalParcelado > 0);
        setPix(f, true);
        delete before.somentePix;
        f.restaurarProposta(before);
        assert.equal(f.document.getElementById('p-somente-pix').checked, false);
        assert.equal(f.document.getElementById('p-cartao-fields').hidden, false);
        assert.equal(f.document.getElementById('p-parcelas').disabled, false);
        assert.equal(f.coletarDadosProposta().valCartaoFinal, before.valCartaoFinal);
        f.limparProposta(); assert.equal(f.document.getElementById('p-somente-pix').checked, false);
    } finally { a.dom.window.close(); }
});

test('Pix-only requires a positive Pix amount, never silently produces a free quote', async () => {
    const a = await fixture();
    try {
        const w = a.window, f = frame(w); w.novaPropostaCompleta(); fill(w, 'Valor inválido', 2); setPix(f, true);
        for (const invalid of ['', '0', '-10', 'NaN', 'Infinity']) {
            f.document.getElementById('p-val-total-pix').value = invalid;
            assert.equal(f.coletarDadosProposta(), undefined, invalid);
        }
        assert.equal(w.StorageManager.getCotacoes().length, 0);
    } finally { a.dom.window.close(); }
});

test('the internal calculator also offers Pix without installments or a card-rate service', async () => {
    const a = await fixture();
    try {
        const w = a.window, f = frame(w); w.novaPropostaCompleta(); fill(w, 'Calculadora Pix', 2);
        f.HTMLElement.prototype.scrollIntoView = () => {};
        const el = id => f.document.getElementById(id);
        el('p-calc-tipo').value = 'por-milhas'; el('p-calc-cia-milhas').value = 'LATAM';
        el('p-calc-milhas').value = '100000'; el('p-calc-milheiro').value = '10,00';
        f.calcCotacao();
        const baseline = el('calc-resultado-box').dataset.totalPix;
        assert.equal(baseline, '2000.00');
        f.CardRatesService = {ready:false};
        f.currentCardTotal = () => { throw new Error('No rate calculation for Pix'); };
        setPix(f, true); el('p-calc-parcelas').value = ''; f.calcCotacao();
        assert.equal(el('calc-resultado-box').style.display, '');
        assert.equal(el('calc-resultado-box').dataset.totalPix, baseline);
        assert.equal(el('calc-cartao-fields').hidden, true);
        assert.equal(el('p-calc-parcelas').disabled, true);
        f.calcAplicar();
        assert.equal(f.coletarDadosProposta().valTotalPix, 'R$ 2.000,00');
        el('p-calc-tipo').value = 'por-valor-real'; el('p-calc-valor-vista').value = '1.800,00';
        el('p-calc-lucro').value = '200,00'; f.calcCotacao();
        assert.equal(el('calc-resultado-box').dataset.totalPix, '2000.00');
    } finally { a.dom.window.close(); }
});

const comparisons = {
    standard: {},
    baggage: {bagAdd:{ativo:true,opcaoSelecionada:'sem',bagRes:{baseTotal:2000,basePP:1000,comTotal:2400,comPP:1200}}},
    fourFares: {compAtivo:true,compOpcaoSelecionada:'a',...Object.fromEntries(['A','B','C','D'].map((key,i) =>
        ['compOpt'+key,JSON.stringify({label:'Tarifa '+key,total:2000+i*200,porPessoa:1000+i*100})]))}
};
for (const [mode, calc] of Object.entries(comparisons)) {
    test(`Pix-only ${mode} hides stale card offers in preview, actual PDF and shareable text`, async () => {
        const d = {...sample, somentePix:true, calc};
        // Different Pix options may legitimately contain 2.200,00; use a distinct stale card amount.
        d.valCartaoBase = d.valCartaoFinal = 'R$ 9.999,99'; d.valParcela = 'R$ 999,99';
        const html = PDF.render(d, {cardDivisor:1});
        const doc = Download.definition(d, {cardDivisor:1});
        const text = WhatsApp.generate({propostaCompleta:d});
        for (const rendered of [html, JSON.stringify(doc.content), text]) {
            assert.equal(rendered.split(PDF.pixOnlyNote).length - 1, 1);
            assert.match(rendered, /R\$\s2\.000,00/);
            assert.doesNotMatch(rendered, /Cartão de crédito|CARTÃO DE CRÉDITO|Cartão:|Cartão ·|10x|999,99|9\.999,99|sem juros|R\$\s0,00|gratuito/i);
        }
        for (const option of PDF.options(d)) assert.equal(PDF.cardForOption(d, option, {cardDivisor:1}), null);
        const bytes = await new Promise(resolve => pdfMake.createPdf(doc).getBuffer(resolve));
        assert.equal(bytes.subarray(0,4).toString(), '%PDF');
        assert.match(bytes.toString('latin1'), /\/FontFile2\b/);
    });
}

test('missing option and explicit false preserve the legacy PDF, preview and message behavior', () => {
    for (const calc of Object.values(comparisons)) {
        const old = {...sample, calc}, off = {...old, somentePix:false};
        assert.equal(PDF.render(old, {cardDivisor:1}), PDF.render(off, {cardDivisor:1}));
        assert.equal(JSON.stringify(Download.definition(old)), JSON.stringify(Download.definition(off)));
        assert.equal(WhatsApp.generate({propostaCompleta:old}), WhatsApp.generate({propostaCompleta:off}));
        assert.match(WhatsApp.generate({propostaCompleta:old}), /Cartão:/);
    }
});
