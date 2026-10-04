const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('../cotador/node_modules/jsdom');

const read = name => fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');

function storage(entries = []) {
    const values = new Map(entries);
    const localStorage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
    const window = {};
    vm.runInNewContext(read('storage.js'), { window, localStorage });
    return { manager: window.StorageManager, localStorage };
}

for (const [name, key, record] of [
    ['quotation', 'emissao_cotacoes', { id: 'quote', clienteId: 'client-1' }],
    ['active sale', 'emissao_vendas', { id: 'sale', clienteId: 'client-1' }],
    ['archived sale', 'emissao_vendas', { id: 'sale', clienteId: 'client-1', excluidaEm: '2026-10-01T12:00:00Z' }]
]) {
    test(`storage prevents deleting a person linked to a ${name}`, () => {
        const { manager } = storage([
            ['emissao_pessoas', '[{"id":"client-1","tipo":"cliente"}]'],
            [key, JSON.stringify([record])]
        ]);
        assert.match(manager.motivoBloqueioExclusaoPessoa('client-1'), /preservar o histórico/);
        assert.equal(manager.deletePessoa('client-1'), false);
        assert.equal(manager.deleteCliente('client-1'), false);
        assert.equal(manager.getPessoas().length, 1);
    });
}

test('changing person type does not bypass the relationship guard', () => {
    const { manager } = storage([
        ['emissao_pessoas', '[{"id":"client-1","tipo":"passageiro"}]'],
        ['emissao_cotacoes', '[{"id":"quote","clienteId":"client-1"}]']
    ]);
    assert.equal(manager.deletePessoa('client-1'), false);
});

test('an unrelated person can still be deleted', () => {
    const { manager } = storage([
        ['emissao_pessoas', '[{"id":"client-1"},{"id":"client-2"}]'],
        ['emissao_cotacoes', '[{"id":"quote","clienteId":"client-2"}]']
    ]);
    assert.equal(manager.deletePessoa('client-1'), true);
    assert.equal(manager.getPessoas()[0].id, 'client-2');
});

test('legacy migration cannot import records whose account is unknown', () => {
    const { manager, localStorage } = storage([
        ['emissao_clientes', '[{"id":"legacy-client"}]'],
        ['emissao_fornecedores', '[{"id":"legacy-supplier"}]']
    ]);
    assert.equal(manager.migrarDadosAntigos(), false);
    assert.equal(manager.getPessoas().length, 0);
    assert.notEqual(localStorage.getItem('emissao_clientes'), null);
});

async function bootstrap(syncResult) {
    const dom = new JSDOM('<!doctype html><html><body><main><button>Salvar</button></main></body></html>', {
        url: 'https://synthetic.invalid/', runScripts: 'outside-only'
    });
    const w = dom.window;
    Object.defineProperty(w.document, 'readyState', { value: 'complete' });
    w.Auth = { proteger: async () => true };
    w.CloudSync = { init: async () => {
        if (syncResult instanceof Error) throw syncResult;
        return syncResult;
    } };
    w.console.error = () => {};
    let ready = 0;
    let callbacks = 0;
    w.document.addEventListener('app:ready', () => { ready++; });
    w.eval(read('app-bootstrap.js'));
    const result = await w.AppBootstrap.iniciar(() => { callbacks++; });
    return { dom, w, result, ready, callbacks };
}

for (const syncResult of [false, new Error('Synthetic sync failure')]) {
    test(`bootstrap blocks forms and does not signal ready when sync ${syncResult === false ? 'fails' : 'throws'}`, async () => {
        const { dom, w, result, ready, callbacks } = await bootstrap(syncResult);
        try {
            assert.equal(result, false);
            assert.equal(ready, 0);
            assert.equal(callbacks, 0);
            assert.equal(w.document.documentElement.dataset.appAutenticado, undefined);
            assert.equal(w.document.querySelector('main').inert, true);
            const error = w.document.getElementById('erroInicializacaoApp');
            assert.equal(error.getAttribute('role'), 'alertdialog');
            assert.equal(error.querySelector('button').textContent, 'Recarregar página');
            assert.equal(await w.AppBootstrap.iniciar(), false);
            assert.equal(w.document.querySelectorAll('#erroInicializacaoApp').length, 1);
        } finally { dom.window.close(); }
    });
}

test('successful bootstrap signals ready exactly once and keeps forms available', async () => {
    const { dom, w, result, ready, callbacks } = await bootstrap(true);
    try {
        assert.equal(result, true);
        assert.equal(ready, 1);
        assert.equal(callbacks, 1);
        assert.equal(w.document.documentElement.dataset.appAutenticado, 'true');
        assert.equal(w.document.getElementById('erroInicializacaoApp'), null);
        assert.equal(await w.AppBootstrap.iniciar(), true);
    } finally { dom.window.close(); }
});

test('bootstrap distinguishes recovery failure from a connection problem without exposing cached records', async () => {
    const error = new Error('Synthetic recovery failure');
    error.code = 'CACHE_RECOVERY_FAILED';
    const { dom, w, result, ready } = await bootstrap(error);
    try {
        assert.equal(result, false);
        assert.equal(ready, 0);
        assert.match(w.document.getElementById('erroInicializacaoApp').textContent, /cópia de recuperação/);
        assert.doesNotMatch(w.document.getElementById('erroInicializacaoApp').textContent, /Synthetic/);
    } finally { dom.window.close(); }
});
