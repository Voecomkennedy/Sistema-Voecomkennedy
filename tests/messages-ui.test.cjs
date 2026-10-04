const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('../cotador/node_modules/jsdom');
const { createMessagesApi } = require('../js/messages-api.js');
const repo = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(repo, 'mensagens.html'), 'utf8');
const domainReady = import(pathToFileURL(path.join(repo, 'js/messages-domain.mjs')));
const pageReady = import(pathToFileURL(path.join(repo, 'js/messages-page.mjs')));
const clone = value => JSON.parse(JSON.stringify(value));
const at = '2026-11-15T13:05:00.000Z'; // 10:05 in São Paulo.
const tick = () => new Promise(resolve => setImmediate(resolve));

async function snapshot() {
    const { DEFAULT_CONFIG, DEFAULT_MODELOS } = await domainReady;
    return {
        modo: 'simulacao', preferencias: { versao: 3, config: { ...DEFAULT_CONFIG, pausado: false }, modelos: clone(DEFAULT_MODELOS), viagens: {} },
        tarefas: [{ id: 'task-1', venda_id: 'sale-1', tipo: '24h', modo: 'simulacao', estado: 'pendente', agendado_em: '2026-11-15T13:00:00.000Z', expira_em: '2026-11-15T13:15:00.000Z', embarque_em: '2026-11-16T13:00:00.000Z', destinatario: '5562999990000', texto: 'Oi, Maria! Seu voo é amanhã.', contexto: { primeiro_nome: 'Maria', origem: 'GYN', destino: 'GRU' } }],
        historico: [], vendas: [{ id: 'sale-1', nomeCliente: 'Maria Exemplo', origem: 'GYN', destino: 'GRU', dataEmbarque: '2026-11-16', horaEmbarque: '10:00', dataVolta: '2026-11-20', horaVolta: '15:00' }], pendencias: []
    };
}

async function fixture({ initial, overrides = {}, now = () => new Date(at) } = {}) {
    const stored = initial || await snapshot();
    const calls = [];
    const api = {
        async listar() { calls.push(['listar']); return clone(stored); },
        async salvar(preferencias) { calls.push(['salvar', clone(preferencias)]); stored.preferencias = { ...clone(preferencias), versao: preferencias.versao + 1 }; return clone(stored); },
        async preparar() { calls.push(['preparar']); return clone(stored); },
        async controlar(id, command) { calls.push(['controlar', id, command]); const task = stored.tarefas.find(t => t.id === id); task.estado = { pausar: 'pausada', retomar: 'pendente', cancelar: 'cancelada' }[command]; return clone(stored); },
        async simular(id) { calls.push(['simular', id]); stored.tarefas.find(t => t.id === id).estado = 'simulada'; stored.historico.push({ id: 'history-1', tarefa_id: id, estado: 'simulada', criado_em: at }); return clone(stored); },
        ...overrides
    };
    // outside-only means no scripts or network resources from the real page execute.
    const dom = new JSDOM(html, { url: 'https://qa.local/mensagens.html', runScripts: 'outside-only' });
    const { mountMessagesPage } = await pageReady;
    const app = await mountMessagesPage({ api, root: dom.window.document, now });
    const $ = id => dom.window.document.getElementById(id);
    const input = (id, value, eventType = 'input') => { const el = $(id); if (el.type === 'checkbox') el.checked = value; else el.value = value; el.dispatchEvent(new dom.window.Event(eventType, { bubbles: true })); };
    const click = async selector => { dom.window.document.querySelector(selector).click(); await tick(); };
    return { app, dom, $, input, click, calls, stored, close() { app.destroy(); dom.window.close(); } };
}

test('central shows explicit simulation, pending reviews and accessible tabs without activating live integrations', async () => {
    const initial = await snapshot(); initial.pendencias.push({ venda_id: 'sale-1', codigo: 'emissao_nao_confirmada', mensagem: 'Confirme a emissão e os fusos.' });
    const f = await fixture({ initial });
    try {
        assert.match(f.dom.window.document.body.textContent, /Modo de simulação — nenhuma mensagem será enviada/);
        assert.match(f.$('messages-pending-list').textContent, /Maria Exemplo: Confirme a emissão/);
        assert.equal(f.$('messages-issued').checked, false);
        f.$('tab-agenda').dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        assert.equal(f.$('tab-modelos').getAttribute('aria-selected'), 'true');
        assert.equal(f.dom.window.document.activeElement, f.$('tab-modelos'));
        assert.equal(f.$('panel-agenda').hidden, true);
        assert.equal(f.$('panel-modelos').hidden, false);
        assert.doesNotMatch(html, /app-bootstrap|CloudSync\.init/);
        assert.deepEqual(f.calls, [['listar']]);
    } finally { f.close(); }
});

test('model edits survive switching types, preview renders literal text, unknown variables block saving', async () => {
    const f = await fixture();
    try {
        const text = 'Olá {{primeiro_nome}}!\n<img src=x onerror=alert(1)> & {{destino}}';
        f.input('messages-model-text', text);
        assert.equal(f.$('messages-model-preview').querySelector('img'), null);
        assert.equal(f.$('messages-model-preview').textContent, 'Olá Maria!\n<img src=x onerror=alert(1)> & GRU');
        f.input('messages-model-type', 'dia', 'change');
        f.input('messages-model-type', '48h', 'change');
        assert.equal(f.$('messages-model-text').value, text);
        f.input('messages-model-text', 'Oi {{custo_interno}}');
        assert.equal(f.$('messages-model-text').getAttribute('aria-invalid'), 'true');
        await f.click('[data-save]');
        assert.match(f.$('messages-error').textContent, /Variável não permitida/);
        assert.equal(f.calls.filter(call => call[0] === 'salvar').length, 0);
        assert.equal(f.$('messages-dirty').hidden, false);
    } finally { f.close(); }
});

test('saving retains expected version and exact reviewed fields including final arrival instant', async () => {
    const f = await fixture();
    try {
        f.input('messages-model-text', 'Oi {{primeiro_nome}}, até breve.');
        f.input('messages-issued', true, 'change');
        f.input('messages-outbound-zone', 'America/Sao_Paulo');
        f.input('messages-return-zone', 'America/Sao_Paulo');
        f.input('messages-arrival', '2026-11-20T18:00');
        f.input('messages-arrival-zone', 'America/Sao_Paulo');
        f.input('messages-rule-volta-antecedenciaMinutos', '1800');
        assert.equal(f.$('messages-prepare').disabled, true);
        await f.click('[data-save]');
        const sent = f.calls.find(call => call[0] === 'salvar')[1];
        assert.equal(sent.versao, 3);
        assert.equal(sent.modelos['48h'].texto, 'Oi {{primeiro_nome}}, até breve.');
        assert.equal(sent.modelos.volta.antecedenciaMinutos, 1800);
        assert.deepEqual(sent.viagens['sale-1'], { emissaoConfirmada: true, fusoIda: 'America/Sao_Paulo', fusoVolta: 'America/Sao_Paulo', fusoChegada: 'America/Sao_Paulo', chegadaFinal: '2026-11-20T21:00:00.000Z' });
        assert.equal(f.app.getDraft().versao, 4);
        assert.equal(f.$('messages-dirty').hidden, true);
        assert.equal(f.$('messages-prepare').disabled, false);
        const { DEFAULT_MODELOS } = await domainReady;
        assert.notEqual(DEFAULT_MODELOS['48h'].texto, sent.modelos['48h'].texto);
    } finally { f.close(); }
});

test('conflict and failed reload preserve unsaved text, review fields and expected version', async () => {
    let failure = false;
    const initial = await snapshot();
    const f = await fixture({ initial, overrides: {
        async listar() { if (failure) throw new Error('Falha de conexão'); return clone(initial); },
        async salvar() { throw Object.assign(new Error('Conflito'), { status: 409 }); }
    } });
    try {
        f.input('messages-model-text', 'Meu texto pendente {{primeiro_nome}}');
        f.input('messages-outbound-zone', 'America/Manaus');
        await f.click('[data-save]');
        assert.match(f.$('messages-error').textContent, /Suas edições foram mantidas/);
        assert.equal(f.$('messages-model-text').value, 'Meu texto pendente {{primeiro_nome}}');
        assert.equal(f.$('messages-outbound-zone').value, 'America/Manaus');
        assert.equal(f.app.getDraft().versao, 3);
        await f.click('#messages-reload');
        assert.match(f.$('messages-error').textContent, /Há alterações não salvas/);
        failure = true;
        await f.click('#messages-discard');
        assert.equal(f.$('messages-model-text').value, 'Meu texto pendente {{primeiro_nome}}');
        assert.equal(f.$('messages-dirty').hidden, false);
        failure = false; initial.preferencias.versao = 9;
        await f.click('#messages-discard');
        assert.equal(f.app.getDraft().versao, 9);
        assert.equal(f.$('messages-dirty').hidden, true);
    } finally { f.close(); }
});

test('arrival editor converts stored instant to the selected arrival zone and saves local time independently of the browser zone', async () => {
    const initial = await snapshot();
    initial.preferencias.viagens['sale-1'] = { emissaoConfirmada: true, fusoIda: 'America/Sao_Paulo', fusoVolta: 'Europe/Lisbon', fusoChegada: 'Europe/Lisbon', chegadaFinal: '2026-11-20T21:00:00.000Z' };
    const f = await fixture({ initial });
    try {
        assert.equal(f.$('messages-arrival').type, 'datetime-local');
        assert.equal(f.$('messages-arrival').value, '2026-11-20T21:00');
        assert.equal(f.$('messages-arrival-zone').value, 'Europe/Lisbon');
        f.input('messages-arrival', '2026-11-20T18:30');
        f.input('messages-arrival-zone', 'Europe/Madrid');
        await f.click('[data-save]');
        const saved = f.calls.find(call => call[0] === 'salvar')[1].viagens['sale-1'];
        assert.equal(saved.chegadaFinal, '2026-11-20T17:30:00.000Z');
        assert.equal(saved.fusoChegada, 'Europe/Madrid');
        assert.equal(f.$('messages-arrival').value, '2026-11-20T18:30');
        assert.equal(f.$('messages-arrival-zone').value, 'Europe/Madrid');
    } finally { f.close(); }
});

for (const [label, chegadaFinal, fusoChegada, local] of [
    ['seconds', '2026-11-20T21:00:45.123Z', 'America/Sao_Paulo', '2026-11-20T18:00'],
    ['disambiguated DST overlap', '2026-11-01T05:30:00.000Z', 'America/New_York', '2026-11-01T01:30']
]) test(`editing only a template preserves the original arrival instant and zone with ${label}`, async () => {
    const initial = await snapshot();
    initial.preferencias.viagens['sale-1'] = { emissaoConfirmada: true, fusoIda: 'America/Sao_Paulo', fusoVolta: 'America/Sao_Paulo', fusoChegada, chegadaFinal };
    const f = await fixture({ initial });
    try {
        assert.equal(f.$('messages-arrival').value, local);
        f.input('messages-model-text', 'Modelo revisado para {{primeiro_nome}}.');
        await f.click('[data-save]');
        const sent = f.calls.find(call => call[0] === 'salvar')[1];
        assert.equal(sent.viagens['sale-1'].chegadaFinal, chegadaFinal);
        assert.equal(sent.viagens['sale-1'].fusoChegada, fusoChegada);
        assert.equal(f.$('messages-error').hidden, true);
        assert.equal(f.$('messages-arrival-error').textContent, '');
        if (label === 'disambiguated DST overlap') {
            f.input('messages-arrival', local);
            await f.click('[data-save]');
            assert.match(f.$('messages-error').textContent, /ambíguo/);
            assert.equal(f.calls.filter(call => call[0] === 'salvar').length, 1);
        }
    } finally { f.close(); }
});

test('missing or ambiguous arrival edits cannot reuse an old instant and survive sale and tab changes', async () => {
    const initial = await snapshot();
    initial.vendas.push({ ...initial.vendas[0], id: 'sale-2', nomeCliente: 'Outra pessoa' });
    initial.preferencias.viagens['sale-1'] = { emissaoConfirmada: true, fusoIda: 'America/Sao_Paulo', fusoVolta: 'America/Sao_Paulo', fusoChegada: 'America/Sao_Paulo', chegadaFinal: '2026-11-20T21:00:00.000Z' };
    const f = await fixture({ initial });
    try {
        f.input('messages-arrival', '2026-11-01T01:30');
        f.input('messages-arrival-zone', 'America/New_York'); // Fall DST overlap: two possible instants.
        assert.equal(f.app.getDraft().viagens['sale-1'].chegadaFinal, '');
        await f.click('[data-save]');
        assert.match(f.$('messages-error').textContent, /ambíguo/);
        f.input('messages-sale', 'sale-2', 'change');
        await f.click('#tab-modelos'); await f.click('#tab-regras');
        f.input('messages-sale', 'sale-1', 'change');
        assert.equal(f.$('messages-arrival').value, '2026-11-01T01:30');
        assert.equal(f.$('messages-arrival-zone').value, 'America/New_York');
        f.input('messages-arrival-zone', '');
        await f.click('[data-save]');
        assert.match(f.$('messages-error').textContent, /Informe o fuso/);
        assert.equal(f.calls.some(call => call[0] === 'salvar'), false);
        f.input('messages-arrival-zone', 'America/Manaus');
        await f.click('[data-save]');
        assert.equal(f.calls.find(call => call[0] === 'salvar')[1].viagens['sale-1'].chegadaFinal, '2026-11-01T05:30:00.000Z');
    } finally { f.close(); }
});

test('arrival zone may remain saved without an arrival and clearing arrival never reuses the old instant', async () => {
    const initial = await snapshot();
    initial.preferencias.viagens['sale-1'] = { emissaoConfirmada: true, fusoIda: 'America/Sao_Paulo', fusoVolta: 'America/Sao_Paulo', fusoChegada: 'America/Sao_Paulo', chegadaFinal: '' };
    const f = await fixture({ initial });
    try {
        f.input('messages-model-text', 'Olá {{primeiro_nome}}, confira seu voo.');
        await f.click('[data-save]');
        let sent = f.calls.filter(call => call[0] === 'salvar').at(-1)[1];
        assert.equal(sent.viagens['sale-1'].chegadaFinal, '');
        assert.equal(sent.viagens['sale-1'].fusoChegada, 'America/Sao_Paulo');
        assert.equal(f.$('messages-error').hidden, true);
        f.input('messages-arrival', '2026-11-20T18:00');
        await f.click('[data-save]');
        assert.equal(f.app.getDraft().viagens['sale-1'].chegadaFinal, '2026-11-20T21:00:00.000Z');
        f.input('messages-arrival', '');
        await f.click('[data-save]');
        sent = f.calls.filter(call => call[0] === 'salvar').at(-1)[1];
        assert.equal(sent.viagens['sale-1'].chegadaFinal, '');
        assert.equal(sent.viagens['sale-1'].fusoChegada, 'America/Sao_Paulo');
        assert.equal(f.$('messages-arrival').value, '');
        assert.equal(f.$('messages-arrival-zone').value, 'America/Sao_Paulo');
        assert.equal(f.$('messages-error').hidden, true);
    } finally { f.close(); }
});

test('initial API failure has no invented tasks or editable fake saved state', async () => {
    const f = await fixture({ overrides: { async listar() { throw new Error('Central indisponível neste ambiente.'); } } });
    try {
        assert.equal(f.$('messages-error').hidden, false);
        assert.equal(f.$('messages-model-text').disabled, true);
        assert.equal(f.$('messages-prepare').disabled, true);
        assert.equal(f.dom.window.document.querySelector('[data-task-action]'), null);
        assert.equal(f.app.getDraft(), null);
    } finally { f.close(); }
});

test('only eligible task simulates and resulting history is explicitly not delivery', async () => {
    const f = await fixture();
    try {
        const button = f.dom.window.document.querySelector('[data-task-action="simular"]');
        assert.equal(button.disabled, false);
        button.click(); button.click(); await tick();
        assert.deepEqual(f.calls.filter(call => call[0] === 'simular'), [['simular', 'task-1']]);
        assert.match(f.$('messages-history').textContent, /Simulada/);
        assert.match(f.$('messages-history').textContent, /Nenhuma mensagem foi enviada/);
        assert.equal(f.dom.window.document.querySelector('[data-task-action="simular"]'), null);
    } finally { f.close(); }
});

test('history keeps the original contact snapshot after the current sale or task contact changes', async () => {
    const initial = await snapshot();
    const historical = { ...clone(initial.tarefas[0]), destinatario: '5562999991111', contexto: { primeiro_nome: 'Contato Anterior', origem: 'GYN', destino: 'GRU' } };
    initial.vendas[0].nomeCliente = 'Contato Atual';
    initial.tarefas[0].contexto.primeiro_nome = 'Contato Atual';
    initial.tarefas[0].destinatario = '5562999992222';
    initial.historico = [
        { id: 'history-snapshot', tarefa_id: 'task-1', estado: 'simulada', criado_em: at, snapshot: historical },
        { id: 'history-without-snapshot', tarefa_id: 'task-1', estado: 'simulada', criado_em: at }
    ];
    const f = await fixture({ initial });
    try {
        const cards = f.$('messages-history').querySelectorAll('article');
        assert.match(cards[0].textContent, /Contato Anterior/);
        assert.match(cards[0].textContent, /Destinatário registrado: 5562999991111/);
        assert.match(cards[1].textContent, /Cliente não registrado/);
        assert.match(cards[1].textContent, /Destinatário não registrado nesta ação/);
        assert.doesNotMatch(f.$('messages-history').textContent, /Contato Atual|5562999992222/);
        assert.doesNotMatch(cards[1].textContent, /Contato Anterior|5562999991111/);
    } finally { f.close(); }
});

test('expired, future, paused and quiet-hour tasks cannot simulate; expired paused task cannot resume', async () => {
    for (const scenario of ['expired', 'future', 'paused', 'quiet']) {
        const initial = await snapshot();
        if (scenario === 'expired') initial.tarefas[0].expira_em = at;
        if (scenario === 'future') initial.tarefas[0].agendado_em = '2026-11-15T14:00:00Z';
        if (scenario === 'paused') initial.preferencias.config.pausado = true;
        if (scenario === 'quiet') Object.assign(initial.preferencias.config, { silencioInicio: '09:00', silencioFim: '11:00' });
        const f = await fixture({ initial });
        try { assert.equal(f.dom.window.document.querySelector('[data-task-action="simular"]').disabled, true, scenario); } finally { f.close(); }
    }
    const initial = await snapshot(); initial.tarefas[0].estado = 'pausada'; initial.tarefas[0].expira_em = at;
    const f = await fixture({ initial });
    try {
        assert.equal(f.dom.window.document.querySelector('[data-task-action="retomar"]'), null);
        await f.click('[data-task-action="cancelar"]');
        assert.deepEqual(f.calls.at(-1), ['controlar', 'task-1', 'cancelar']);
    } finally { f.close(); }
});

test('simulation window is rechecked at click time, including when browser was left open', async () => {
    let clock = new Date(at);
    const f = await fixture({ now: () => clock });
    try {
        clock = new Date('2026-11-15T13:16:00Z');
        await f.click('[data-task-action="simular"]');
        assert.match(f.$('messages-error').textContent, /venceu/);
        assert.equal(f.calls.some(call => call[0] === 'simular'), false);
        assert.equal(f.dom.window.document.querySelector('[data-task-action="simular"]').disabled, true);
    } finally { f.close(); }
});

test('post-trip simulation uses the window after arrival instead of requiring a future flight', async () => {
    const initial = await snapshot();
    initial.preferencias.modelos.volta.ativo = true;
    Object.assign(initial.tarefas[0], { tipo: 'volta', embarque_em: '2026-11-14T13:00:00Z' });
    const f = await fixture({ initial });
    try {
        assert.equal(f.dom.window.document.querySelector('[data-task-action="simular"]').disabled, false);
        await f.click('[data-task-action="simular"]');
        assert.deepEqual(f.calls.at(-1), ['simular', 'task-1']);
    } finally { f.close(); }
});

test('switching reviewed sales preserves each draft and never confirms emission implicitly', async () => {
    const initial = await snapshot(); initial.vendas.push({ ...initial.vendas[0], id: 'sale-2', nomeCliente: 'Outra pessoa' });
    const f = await fixture({ initial });
    try {
        f.input('messages-issued', true, 'change');
        f.input('messages-outbound-zone', 'America/Manaus');
        f.input('messages-sale', 'sale-2', 'change');
        assert.equal(f.$('messages-issued').checked, false);
        assert.equal(f.$('messages-outbound-zone').value, '');
        f.input('messages-return-zone', 'Europe/Lisbon');
        f.input('messages-sale', 'sale-1', 'change');
        assert.equal(f.$('messages-issued').checked, true);
        assert.equal(f.$('messages-outbound-zone').value, 'America/Manaus');
        assert.equal(f.app.getDraft().viagens['sale-2'].emissaoConfirmada, false);
    } finally { f.close(); }
});

test('task preview is literal text and closes back to its triggering button', async () => {
    const initial = await snapshot(); initial.tarefas[0].texto = '<script>danger()</script>\nOi & até logo'; initial.vendas[0].nomeCliente = '<img src=x onerror=danger()>';
    const f = await fixture({ initial });
    try {
        const trigger = f.dom.window.document.querySelector('[data-task-preview]');
        await f.click('[data-task-preview]');
        assert.equal(f.$('messages-preview-dialog').hasAttribute('open'), true);
        assert.equal(f.$('messages-task-preview').textContent, initial.tarefas[0].texto);
        assert.equal(f.$('messages-task-preview').children.length, 0);
        assert.equal(f.$('messages-agenda').querySelector('img'), null);
        await f.click('#messages-preview-close');
        assert.equal(f.$('messages-preview-dialog').hasAttribute('open'), false);
        assert.equal(f.dom.window.document.activeElement, trigger);
    } finally { f.close(); }
});

test('API adapter only invokes central-mensagens with action payloads and preserves conflict status', async () => {
    const result = await snapshot(), requests = [];
    const api = createMessagesApi({ functions: { async invoke(name, options) { requests.push([name, options.body]); return { data: clone(result), error: null }; } } });
    await api.listar(); await api.salvar(result.preferencias); await api.preparar(); await api.controlar('task-1', 'pausar'); await api.simular('task-1');
    assert.deepEqual(requests.map(request => request[0]), Array(5).fill('central-mensagens'));
    assert.deepEqual(requests.map(request => request[1]), [
        { acao: 'listar' }, { acao: 'salvar', preferencias: result.preferencias }, { acao: 'preparar' }, { acao: 'controlar', id: 'task-1', comando: 'pausar' }, { acao: 'simular', id: 'task-1' }
    ]);
    const failing = createMessagesApi({ functions: { async invoke() { return { error: { context: { status: 409 }, message: 'internal detail' } }; } } });
    await assert.rejects(failing.salvar(result.preferencias), e => e.status === 409 && !e.message.includes('internal detail'));
    const wrongMode = createMessagesApi({ functions: { async invoke() { return { data: { ...result, modo: 'real' } }; } } });
    await assert.rejects(wrongMode.listar(), /indisponível/);
    await assert.rejects(createMessagesApi(null).listar(), /indisponível/);
});
