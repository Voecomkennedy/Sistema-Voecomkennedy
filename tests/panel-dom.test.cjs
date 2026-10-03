const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, ResourceLoader, VirtualConsole } = require('../cotador/node_modules/jsdom');

const root = path.resolve(__dirname, '..');
const person = { id: 'client-1', tipo: 'cliente', nome: 'Cliente sintético' };

test('every static proposal field is collected or included in the timing snapshot', () => {
    const html = fs.readFileSync(path.join(root, 'cotador/index.html'), 'utf8');
    const document = new JSDOM(html).window.document;
    const ids = [...document.querySelectorAll('#panel-proposta input[id], #panel-proposta select[id], #panel-proposta textarea[id]')].map(el => el.id);
    const collector = html.slice(html.indexOf('function coletarDadosProposta()'), html.indexOf('async function gerarProposta()'));
    const timing = fs.readFileSync(path.join(root, 'cotador/js/timing-form.js'), 'utf8');
    const missing = ids.filter(id => !collector.includes(`'${id}'`) && !timing.includes(`'${id}'`));
    assert.equal(ids.length, 97);
    assert.deepEqual(missing, []);
});

class LocalResources extends ResourceLoader {
    constructor(authenticated = true) { super(); this.authenticated = authenticated; }
    fetch(url) {
        const parsed = new URL(url);
        if (parsed.hostname === 'qa.local') {
            const stubs = {
                '/js/auth.js': `window.Auth={proteger:async()=>${this.authenticated},logout(){}};`,
                '/js/cloud-sync.js': 'window.CloudSync={init:async()=>true,agendarBackup(){window.__syncs=(window.__syncs||0)+1}};',
                '/js/supabase-config.js': 'window.getSupabaseClient=()=>({});'
            };
            if (stubs[parsed.pathname]) return Promise.resolve(Buffer.from(stubs[parsed.pathname]));
            const file = path.join(root, decodeURIComponent(parsed.pathname));
            return Promise.resolve(fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file) : Buffer.alloc(0));
        }
        if (parsed.pathname.includes('bootstrap.bundle')) {
            return Promise.resolve(Buffer.from('window.bootstrap={Modal:class{show(){}hide(){}}};'));
        }
        return Promise.resolve(Buffer.alloc(0));
    }
}

async function page(name, entries = {}, authenticated = true) {
    const errors = [];
    const console = new VirtualConsole();
    console.on('jsdomError', e => errors.push(e.message));
    const dom = new JSDOM(fs.readFileSync(path.join(root, name + '.html'), 'utf8'), {
        url: `https://qa.local/${name}.html${name === 'vendas' ? '?from_cotacao=true' : ''}`,
        runScripts: 'dangerously', resources: new LocalResources(authenticated), virtualConsole: console,
        beforeParse(w) {
            w.HTMLElement.prototype.scrollIntoView = () => {};
            w.confirm = () => true;
            w.alert = () => {};
            for (const [key, value] of Object.entries(entries)) w.localStorage.setItem(key, JSON.stringify(value));
        }
    });
    const waitFor = async condition => {
        const until = Date.now() + 10000;
        while (!condition()) {
            if (Date.now() > until) throw new Error('DOM fixture timed out: ' + JSON.stringify({errors, ready: dom.window.document.readyState, auth: !!dom.window.Auth, app: !!dom.window.AppBootstrap}));
            await new Promise(resolve => setTimeout(resolve, 25));
        }
    };
    if (authenticated) await waitFor(() => dom.window.document.documentElement.dataset.appAutenticado === 'true');
    else await waitFor(() => !!dom.window.AppBootstrap);
    if (name === 'cotacoes' && authenticated) await waitFor(() => typeof dom.window.document.querySelector('#quadroProposta').contentWindow?.coletarDadosProposta === 'function');
    return { dom, window: dom.window, waitFor, errors };
}

test('editor iframe stays unloaded when authentication fails', { timeout: 20000 }, async () => {
    const a = await page('cotacoes', {}, false);
    try {
        assert.equal(a.window.document.querySelector('#quadroProposta').getAttribute('src'), null);
        assert.equal(a.window.document.documentElement.dataset.appAutenticado, undefined);
    } finally { a.dom.window.close(); }
});

test('authenticated panel saves, reopens and downloads one synthetic quote', { timeout: 20000 }, async () => {
    const a = await page('cotacoes', { emissao_pessoas: [person] });
    const w = a.window;
    let persisted;
    try {
        const f = w.document.querySelector('#quadroProposta').contentWindow;
        w.novaPropostaCompleta();
        w.document.querySelector('#clienteProposta').value = person.id;
        w.selecionarClienteProposta();
        const set = (id, value) => {
            const el = f.document.getElementById(id);
            el.value = value;
            el.dispatchEvent(new f.Event('input', { bubbles: true }));
            el.dispatchEvent(new f.Event('change', { bubbles: true }));
        };
        for (const [id, value] of Object.entries({
            'p-orig': 'BSB', 'p-dest': 'POA', 'p-data-ida': '2026-10-27',
            'p-hora-dep': '10:10', 'p-hora-cheg': '12:45',
            'p-data-volta': '2026-11-02', 'p-hora-dep-v': '05:15', 'p-hora-cheg-v': '07:45',
            'p-cia': 'LATAM', 'p-classe': 'Economica Light', 'p-adultos': '2',
            'p-val-total-pix': '4778,43', 'p-val-pix-pessoa': '2389,22',
            'p-val-cartao': '5277,70', 'p-parcelas': '10'
        })) set(id, value);
        assert.equal(f.document.getElementById('p-data-chegada-ida').value, '2026-10-27');
        assert.equal(f.document.getElementById('p-data-chegada-volta').value, '2026-11-02');
        await w.salvarPropostaCompleta();
        const first = w.StorageManager.getCotacoes();
        assert.equal(first.length, 1);
        assert.equal(first[0].clienteId, person.id);
        assert.equal(first[0].valorTotalPix, 4778.43);
        assert.ok(w.__syncs >= 1);
        assert.equal(w.document.getElementById('cotacoesMes').textContent, '1');
        const created = first[0].dataCriacao;
        await w.editarPropostaCompleta(first[0].id);
        assert.equal(f.document.getElementById('p-orig').value, 'BSB');
        assert.equal(f.document.getElementById('p-data-ida').value, '2026-10-27');
        set('p-obs', 'Revisão sintética');
        await w.salvarPropostaCompleta();
        const revised = w.StorageManager.getCotacoes();
        assert.equal(revised.length, 1);
        assert.equal(revised[0].dataCriacao, created);
        assert.equal(revised[0].propostaCompleta.obs, 'Revisão sintética');
        let pdfCalls = 0;
        f.abrirProposta = async () => { pdfCalls++; return true; };
        await w.gerarPDFCotacao(first[0].id);
        await w.gerarPDFCotacao(first[0].id);
        assert.equal(pdfCalls, 2);
        assert.equal(w.StorageManager.getCotacoes().length, 1);
        w.converterParaVenda(first[0].id);
        assert.equal(JSON.parse(w.localStorage.getItem('cotacao_para_venda')).clienteId, person.id);
        w.StorageManager.concluirConversaoCotacao(first[0].id, 'sale-synthetic');
        w.carregarCotacoes();
        assert.equal(w.StorageManager.getCotacoes()[0].status, 'convertida');
        assert.equal(w.document.getElementById('convertidasMes').textContent, '1');
        assert.equal(w.document.getElementById('taxaConversaoMes').textContent, '100%');
        persisted = w.StorageManager.getCotacoes();
    } finally { a.dom.window.close(); }
    const b = await page('cotacoes', { emissao_pessoas: [person], emissao_cotacoes: persisted });
    try {
        assert.equal(b.window.StorageManager.getCotacoes().length, 1);
        await b.window.editarPropostaCompleta(persisted[0].id);
        assert.equal(b.window.document.querySelector('#quadroProposta').contentWindow.document.getElementById('p-obs').value, 'Revisão sintética');
    } finally { b.dom.window.close(); }
});

test('sale form receives the registered client from a quote', { timeout: 20000 }, async () => {
    const quote = {
        id: 'quote-1', clienteId: person.id, nomeCliente: person.nome,
        origem: 'BSB', destino: 'POA', dataSaidaIda: '2026-10-27', horaSaidaIda: '10:10',
        tipoViagem: 'ida-volta', dataSaidaVolta: '2026-11-02', horaSaidaVolta: '05:15',
        companhiaAerea: 'LATAM', valorTotalPix: 4778.43, adultos: 2
    };
    const a = await page('vendas', { emissao_pessoas: [person], emissao_cotacoes: [{ ...quote, status: 'aberta', dataCriacao: '2026-10-03T12:00:00Z' }], cotacao_para_venda: quote });
    try {
        await a.waitFor(() => a.window.document.getElementById('clienteId').value === person.id);
        assert.equal(a.window.document.getElementById('origem').value, 'BSB');
        assert.equal(a.window.document.getElementById('dataEmbarque').value, '2026-10-27');
        assert.equal(a.window.document.getElementById('valorVenda').value, 'R$ 4.778,43');
        const d = a.window.document;
        d.getElementById('localizador_1').value = 'TEST123';
        d.getElementById('valorLucro').value = 'R$ 100,00';
        d.getElementById('formaPagamento').value = 'pix';
        d.getElementById('statusPagamento').value = 'pendente';
        d.getElementById('valorRecebido').value = 'R$ 0,00';
        d.getElementById('dataPagamento').value = '';
        d.getElementById('clienteViaja').checked = true;
        const nome = d.getElementById('passageiroNome_1');
        if (nome) nome.value = 'Passageiro sintético';
        const segundo = d.getElementById('passageiroNome_2');
        if (segundo) segundo.value = 'Segundo passageiro sintético';
        a.window.validarValoresFinanceiros();
        const invalid = [...d.getElementById('formVenda').elements].filter(el => !el.checkValidity()).map(el => el.id);
        assert.deepEqual(invalid, []);
        a.window.salvarVenda();
        assert.equal(a.window.StorageManager.getCotacaoById(quote.id).status, 'convertida');
        assert.equal(a.window.StorageManager.getTodasVendas().length, 1);
    } finally { a.dom.window.close(); }
});

test('legacy quote opens in its original editor without rewriting the stored record', { timeout: 20000 }, async () => {
    const legacy = {
        id: 'legacy-1', nomeCliente: 'Cliente antigo', origem: 'GRU', destino: 'GIG',
        adultos: 1, criancas: 0, bebes: 0, companhiaAerea: 'LATAM', tipoTarifa: 'Light',
        tipoViagem: 'ida-volta', dataSaidaIda: '2026-11-10', dataChegadaIda: '2026-11-10',
        horaSaidaIda: '10:00', horaChegadaIda: '11:00', temConexaoIda: 'direto',
        dataSaidaVolta: '2026-11-12', dataChegadaVolta: '2026-11-12',
        horaSaidaVolta: '18:00', horaChegadaVolta: '19:00', temConexaoVolta: 'direto',
        valorPorPessoa: 1000, valorTotalPix: 1000, valorParcela: 110, totalParcelado: 1100,
        numParcelas: 10, status: 'aberta', dataCriacao: '2026-10-01T12:00:00Z'
    };
    const a = await page('cotacoes', { emissao_cotacoes: [legacy] });
    try {
        a.window.abrirModalCotacao(legacy.id);
        assert.equal(a.window.document.getElementById('nomeCliente').value, legacy.nomeCliente);
        assert.equal(a.window.document.getElementById('origemCotacao').value, legacy.origem);
        assert.equal(a.window.document.getElementById('valorTotalPix').textContent.replace(/\s/g, ' '), 'R$ 1.000,00');
        assert.equal(JSON.stringify(a.window.StorageManager.getCotacoes()[0]), JSON.stringify(legacy));
        a.window.document.getElementById('observacaoCotacao').value = 'Revisado';
        const form = a.window.document.getElementById('formCotacao');
        assert.equal(form.checkValidity(), true, Array.from(form.elements).filter(el => !el.checkValidity()).map(el => el.id).join(','));
        a.window.salvarCotacao();
        const saved = a.window.StorageManager.getCotacoes()[0];
        assert.equal(saved.id, legacy.id);
        assert.equal(saved.dataCriacao, legacy.dataCriacao);
        assert.equal(saved.status, legacy.status);
        assert.equal(saved.valorTotalPix, legacy.valorTotalPix);
        assert.equal(saved.observacao, 'Revisado');
    } finally { a.dom.window.close(); }
});
