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
    assert.equal(ids.length, 99);
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
                '/js/supabase-config.js': `window.getSupabaseClient=()=>({auth:{getUser:async()=>({data:{user:{id:'test-user',user_metadata:{}}}}),onAuthStateChange(){}}});`
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
        a.window.abrirCadastroContatoProposta();
        a.window.salvarContatoProposta();
        assert.equal(a.window.document.getElementById('cadastroContatoProposta').hidden, true);
        assert.equal(a.window.StorageManager.getPessoas().length, 0);
    } finally { a.dom.window.close(); }
});

function fillContact(w, first = 'Ana', last = 'de Souza', number = '(61) 99999-1234') {
    w.abrirCadastroContatoProposta();
    for (const [id, value] of Object.entries({
        contatoPropostaNome: first, contatoPropostaSobrenome: last, contatoPropostaWhatsapp: number
    })) {
        const field = w.document.getElementById(id);
        field.value = value;
        field.dispatchEvent(new w.Event('input', { bubbles: true }));
    }
}

const submitContact = w => w.document.getElementById('cadastroContatoProposta').requestSubmit();

test('quick contact saves only basic data, keeps proposal identity and can be completed in Pessoas', { timeout: 30000 }, async () => {
    const a = await page('cotacoes', { emissao_pessoas: [person] });
    const w = a.window;
    let contacts;
    let quotes;
    try {
        w.novaPropostaCompleta();
        w.selecionarContatoProposta(person.id);
        const data = {
            adultos: 2, orig: 'BSB', dest: 'POA', cia: 'LATAM',
            dataIdaISO: '2026-10-27', dataVoltaISO: '2026-11-02',
            depIda: '10:10', chegIda: '12:45', depVolta: '05:15', chegVolta: '07:45', valTotalPix: '4778,43',
            obs: 'Rascunho preservado', timing: { version: 1, fields: {
                'p-data-chegada-ida': '2026-10-27', 'p-data-chegada-volta': '2026-11-02'
            } }
        };
        const original = w.ProposalBridge.save(data);
        await w.editarPropostaCompleta(original.id);
        const iframe = w.document.getElementById('quadroProposta');
        const editor = iframe.contentWindow;
        const before = JSON.stringify(editor.coletarDadosProposta());
        fillContact(w, ' Ana ', ' de   Souza ');
        submitContact(w);
        submitContact(w); // Enter/double click after success must not add a second contact.
        contacts = w.StorageManager.getPessoas();
        assert.equal(contacts.length, 2);
        const contact = contacts.find(c => c.id !== person.id);
        assert.equal(contact.nome, 'Ana de Souza');
        assert.equal(contact.tipo, 'cliente');
        assert.equal(contact.telefone, '61999991234');
        assert.equal(contact.cpf, undefined);
        assert.equal(contact.dataNascimento, undefined);
        assert.equal(w.document.getElementById('clienteProposta').value, contact.id);
        assert.equal(editor.document.getElementById('p-cliente').value, contact.nome);
        assert.equal(iframe.contentWindow, editor);
        const previous = JSON.parse(before);
        const after = JSON.parse(JSON.stringify(editor.coletarDadosProposta()));
        assert.equal(after.cliente, contact.nome);
        previous.cliente = contact.nome;
        assert.deepEqual(after, previous);
        await w.salvarPropostaCompleta();
        quotes = w.StorageManager.getCotacoes();
        assert.equal(quotes.length, 1);
        assert.equal(quotes[0].id, original.id);
        assert.equal(quotes[0].dataCriacao, original.dataCriacao);
        assert.equal(quotes[0].clienteId, contact.id);
        assert.equal(quotes[0].valorTotalPix, 4778.43);
        assert.equal(quotes[0].propostaCompleta.obs, 'Rascunho preservado');
        assert.ok(w.__syncs >= 3); // initial quote, contact and updated quote.
        assert.equal(w.document.getElementById('cadastroContatoProposta').hidden, true);
        assert.equal(w.document.getElementById('abrirContatoProposta').getAttribute('aria-expanded'), 'false');
    } finally { a.dom.window.close(); }
    const contact = contacts.find(c => c.id !== person.id);
    const people = await page('pessoas', { emissao_pessoas: contacts });
    try {
        const p = people.window;
        assert.ok(p.document.body.textContent.includes('Ana de Souza'));
        p.abrirModalPessoa(contact.id);
        assert.equal(p.document.getElementById('cpf').value, '');
        p.document.getElementById('cpf').value = '529.982.247-25'; // synthetic valid CPF
        p.salvarPessoa();
        assert.equal(p.StorageManager.getPessoas().length, 2);
        assert.equal(p.StorageManager.getPessoaById(contact.id).cpf, '529.982.247-25');
    } finally { people.dom.window.close(); }
    const reopened = await page('cotacoes', { emissao_pessoas: contacts, emissao_cotacoes: quotes });
    try {
        await reopened.window.editarPropostaCompleta(quotes[0].id);
        assert.equal(reopened.window.document.getElementById('clienteProposta').value, contact.id);
        assert.equal(reopened.window.document.getElementById('quadroProposta').contentWindow.document.getElementById('p-obs').value, 'Rascunho preservado');
    } finally { reopened.dom.window.close(); }
});

test('matching name and WhatsApp reuse the existing client without changing their records', { timeout: 20000 }, async () => {
    const existing = { ...person, nome: 'Ána de Souza', telefone: '', telefone2: '+55 (61) 99999-1234', cpf: '52998224725', email: 'synthetic@example.test' };
    const a = await page('cotacoes', { emissao_pessoas: [existing] });
    try {
        const w = a.window;
        fillContact(w, ' ANA ', 'de   SOUZA');
        submitContact(w);
        assert.equal(JSON.stringify(w.StorageManager.getPessoas()), JSON.stringify([existing]));
        assert.equal(w.document.getElementById('clienteProposta').value, existing.id);
        assert.match(w.document.getElementById('propostaEstado').textContent, /já cadastrado/);
        assert.equal(w.__syncs || 0, 0);
    } finally { a.dom.window.close(); }
});

test('shared WhatsApp asks which contact to use or deliberately creates a different person', { timeout: 20000 }, async () => {
    const existing = { ...person, nome: 'Ana de Souza', telefone: '61999991234' };
    const a = await page('cotacoes', { emissao_pessoas: [existing] });
    try {
        const w = a.window;
        fillContact(w, 'Bruno', 'de Souza');
        submitContact(w);
        const matches = w.document.getElementById('contatosPropostaEncontrados');
        assert.equal(matches.hidden, false);
        assert.equal(w.StorageManager.getPessoas().length, 1);
        assert.equal(w.document.getElementById('clienteProposta').value, '');
        matches.querySelector('.list-group button').click();
        assert.equal(w.document.getElementById('clienteProposta').value, existing.id);
        fillContact(w, 'Bruno', 'de Souza');
        submitContact(w);
        matches.querySelector('.btn').click();
        const contacts = w.StorageManager.getClientes();
        assert.equal(contacts.length, 2);
        assert.equal(contacts[0].id, existing.id);
        assert.equal(contacts[1].nome, 'Bruno de Souza');
        assert.equal(w.document.getElementById('clienteProposta').value, contacts[1].id);
        fillContact(w, 'Bruno', 'de Souza');
        submitContact(w);
        assert.equal(w.StorageManager.getClientes().length, 2);
    } finally { a.dom.window.close(); }
});

test('invalid WhatsApp does not create contacts and international prefixes are preserved', { timeout: 20000 }, async () => {
    const a = await page('cotacoes');
    try {
        const w = a.window;
        for (const number of ['123', '00000000000', '61999991234abc', '++351912345678', '+0123456789', '+1234567890123456', '123456789012']) {
            fillContact(w, 'Nome', 'Sintético', number);
            submitContact(w);
            assert.equal(w.StorageManager.getPessoas().length, 0, number);
            assert.equal(w.document.getElementById('contatoPropostaWhatsapp').value, number);
            assert.match(w.document.getElementById('contatoPropostaEstado').textContent, /WhatsApp/);
        }
        fillContact(w, '   ', 'Sintético');
        submitContact(w);
        assert.equal(w.StorageManager.getPessoas().length, 0);
        fillContact(w, 'Nome', '123');
        submitContact(w);
        assert.equal(w.StorageManager.getPessoas().length, 0);
        fillContact(w, 'Contato', 'Portugal', '+351 912 345 678');
        submitContact(w);
        fillContact(w, 'Contato', 'Canadá', '+1 (416) 555-0123');
        submitContact(w);
        const contacts = w.StorageManager.getClientes();
        assert.deepEqual(Array.from(contacts, c => c.telefone), ['+351912345678', '+14165550123']);
        fillContact(w, 'Contato', 'Canadá', '+1 416 555 0123');
        submitContact(w);
        assert.equal(w.StorageManager.getClientes().length, 2);
    } finally { a.dom.window.close(); }
});

test('storage failure keeps inputs and proposal; scheduling failure reports a locally saved contact', { timeout: 20000 }, async () => {
    const a = await page('cotacoes', { emissao_pessoas: [person] });
    try {
        const w = a.window;
        w.selecionarContatoProposta(person.id);
        const editor = w.document.getElementById('quadroProposta').contentWindow;
        editor.document.getElementById('p-obs').value = 'Não perder este rascunho';
        const originalSave = w.StorageManager.savePessoas;
        w.StorageManager.savePessoas = () => { throw new Error('QuotaExceededError'); };
        fillContact(w);
        submitContact(w);
        assert.equal(w.StorageManager.getPessoas().length, 1);
        assert.equal(w.document.getElementById('clienteProposta').value, person.id);
        assert.equal(w.document.getElementById('cadastroContatoProposta').hidden, false);
        assert.equal(w.document.getElementById('contatoPropostaNome').value, 'Ana');
        assert.equal(w.document.getElementById('salvarContatoProposta').disabled, false);
        assert.match(w.document.getElementById('contatoPropostaEstado').textContent, /QuotaExceededError/);
        assert.equal(editor.document.getElementById('p-obs').value, 'Não perder este rascunho');
        w.StorageManager.savePessoas = originalSave;
        w.CloudSync.agendarBackup = () => { throw new Error('Sync unavailable'); };
        submitContact(w);
        submitContact(w);
        assert.equal(w.StorageManager.getPessoas().length, 2);
        assert.notEqual(w.document.getElementById('clienteProposta').value, person.id);
        assert.match(w.document.getElementById('propostaEstado').textContent, /salvo neste aparelho.*falha.*sincronização/);
        assert.equal(editor.document.getElementById('p-obs').value, 'Não perder este rascunho');
    } finally { a.dom.window.close(); }
});

test('opening another quote clears unfinished contact registration without creating a person', { timeout: 20000 }, async () => {
    const a = await page('cotacoes', { emissao_pessoas: [person] });
    try {
        const w = a.window;
        w.selecionarContatoProposta(person.id);
        const quote = w.ProposalBridge.save({ adultos: 1, orig: 'BSB', dest: 'POA', obs: 'Proposta original' });
        fillContact(w);
        await w.editarPropostaCompleta(quote.id);
        assert.equal(w.document.getElementById('cadastroContatoProposta').hidden, true);
        assert.equal(w.document.getElementById('contatoPropostaNome').value, '');
        assert.equal(w.StorageManager.getPessoas().length, 1);
        fillContact(w);
        w.fecharCadastroContatoProposta();
        assert.equal(w.document.getElementById('clienteProposta').value, person.id);
        assert.equal(w.document.getElementById('quadroProposta').contentWindow.document.getElementById('p-obs').value, 'Proposta original');
        w.novaPropostaCompleta();
        assert.equal(w.document.getElementById('contatoPropostaNome').value, '');
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
