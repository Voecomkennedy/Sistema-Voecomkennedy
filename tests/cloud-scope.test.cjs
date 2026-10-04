const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const queryFor = promise => ({ select() { return this; }, eq() { return this; }, insert() { return this; }, update() { return this; }, maybeSingle() { return promise; } });

function cloud(entries = []) {
    const values = new Map(entries);
    const localStorage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
    const window = { location: { href: '' }, alert() {} };
    const context = vm.createContext({
        window, localStorage, clearTimeout,
        getSupabaseClient: () => ({ auth: { signOut: async () => ({ error: null }) } }),
        Auth: { getUserId: async () => 'new-user' }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/cloud-sync.js'), 'utf8'), context);
    return { sync: window.CloudSync, values, localStorage, window, context };
}

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
    const recovery = JSON.parse(localStorage.getItem(window.CloudSync.RECUPERACAO_KEY));
    assert.equal(recovery[0].usuarioId, 'old-user');
    assert.equal(JSON.parse(recovery[0].dados.emissao_cotacoes)[0].id, 'old-quote');
});

test('account change isolates legacy and pending quote context without attributing legacy to the new owner', () => {
    const { sync, localStorage } = cloud([
        ['emissao_cloud_sync_usuario_local', 'old-user'],
        ['emissao_clientes', '[{"id":"legacy-client"}]'],
        ['emissao_fornecedores', '[{"id":"legacy-supplier"}]'],
        ['cotacao_para_venda', '{"id":"old-quote"}']
    ]);
    sync._userId = 'new-user';
    sync._prepararCacheDoUsuario();
    for (const key of [...sync.CHAVES_LEGADAS, ...sync.CHAVES_CONTEXTO]) {
        assert.equal(localStorage.getItem(key), null);
    }
    const recovery = JSON.parse(localStorage.getItem(sync.RECUPERACAO_KEY));
    assert.equal(recovery.find(r => r.dados.cotacao_para_venda).usuarioId, 'old-user');
    assert.equal(recovery.find(r => r.dados.emissao_clientes).usuarioId, null);
    assert.equal(localStorage.getItem('emissao_pessoas'), null);
});

test('cache with no owner is preserved byte for byte and cannot become the signed-in account data', () => {
    const raw = ' {"invalidForCollection": true} ';
    const { sync, localStorage } = cloud([['emissao_pessoas', raw]]);
    sync._userId = 'new-user';
    sync._prepararCacheDoUsuario();
    const recovery = JSON.parse(localStorage.getItem(sync.RECUPERACAO_KEY));
    assert.equal(recovery[0].dados.emissao_pessoas, raw);
    assert.equal(recovery[0].usuarioId, null);
    assert.equal(localStorage.getItem('emissao_pessoas'), null);
    assert.equal(localStorage.getItem(sync.USUARIO_LOCAL_KEY), 'new-user');
});

test('legacy is isolated even when the current account owns the operational cache', () => {
    const { sync, localStorage } = cloud([
        ['emissao_cloud_sync_usuario_local', 'new-user'],
        ['emissao_pessoas', '[{"id":"current-client"}]'],
        ['emissao_clientes', '[{"id":"stale-legacy-client"}]']
    ]);
    sync._userId = 'new-user';
    sync._prepararCacheDoUsuario();
    assert.equal(JSON.parse(localStorage.getItem('emissao_pessoas'))[0].id, 'current-client');
    assert.equal(localStorage.getItem('emissao_clientes'), null);
    assert.equal(JSON.parse(localStorage.getItem(sync.RECUPERACAO_KEY))[0].usuarioId, null);
});

test('failed preservation leaves the original cache and ownership marker intact', () => {
    const { sync, localStorage } = cloud([
        ['emissao_cloud_sync_usuario_local', 'old-user'],
        ['emissao_pessoas', '[{"id":"old-client"}]']
    ]);
    const setItem = localStorage.setItem;
    localStorage.setItem = (key, value) => {
        if (key === sync.RECUPERACAO_KEY) throw new Error('Synthetic quota failure');
        setItem(key, value);
    };
    sync._userId = 'new-user';
    assert.throws(() => sync._prepararCacheDoUsuario(), /preservar/);
    assert.equal(localStorage.getItem(sync.USUARIO_LOCAL_KEY), 'old-user');
    assert.equal(JSON.parse(localStorage.getItem('emissao_pessoas'))[0].id, 'old-client');
});

test('a malformed recovery archive is not overwritten or used as permission to delete originals', () => {
    const { sync, localStorage } = cloud([
        ['emissao_cache_recuperacao_v1', '{bad JSON'],
        ['emissao_clientes', '[{"id":"legacy-client"}]']
    ]);
    sync._userId = 'new-user';
    assert.throws(() => sync._prepararCacheDoUsuario(), /preservar/);
    assert.equal(localStorage.getItem(sync.RECUPERACAO_KEY), '{bad JSON');
    assert.notEqual(localStorage.getItem('emissao_clientes'), null);
});

test('failed initial synchronization is not cached as initialized and does not monitor writes', async () => {
    const { sync } = cloud();
    let downloads = 0;
    let monitors = 0;
    sync.baixarDaNuvem = async () => { downloads++; return false; };
    sync._monitorarLocalStorage = () => { monitors++; };
    assert.equal(await sync.init(), false);
    assert.equal(sync._online, false);
    assert.equal(sync._inicializado, false);
    assert.equal(await sync.init(), false);
    assert.equal(downloads, 2);
    assert.equal(monitors, 0);
});

test('logout preserves a recoverable copy then clears operational, legacy and temporary data', async () => {
    const { sync, localStorage, window, context } = cloud([
        ['emissao_cloud_sync_usuario_local', 'old-user'],
        ['emissao_cotacoes', '[{"id":"unsynced-quote"}]'],
        ['emissao_clientes', '[{"id":"legacy-client"}]'],
        ['cotacao_para_venda', '{"id":"pending-sale"}']
    ]);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/auth.js'), 'utf8'), context);
    assert.equal(await window.Auth.logout(), true);
    assert.equal(window.location.href, 'login.html');
    for (const key of [...sync.CHAVES, ...sync.CHAVES_LEGADAS, ...sync.CHAVES_CONTEXTO, sync.USUARIO_LOCAL_KEY]) {
        assert.equal(localStorage.getItem(key), null);
    }
    const recovery = JSON.parse(localStorage.getItem(sync.RECUPERACAO_KEY));
    assert.equal(recovery.find(r => r.usuarioId === 'old-user').dados.emissao_cotacoes, '[{"id":"unsynced-quote"}]');
    assert.equal(recovery.find(r => r.dados.emissao_clientes).usuarioId, null);
});

test('logout still signs out when recovery quota is full, preserving original data and owner', async () => {
    const { sync, localStorage, window, context } = cloud([
        ['emissao_cloud_sync_usuario_local', 'old-user'],
        ['emissao_cotacoes', '[{"id":"unsynced-quote"}]'],
        ['emissao_clientes', '[{"id":"legacy-client"}]']
    ]);
    let signouts = 0;
    let warning = '';
    context.getSupabaseClient = () => ({ auth: { signOut: async () => { signouts++; return { error: null }; } } });
    window.alert = text => { warning = text; };
    const setItem = localStorage.setItem;
    localStorage.setItem = (key, value) => {
        if (key === sync.RECUPERACAO_KEY) throw new Error('Synthetic full quota');
        setItem(key, value);
    };
    sync._online = true;
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/auth.js'), 'utf8'), context);
    assert.equal(await window.Auth.logout(), true);
    assert.equal(signouts, 1);
    assert.equal(sync._online, false);
    assert.equal(window.location.href, 'login.html');
    assert.match(warning, /Você saiu da conta/);
    assert.equal(localStorage.getItem(sync.USUARIO_LOCAL_KEY), 'old-user');
    assert.equal(JSON.parse(localStorage.getItem('emissao_cotacoes'))[0].id, 'unsynced-quote');
    assert.notEqual(localStorage.getItem('emissao_clientes'), null);
});

test('failed signout keeps the operational cache and does not pretend the session ended', async () => {
    const { sync, localStorage, window, context } = cloud([
        ['emissao_cloud_sync_usuario_local', 'old-user'],
        ['emissao_cotacoes', '[{"id":"unsynced-quote"}]']
    ]);
    context.getSupabaseClient = () => ({ auth: { signOut: async () => ({ error: new Error('Synthetic network failure') }) } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/auth.js'), 'utf8'), context);
    assert.equal(await window.Auth.logout(), false);
    assert.equal(window.location.href, '');
    assert.equal(localStorage.getItem(sync.USUARIO_LOCAL_KEY), 'old-user');
    assert.notEqual(localStorage.getItem('emissao_cotacoes'), null);
});

test('identical collections do not accumulate recovery copies when only formatting or sync metadata changes', () => {
    const { sync, localStorage } = cloud([
        ['emissao_cloud_sync_usuario_local', 'old-user'],
        ['emissao_pessoas', '[{"id":"client","nome":"Synthetic"}]'],
        ['emissao_cloud_sync_meta_v2', '{"versao":1,"atualizadoEm":"old"}']
    ]);
    sync.preservarCacheParaLogout();
    localStorage.setItem('emissao_cloud_sync_meta_v2', '{"versao":2,"atualizadoEm":"new"}');
    localStorage.setItem('emissao_pessoas', '[ { "nome": "Synthetic", "id": "client" } ]');
    sync.preservarCacheParaLogout();
    const recovery = JSON.parse(localStorage.getItem(sync.RECUPERACAO_KEY));
    assert.equal(recovery.length, 1);
    assert.equal(recovery[0].dados.emissao_pessoas, '[{"id":"client","nome":"Synthetic"}]');
    assert.equal(recovery[0].metadados.sincronizacao, '{"versao":1,"atualizadoEm":"old"}');
});

test('logout suspends before signout and preserves the latest cache after the asynchronous wait', async () => {
    const { sync, localStorage, window, context } = cloud([
        ['emissao_cloud_sync_usuario_local', 'old-user'],
        ['emissao_cotacoes', '[{"id":"quote","valor":100}]']
    ]);
    const signout = deferred();
    context.getSupabaseClient = () => ({ auth: { signOut: () => signout.promise } });
    sync._online = true;
    sync._userId = 'old-user';
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/auth.js'), 'utf8'), context);
    const pending = window.Auth.logout();
    assert.equal(sync._online, false);
    assert.equal(window.Auth._saidaSolicitada, true);
    localStorage.setItem('emissao_cotacoes', '[{"id":"quote","valor":200}]');
    signout.resolve({ error: null });
    assert.equal(await pending, true);
    const recovery = JSON.parse(localStorage.getItem(sync.RECUPERACAO_KEY));
    assert.equal(JSON.parse(recovery[0].dados.emissao_cotacoes)[0].valor, 200);
    assert.equal(localStorage.getItem('emissao_cotacoes'), null);
});

test('download finishing after logout cannot restore private cache or write ownerless metadata', async () => {
    const { sync, localStorage, window, context } = cloud([
        ['emissao_cloud_sync_usuario_local', 'old-user'],
        ['emissao_cotacoes', '[{"id":"local-quote"}]']
    ]);
    const download = deferred();
    context.getSupabaseClient = () => ({ auth: { signOut: async () => ({ error: null }) }, from: () => queryFor(download.promise) });
    sync._userId = 'old-user';
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/auth.js'), 'utf8'), context);
    const pending = sync.baixarDaNuvem();
    await window.Auth.logout();
    download.resolve({ data: { conteudo: { emissao_cotacoes: [{ id: 'private-cloud-quote' }] }, versao: 2 }, error: null });
    assert.equal(await pending, false);
    assert.equal(localStorage.getItem('emissao_cotacoes'), null);
    assert.equal(localStorage.getItem(sync.META_KEY), null);
});

test('late upload cannot mutate the new session or clear its in-flight operation', async () => {
    const { sync, localStorage, context } = cloud();
    const upload = deferred();
    context.getSupabaseClient = () => ({ from: () => queryFor(upload.promise) });
    sync._userId = 'old-user';
    localStorage.setItem(sync.USUARIO_LOCAL_KEY, 'old-user');
    sync._online = true;
    const pending = sync.enviarParaNuvem();
    sync.suspenderSincronizacao();
    sync._userId = 'new-user';
    localStorage.setItem(sync.USUARIO_LOCAL_KEY, 'new-user');
    sync._online = true;
    sync._versaoNuvem = 77;
    const nextOperation = Promise.resolve('new-operation');
    sync._envioEmAndamento = nextOperation;
    upload.resolve({ data: { versao: 2 }, error: null });
    assert.equal(await pending, false);
    assert.equal(sync._versaoNuvem, 77);
    assert.equal(sync._envioEmAndamento, nextOperation);
    assert.equal(localStorage.getItem(sync.META_KEY), null);
});

test('late conflict-version lookup cannot prompt or overwrite a different session', async () => {
    const { sync, window, context, localStorage } = cloud();
    const lookup = deferred();
    const lookupStarted = deferred();
    let calls = 0;
    let prompts = 0;
    context.getSupabaseClient = () => ({ from: () => {
        calls++;
        if (calls === 2) lookupStarted.resolve();
        return queryFor(calls === 1 ? Promise.resolve({ data: null, error: null }) : lookup.promise);
    } });
    window.confirm = () => { prompts++; return true; };
    sync._userId = 'old-user';
    localStorage.setItem(sync.USUARIO_LOCAL_KEY, 'old-user');
    const pending = sync._enviarConteudo({ emissao_cotacoes: [] });
    await lookupStarted.promise;
    assert.equal(calls, 2);
    sync.suspenderSincronizacao();
    sync._userId = 'new-user';
    localStorage.setItem(sync.USUARIO_LOCAL_KEY, 'new-user');
    lookup.resolve({ data: { conteudo: { emissao_cotacoes: [{ id: 'old-private' }] }, versao: 9 }, error: null });
    assert.equal(await pending, false);
    assert.equal(prompts, 0);
});

test('authentication resolving after suspension cannot initialize a logged-out session', async () => {
    const { sync, context, localStorage } = cloud();
    const user = deferred();
    context.Auth = { getUserId: () => user.promise };
    let downloads = 0;
    sync.baixarDaNuvem = async () => { downloads++; return true; };
    const pending = sync.init();
    sync.suspenderSincronizacao();
    user.resolve('old-user');
    assert.equal(await pending, false);
    assert.equal(downloads, 0);
    assert.equal(localStorage.getItem(sync.USUARIO_LOCAL_KEY), null);
});

test('logout does not erase a different account that took over while signout was pending', async () => {
    const { sync, context, window, localStorage } = cloud([['emissao_cloud_sync_usuario_local', 'old-user']]);
    const signout = deferred();
    context.getSupabaseClient = () => ({ auth: { signOut: () => signout.promise } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/auth.js'), 'utf8'), context);
    const pending = window.Auth.logout();
    localStorage.setItem(sync.USUARIO_LOCAL_KEY, 'new-user');
    localStorage.setItem('emissao_cotacoes', '[{"id":"new-account-quote"}]');
    signout.resolve({ error: null });
    assert.equal(await pending, true);
    assert.equal(localStorage.getItem(sync.USUARIO_LOCAL_KEY), 'new-user');
    assert.equal(JSON.parse(localStorage.getItem('emissao_cotacoes'))[0].id, 'new-account-quote');
});

test('a different tab changing the owner invalidates a pending download without changing this tab generation', async () => {
    const { sync, context, localStorage } = cloud([['emissao_cloud_sync_usuario_local', 'old-user']]);
    const download = deferred();
    context.getSupabaseClient = () => ({ from: () => queryFor(download.promise) });
    sync._userId = 'old-user';
    const pending = sync.baixarDaNuvem();
    localStorage.setItem(sync.USUARIO_LOCAL_KEY, 'new-user');
    localStorage.setItem('emissao_cotacoes', '[{"id":"new-account-quote"}]');
    download.resolve({ data: { versao: 5, conteudo: { emissao_cotacoes: [{ id: 'old-private' }] } }, error: null });
    assert.equal(await pending, false);
    assert.equal(JSON.parse(localStorage.getItem('emissao_cotacoes'))[0].id, 'new-account-quote');
    assert.equal(localStorage.getItem(sync.META_KEY), null);
});
