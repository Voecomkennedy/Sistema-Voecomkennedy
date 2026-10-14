// Synthetic storage, server CAS, failures and timers; no real requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = require('node:path').resolve(__dirname, '../..');
const source = fs.readFileSync(root + '/js/cloud-sync.js', 'utf8');
const storageSource = fs.readFileSync(root + '/js/storage.js', 'utf8');
const KEYS = ['emissao_vendas', 'emissao_pessoas', 'emissao_pacotes', 'emissao_cotacoes'];
const clone = x => JSON.parse(JSON.stringify(x));
const contents = (quotes = [], sales = [], people = []) => ({
  emissao_vendas: sales, emissao_pessoas: people, emissao_pacotes: [], emissao_cotacoes: quotes
});
const q = id => ({ id, clienteId: 'synthetic-customer', status: 'aberta' });

class Backend {
  constructor(conteudo = contents()) {
    this.row = { conteudo: clone(conteudo), versao: 1, atualizado_em: '2026-10-14T00:00:00.000Z' };
    this.pending = []; this.holdNext = false; this.failNext = false; this.writes = 0; this.commits = 0; this.loseAck = false;
  }
  from(table) {
    assert.equal(table, 'dados_app');
    const b = this;
    const op = { kind: 'read', filters: {}, payload: null };
    const chain = {
      select() { return chain; },
      eq(key, value) { op.filters[key] = value; return chain; },
      update(value) { op.kind = 'update'; op.payload = clone(value); return chain; },
      insert(value) { op.kind = 'insert'; op.payload = clone(value); return chain; },
      maybeSingle() {
        if (op.kind === 'read') return Promise.resolve({ data: clone(b.row), error: null });
        b.writes++;
        const commit = () => {
          if (b.failNext) { b.failNext = false; return { data: null, error: { message: 'synthetic network failure' } }; }
          if (op.kind === 'update' && op.filters.versao !== b.row.versao) return { data: null, error: null };
          b.row = clone(op.payload); b.commits++;
          if (b.loseAck) { b.loseAck = false; return {data:null,error:{message:'synthetic lost response'}}; }
          return { data: { versao: b.row.versao, atualizado_em: b.row.atualizado_em }, error: null };
        };
        if (b.holdNext) {
          b.holdNext = false;
          return new Promise(resolve => b.pending.push(() => resolve(commit())));
        }
        return Promise.resolve(commit());
      }
    };
    return chain;
  }
  release() { assert.equal(this.pending.length, 1); this.pending.shift()(); }
  remoteChange(conteudo) { this.row = { ...this.row, conteudo: clone(conteudo), versao: this.row.versao + 1 }; }
}

function device(backend, initial = backend.row.conteudo, options = {}) {
  const data = options.shared || new Map();
  const timers = new Map(), events = {}, states = [], prompts = [];
  let timerId = 0;
  const localStorage = {
    getItem: key => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => { data.set(String(key), String(value)); },
    removeItem: key => { data.delete(key); }
  };
  for (const key of KEYS) if (!data.has(key)) localStorage.setItem(key, JSON.stringify(initial[key] || []));
  localStorage.setItem('emissao_cloud_sync_usuario_local', 'synthetic-owner');
  const window = {
    confirm: message => { prompts.push(message); return options.useCloud !== false; },
    addEventListener: (name, callback) => { events[name] = callback; }
  };
  const context = vm.createContext({
    window, localStorage,
    document: { addEventListener: (name, cb) => { events[name] = cb; }, visibilityState: 'hidden' },
    console: { error() {} },
    getSupabaseClient: () => backend,
    Auth: { getUserId: async () => 'synthetic-owner' },
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => { timers.delete(id); }
  });
  vm.runInContext(source, context, { filename: 'js/cloud-sync.js' });
  vm.runInContext(storageSource + '\nwindow.StorageManager=StorageManager;', context, { filename: 'js/storage.js' });
  const sync = window.CloudSync;
  sync._userId = 'synthetic-owner'; sync._online = true; sync._versaoNuvem = backend.row.versao;
  sync._atualizarIndicador = (state, detail) => states.push({ state, detail });
  sync._escolherResolucaoConflito = async () => { prompts.push('review'); return typeof options.choice === 'function' ? options.choice() : (options.choice || 'depois'); };
  sync._salvarMeta(backend.row.versao, initial);
  sync._monitorarLocalStorage(); sync._registrarSalvamentoDeEmergencia();
  return {
    context, sync, store: window.StorageManager, localStorage, data, timers, events, states, prompts,
    write: value => { for (const key of KEYS) localStorage.setItem(key, JSON.stringify(value[key] || [])); },
    read: () => clone(sync._obterConteudoLocal()),
    async runTimers() {
      for (let n = 0; timers.size && n < 10; n++) {
        const [id, timer] = timers.entries().next().value;
        timers.delete(id); timer.callback();
        if (sync._envioEmAndamento) await sync._envioEmAndamento;
      }
      assert.equal(timers.size, 0);
    }
  };
}


module.exports = {Backend,device,contents,q,clone};
