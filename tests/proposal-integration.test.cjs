const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
    const quotes = [];
    const client = { id: 'client-1', nome: 'Cliente de teste', tipo: 'cliente' };
    const events = {};
    const nodes = {
        clienteProposta: {
            value: 'client-1', replaceChildren() { this.value = ''; }, add() {}
        },
        propostaEstado: { textContent: '' },
        editorProposta: { open: false, scrollIntoView() {} },
        quadroProposta: {
            style: {}, addEventListener() {},
            contentWindow: {
                document: { getElementById: () => ({ value: '' }) },
                restaurarProposta() {}, abrirProposta: async () => true
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
    return { window, nodes, quotes, data, getSyncs: () => syncs };
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
