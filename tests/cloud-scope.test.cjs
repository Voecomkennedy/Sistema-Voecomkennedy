const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('existing CloudSync isolates quote cache when authenticated user changes', () => {
    const values = new Map([
        ['emissao_cloud_sync_usuario_local', 'old-user'],
        ['emissao_cotacoes', JSON.stringify([{ id: 'old-quote' }])],
        ['emissao_pessoas', JSON.stringify([{ id: 'old-client' }])]
    ]);
    const localStorage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
    const window = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/cloud-sync.js'), 'utf8'), { window, localStorage });
    assert.ok(window.CloudSync.CHAVES.includes('emissao_cotacoes'));
    window.CloudSync._userId = 'new-user';
    window.CloudSync._prepararCacheDoUsuario();
    assert.equal(localStorage.getItem('emissao_cotacoes'), null);
    assert.equal(localStorage.getItem('emissao_pessoas'), null);
    assert.equal(localStorage.getItem('emissao_cloud_sync_usuario_local'), 'new-user');
});
