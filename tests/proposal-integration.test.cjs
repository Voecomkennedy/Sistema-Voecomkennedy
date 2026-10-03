const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
    const quotes = [];
    let restored = null;
    const client = { id: 'client-1', nome: 'Cliente de teste', tipo: 'cliente' };
    const events = {};
    const nodes = {
        clienteProposta: {
            value: 'client-1', replaceChildren() { this.value = ''; }, add() {}
        },
        propostaEstado: { textContent: '' },
        editorProposta: { open: false, scrollIntoView() {} },
        quadroProposta: {
            style: {}, dataset: { src: 'cotador/index.html?embedded=1' }, addEventListener() {},
            contentWindow: {
                document: { getElementById: () => ({ value: '' }) },
                restaurarProposta(value) { restored = value; }, abrirProposta: async () => true
            }
        }
    };
    let syncs = 0;
    const window = { addEventListener() {} };
    const context = {
        window, location: { origin: 'https://test.example' },
        Option: function (name, value) { this.name = name; this.value = value; },
        document: {
            documentElement: { dataset: { appAutenticado: 'true' } },
            getElementById: id => nodes[id],
            addEventListener: (type, callback) => { events[type] = callback; }
        },
        StorageManager: {
            getClientes: () => [client],
            getClienteById: id => id === client.id ? client : undefined,
            getCotacaoById: id => quotes.find(q => q.id === id),
            addCotacao(q) { q.id = 'quote-1'; quotes.push(q); return q; },
            updateCotacao(id, q) {
                const index = quotes.findIndex(item => item.id === id);
                quotes[index] = { ...quotes[index], ...q };
                return quotes[index];
            }
        },
        CloudSync: { agendarBackup() { syncs++; } },
        carregarCotacoes() {}, abrirModalCotacao() {}
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/proposal-integration.js'), 'utf8'), context);
    events['app:ready']();
    nodes.clienteProposta.value = client.id;
    const data = {
        cliente: client.nome, adultos: 2, orig: 'BSB', dest: 'POA', cia: 'LATAM',
        classe: 'Econômica Light', dataIdaISO: '2026-10-27', dataVoltaISO: '2026-11-02',
        depIda: '10:10', chegIda: '12:45', valPix: 'R$ 2.389,22',
        valTotalPix: '4.778,43', valCartaoFinal: 'R$ 5.277,70',
        valParcela: 'R$ 527,77', parcelas: '10',
        timing: { fields: { 'p-data-chegada-ida': '2026-10-27' } }
    };
    return { window, nodes, quotes, data, getSyncs: () => syncs, getRestored: () => restored };
}

test('new proposal stores full snapshot and stable identity across repeated saves', () => {
    const h = harness();
    const first = h.window.ProposalBridge.save(h.data);
    assert.equal(first.clienteId, 'client-1');
    assert.equal(first.valorTotalPix, 4778.43);
    assert.equal(first.totalParcelado, 5277.70);
    assert.equal(first.propostaCompleta.timing.fields['p-data-chegada-ida'], '2026-10-27');
    h.data.obs = 'Texto revisado';
    const second = h.window.ProposalBridge.save(h.data);
    assert.equal(second.id, first.id);
    assert.equal(second.dataCriacao, first.dataCriacao);
    assert.equal(h.quotes.length, 1);
    assert.equal(h.getSyncs(), 2);
});

test('missing client and converted quote do not silently create or overwrite records', () => {
    const h = harness();
    h.nodes.clienteProposta.value = '';
    assert.equal(h.window.ProposalBridge.canSave(), false);
    assert.throws(() => h.window.ProposalBridge.save(h.data));
    h.nodes.clienteProposta.value = 'client-1';
    const quote = h.window.ProposalBridge.save(h.data);
    quote.status = 'convertida';
    assert.throws(() => h.window.ProposalBridge.save(h.data), /virou venda/);
    assert.equal(h.quotes.length, 1);
});

test('monthly metrics use creation month and count each quote ID once', () => {
    const h = harness();
    const now = new Date(2026, 9, 15);
    const result = h.window.ProposalMetrics.monthly([
        { id: 'a', dataCriacao: '2026-10-03T12:00:00', status: 'convertida' },
        { id: 'a', dataCriacao: '2026-10-03T12:00:00', status: 'convertida' },
        { id: 'b', dataCriacao: '2026-10-04T12:00:00', status: 'aberta' },
        { id: 'c', dataCriacao: '2026-09-30T12:00:00', status: 'convertida' }
    ], now);
    assert.equal(result.total, 2);
    assert.equal(result.converted, 1);
    assert.equal(result.percent, 50);
});

test('full options survive save and reopen without filtering fields', async () => {
    const h = harness();
    h.data = {
        ...h.data, vooIda: 'LA1234', paradaIda: '2escalas',
        escalaCidadeIda: 'GRU', escalaTempoIda: '1h 20m',
        escalaCidade2Ida: 'CWB', escalaTempo2Ida: '2h 10m',
        hotelNome: 'Hotel de teste', bagDespVolta: 'Não inclusa',
        calc: { tipo: 'por-milhas', milhas: '125000', compAtivo: true, bagAdd: { ativo: true, custo: '100,00' } },
        timing: { fields: { 'p-data-chegada-ida': '2026-10-27', 'p-conexao-ida1-saida-data': '2026-10-27' }, ownership: { 'p-data-volta': 'manual' } }
    };
    const expected = JSON.stringify(h.data);
    const saved = h.window.ProposalBridge.save(h.data);
    assert.equal(JSON.stringify(saved.propostaCompleta), expected);
    await h.window.editarPropostaCompleta(saved.id);
    assert.equal(JSON.stringify(h.getRestored()), expected);
    assert.equal(h.nodes.clienteProposta.value, saved.clienteId);
});
