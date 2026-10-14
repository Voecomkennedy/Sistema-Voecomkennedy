const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('../cotador/node_modules/jsdom');
const {Backend,device,contents,q} = require('./helpers/cloud-fixture.cjs');

test('old acknowledgement keeps the newest revision pending and emergency eligible until confirmed', async () => {
  const b = new Backend(), d = device(b);
  d.write(contents([q('A')])); b.holdNext = true;
  const first = d.sync.enviarParaNuvem();
  d.write(contents([q('A'),q('B')]));
  b.release(); await first;
  assert.equal(d.sync._backupPendente, true);
  assert.equal(d.states.at(-1).state, 'salvando');
  assert.notEqual(d.sync._revisaoConfirmada, d.sync._revisaoLocal);
  assert.deepEqual(b.row.conteudo.emissao_cotacoes.map(x=>x.id), ['A']);
  await d.runTimers();
  assert.deepEqual(b.row.conteudo.emissao_cotacoes.map(x=>x.id), ['A','B']);
  assert.equal(d.sync._backupPendente, false);
  assert.equal(d.sync._revisaoConfirmada, d.sync._revisaoLocal);
  assert.equal(d.states.at(-1).state, 'sincronizado');
});

for (const choice of ['nuvem','local','depois']) {
  test(`conflict ${choice} preserves sent snapshot, newest local records and remote records`, async () => {
    const b = new Backend(), d = device(b, b.row.conteudo, {choice});
    d.write(contents([q('A')])); b.holdNext = true;
    const first = d.sync.enviarParaNuvem();
    d.write(contents([q('A'),q('B')], [{id:'new-sale'}], [{id:'new-person'}]));
    b.remoteChange(contents([q('C')], [{id:'remote-sale'}], [{id:'remote-person'}]));
    b.release(); await first;
    const history = JSON.parse(d.localStorage.getItem(d.sync.CONFLITOS_KEY));
    assert.deepEqual(history[0].captura.emissao_cotacoes.map(x=>x.id), ['A']);
    assert.deepEqual(history[0].local.emissao_cotacoes.map(x=>x.id), ['A','B']);
    assert.equal(history[0].local.emissao_vendas[0].id, 'new-sale');
    assert.equal(history[0].local.emissao_pessoas[0].id, 'new-person');
    assert.equal(history[0].nuvem.emissao_vendas[0].id, 'remote-sale');
    if (choice === 'nuvem') {
      assert.deepEqual(d.read().emissao_cotacoes.map(x=>x.id), ['C']);
      assert.equal(b.commits, 0);
    } else if (choice === 'local') {
      assert.deepEqual(b.row.conteudo.emissao_cotacoes.map(x=>x.id), ['A','B']);
      assert.equal(b.row.conteudo.emissao_vendas[0].id, 'new-sale');
    } else {
      assert.deepEqual(d.read().emissao_cotacoes.map(x=>x.id), ['A','B']);
      const writes = b.writes;
      await d.sync.enviarParaNuvem(); d.events.beforeunload(); d.events.online();
      await d.runTimers();
      assert.equal(b.writes, writes);
      assert.deepEqual(b.row.conteudo.emissao_cotacoes.map(x=>x.id), ['C']);
      assert.equal(d.sync._backupPendente, true);
    }
  });
}

test('editing during the conflict dialog cancels destructive choice and preserves that newer edit', async () => {
  const b = new Backend(); let release;
  const d = device(b, b.row.conteudo, {choice:()=>new Promise(r=>{release=r;})});
  d.write(contents([q('A')])); b.remoteChange(contents([q('C')]));
  const first = d.sync.enviarParaNuvem();
  while (!release) await Promise.resolve();
  d.write(contents([q('A'),q('B')])); release('nuvem'); await first;
  assert.deepEqual(d.read().emissao_cotacoes.map(x=>x.id), ['A','B']);
  assert.deepEqual(b.row.conteudo.emissao_cotacoes.map(x=>x.id), ['C']);
  const history = JSON.parse(d.localStorage.getItem(d.sync.CONFLITOS_KEY));
  assert.equal(history.at(-1).local.emissao_cotacoes[1].id, 'B');
  assert.ok(d.sync._conflitoPendente);
});

test('conflict history keeps previous copies and migrates the old pointer without losing it', async () => {
  const b = new Backend(), d = device(b);
  d.localStorage.setItem(d.sync.CONFLITO_KEY, JSON.stringify({userId:'synthetic-owner',local:contents([q('OLD')]),nuvem:contents()}));
  d.write(contents([q('A')]));
  await d.sync._resolverConflito(d.read(), contents([q('C')]), 2, 'synthetic-time');
  await d.sync._resolverConflito(d.read(), contents([q('D')]), 3, 'synthetic-time');
  const history = JSON.parse(d.localStorage.getItem(d.sync.CONFLITOS_KEY));
  assert.equal(history.length, 3);
  assert.equal(history[0].local.emissao_cotacoes[0].id, 'OLD');
  assert.equal(history[1].nuvem.emissao_cotacoes[0].id, 'C');
  assert.equal(history[2].nuvem.emissao_cotacoes[0].id, 'D');
});

test('failure to preserve a conflict blocks replacement of cache and cloud', async () => {
  const b = new Backend(), d = device(b, b.row.conteudo, {choice:'nuvem'});
  d.write(contents([q('A')])); b.remoteChange(contents([q('C')]));
  const set = d.localStorage.setItem;
  d.localStorage.setItem = (key,value) => {if(key===d.sync.CONFLITOS_KEY) throw new Error('synthetic quota'); return set(key,value);};
  assert.equal(await d.sync.enviarParaNuvem(), false);
  assert.deepEqual(d.read().emissao_cotacoes.map(x=>x.id), ['A']);
  assert.deepEqual(b.row.conteudo.emissao_cotacoes.map(x=>x.id), ['C']);
  assert.equal(d.prompts.length, 0);
  assert.equal(d.sync._backupPendente, true);
});

test('failure to preserve conflict during initial download returns false and retains both operational copies', async () => {
  const b=new Backend(),d=device(b);d.write(contents([q('A')]));b.remoteChange(contents([q('C')]));
  const set=d.localStorage.setItem;d.localStorage.setItem=(key,value)=>{if(key===d.sync.CONFLITOS_KEY)throw new Error('synthetic quota');return set(key,value);};
  assert.equal(await d.sync.baixarDaNuvem(),false);
  assert.deepEqual(d.read().emissao_cotacoes.map(x=>x.id),['A']);
  assert.deepEqual(b.row.conteudo.emissao_cotacoes.map(x=>x.id),['C']);
  assert.equal(b.writes,0);assert.equal(d.states.at(-1).state,'erro');
});

test('failed ack metadata storage never announces success and permits a later retry', async () => {
  const b=new Backend(),d=device(b);d.write(contents([q('A')]));
  const set=d.localStorage.setItem;d.localStorage.setItem=(key,value)=>{if(key===d.sync.META_KEY)throw new Error('synthetic metadata quota');return set(key,value);};
  assert.equal(await d.sync.enviarParaNuvem(),false);
  assert.equal(d.sync._backupPendente,true);assert.equal(d.states.at(-1).state,'erro');
  assert.deepEqual(b.row.conteudo.emissao_cotacoes.map(x=>x.id),['A']);
  d.localStorage.setItem=set;await d.runTimers();
  assert.equal(d.sync._backupPendente,false);
  assert.equal(b.row.conteudo.emissao_cotacoes.length,1);
});

test('a synchronous local read failure does not leave a completed in-flight promise blocking retries', async () => {
  const b=new Backend(),d=device(b);d.localStorage.setItem('emissao_cotacoes','{synthetic invalid JSON');
  assert.equal(await d.sync.enviarParaNuvem(),false);assert.equal(d.sync._envioEmAndamento,null);
  assert.equal(d.sync._backupPendente,true);assert.equal(b.writes,0);
  d.write(contents([q('A')]));assert.equal(await d.sync.tentarNovamente(),true);
  assert.equal(b.row.conteudo.emissao_cotacoes[0].id,'A');
});

test('suspension and account change during review cannot apply an old account choice to the new cache', async () => {
  const b=new Backend();let release,started;
  const entered=new Promise(resolve=>{started=resolve;});
  const d=device(b,b.row.conteudo,{choice:()=>new Promise(resolve=>{release=resolve;started();})});
  d.write(contents([q('A')]));b.remoteChange(contents([q('C')]));const first=d.sync.enviarParaNuvem();await entered;
  d.sync.suspenderSincronizacao();d.sync._userId='next-owner';d.localStorage.setItem(d.sync.USUARIO_LOCAL_KEY,'next-owner');
  d.write(contents([q('NEXT-OWNER')]));release('nuvem');
  assert.equal(await first,false);assert.deepEqual(d.read().emissao_cotacoes.map(x=>x.id),['NEXT-OWNER']);
  assert.equal(d.sync._versaoNuvem,null);assert.equal(b.commits,0);
});

test('network failure remains visible and reconnect retries the same logical change without duplicates', async () => {
  const b = new Backend(), d = device(b);
  d.write(contents([q('A')])); b.failNext = true;
  assert.equal(await d.sync.enviarParaNuvem(), false);
  assert.equal(d.states.at(-1).state, 'erro');
  assert.equal(d.sync._backupPendente, true);
  assert.equal(d.timers.size, 1);
  d.events.online(); await d.runTimers();
  assert.deepEqual(b.row.conteudo.emissao_cotacoes.map(x=>x.id), ['A']);
  assert.equal(b.commits, 1);
  assert.equal(d.sync._backupPendente, false);
});

test('lost response after commit is recognized on retry instead of overwriting or prompting', async () => {
  const b = new Backend(), d = device(b);
  d.write(contents([q('A')])); b.loseAck = true;
  assert.equal(await d.sync.enviarParaNuvem(), false);
  assert.equal(b.commits, 1);
  const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,reorder(value[key])])) : value;
  b.row.conteudo = reorder(b.row.conteudo); // JSONB key order is not JS insertion order.
  await d.runTimers();
  assert.equal(b.commits, 1);
  assert.equal(d.prompts.length, 0);
  assert.equal(d.sync._backupPendente, false);
});

test('review later can be resumed explicitly; reconnect does not choose a version for the user', async () => {
  const b = new Backend(); let choice='depois';
  const d=device(b,b.row.conteudo,{choice:()=>choice});
  d.write(contents([q('A')]));b.remoteChange(contents([q('C')]));
  await d.sync.enviarParaNuvem();d.events.online();await d.runTimers();
  assert.deepEqual(b.row.conteudo.emissao_cotacoes.map(x=>x.id),['C']);
  choice='local';assert.equal(await d.sync.tentarNovamente(),true);
  assert.deepEqual(b.row.conteudo.emissao_cotacoes.map(x=>x.id),['A']);
  assert.equal(d.sync._backupPendente,false);
});

test('a network failure while explicitly resuming a conflict keeps pending state and retries safely', async () => {
  const b=new Backend();let choice='depois';const d=device(b,b.row.conteudo,{choice:()=>choice});
  d.write(contents([q('A')]));b.remoteChange(contents([q('C')]));await d.sync.enviarParaNuvem();
  choice='local';b.failNext=true;
  assert.equal(await d.sync.tentarNovamente(),false);
  assert.equal(d.sync._backupPendente,true);assert.equal(d.states.at(-1).state,'erro');
  await d.runTimers();
  assert.deepEqual(b.row.conteudo.emissao_cotacoes.map(x=>x.id),['A']);
  assert.equal(b.commits,1);assert.equal(d.sync._backupPendente,false);
});

test('repeated failures stop after three automatic retries and retain local data', async () => {
  const b = new Backend(), d = device(b);
  d.write(contents([q('A')]));
  const from = b.from.bind(b);
  b.from = table => { b.failNext = true; return from(table); };
  await d.runTimers();
  assert.equal(b.writes, 4);
  assert.equal(d.timers.size, 0);
  assert.equal(d.sync._backupPendente, true);
  assert.deepEqual(d.read().emissao_cotacoes.map(x=>x.id), ['A']);
});

test('conflict copies are isolated with the previous owner, never mixed into the next account', () => {
  const b = new Backend(), d = device(b);
  d.localStorage.setItem(d.sync.CONFLITOS_KEY, JSON.stringify([{userId:'synthetic-owner',local:contents([q('PRIVATE')])}]));
  d.sync._userId = 'next-owner'; d.sync._prepararCacheDoUsuario();
  assert.equal(d.localStorage.getItem(d.sync.CONFLITOS_KEY), null);
  const recovery = JSON.parse(d.localStorage.getItem(d.sync.RECUPERACAO_KEY));
  assert.equal(recovery[0].usuarioId, 'synthetic-owner');
  assert.ok(recovery[0].dados[d.sync.CONFLITOS_KEY].includes('PRIVATE'));
});

test('dialog names all three actions; Escape reviews later without native confirm', async () => {
  const dom = new JSDOM('<body></body>', {url:'https://synthetic.invalid',runScripts:'outside-only'});
  try {
    const w = dom.window;
    w.confirm = () => {throw new Error('native confirm forbidden');};
    w.eval(fs.readFileSync(path.join(__dirname,'../js/cloud-sync.js'),'utf8'));
    const decision = w.CloudSync._escolherResolucaoConflito();
    assert.deepEqual([...w.document.querySelectorAll('button')].map(b=>b.dataset.resolucao), ['depois','nuvem','local']);
    w.document.querySelector('[role=dialog]').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(await decision, 'depois');
    assert.equal(w.document.querySelector('[role=dialog]'), null);
  } finally {dom.window.close();}
});
