const test = require('node:test');
const assert = require('node:assert/strict');
const { pool, session, fixture } = require('./helpers.cjs');
test.after(() => pool.end());

// Exercises the actual HTTP handler and REST adapter against real PostgreSQL.
// Only the HTTP framing of Supabase Auth/PostgREST is replaced; calls outside
// these local paths fail. No network transport to WhatsApp exists in this code.
async function app(a, b) {
    const { createHandler } = await import('../../supabase/functions/_shared/central-mensagens/handler.ts');
    const { createSupabaseAdapter } = await import('../../supabase/functions/_shared/central-mensagens/adapter.ts');
    const domain = await import('../../js/messages-domain.mjs');
    const calls = [];
    const tokens = { 'session-a': a.owner, 'session-b': b.owner };
    const adapter = createSupabaseAdapter({ url: 'http://127.0.0.1:12345', serviceKey: 'SYNTHETIC_SECRET', authKey: 'SYNTHETIC_PUBLIC', fetch: async (input, options) => {
        const url = new URL(input);
        assert.equal(url.origin, 'http://127.0.0.1:12345');
        calls.push(url.pathname);
        if (url.pathname === '/auth/v1/user') {
            const token = String(options.headers.Authorization).replace('Bearer ', '');
            return tokens[token] ? Response.json({ id: tokens[token] }) : Response.json({}, { status: 401 });
        }
        assert.equal(options.headers.Authorization, 'Bearer SYNTHETIC_SECRET');
        try {
            if (url.pathname.startsWith('/rest/v1/rpc/')) {
                const name = url.pathname.split('/').at(-1);
                assert.match(name, /^mensagens_[a-z_]+$/);
                const args = JSON.parse(options.body);
                const entries = Object.entries(args);
                for (const [key] of entries) assert.match(key, /^p_[a-z_]+$/);
                const value = await session('service_role', null, async c => (await c.query(
                    `select public.${name}(${entries.map(([key], i) => key + ' => $' + (i + 1)).join(',')}) value`,
                    entries.map(([, v]) => Array.isArray(v) ? JSON.stringify(v) : v)
                )).rows[0].value);
                return Response.json(value);
            }
            const table = url.pathname.split('/').at(-1);
            assert.ok(['dados_app', 'mensagens_preferencias', 'mensagens_tarefas', 'mensagens_historico'].includes(table));
            const columns = url.searchParams.get('select');
            assert.match(columns, /^[a-z_]+(?:,[a-z_]+)*$/);
            const owner = url.searchParams.get('user_id');
            assert.match(owner, /^eq\.[0-9a-f-]{36}$/);
            const order = (url.searchParams.get('order') || '').split(',').filter(Boolean).map(entry => {
                assert.match(entry, /^[a-z_]+\.(asc|desc)$/);
                return entry.replace('.', ' ');
            });
            const limit = Number(url.searchParams.get('limit') || 500);
            assert.ok(Number.isInteger(limit) && limit > 0 && limit <= 500);
            const rows = await session('service_role', null, async c => (await c.query(
                `select coalesce(jsonb_agg(q),'[]'::jsonb) value from (select ${columns} from public.${table} where user_id=$1 ${order.length ? 'order by ' + order.join(',') : ''} limit $2) q`, [owner.slice(3), limit]
            )).rows[0].value);
            return Response.json(rows);
        } catch (e) { return Response.json({ code: e.code || 'TEST_FAIL', message: 'SYNTHETIC_SECRET_UPSTREAM' }, { status: 400 }); }
    } });
    const handler = createHandler({ enabled: true, authenticate: adapter.authenticate, repository: adapter.repository, domain });
    async function request(payload, token = 'session-a') {
        const response = await handler(new Request('http://local.invalid/central-mensagens', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(payload) }));
        return { status: response.status, body: await response.json() };
    }
    return { request, calls };
}

test('authenticated HTTP → adapter → PostgreSQL flow lists, previews, simulates and records a single fake result', async () => {
    const a = await fixture(), b = await fixture();
    const { request, calls } = await app(a, b);
    const initial = await request({ acao: 'listar' });
    assert.equal(initial.status, 200);
    assert.equal(initial.body.modo, 'simulacao');
    assert.equal(initial.body.tarefas.length, 1);
    assert.doesNotMatch(JSON.stringify(initial.body), /CUSTO_PRIVADO|DOCUMENTO_PRIVADO|SYNTHETIC_SECRET|reserva_token/);
    assert.equal((await request({ acao: 'listar', user_id: b.owner })).status, 400);
    assert.equal((await request({ acao: 'listar' }, 'invalid')).status, 401);
    assert.equal((await request({ acao: 'controlar', id: b.tasks[0].id, comando: 'cancelar' })).status, 404);
    const result = await request({ acao: 'simular', id: a.tasks[0].id });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.tarefas[0].estado, 'simulada');
    const history = result.body.historico.filter(row => row.estado === 'simulada');
    assert.equal(history.length, 1);
    assert.match(history[0].detalhe.id_simulado, /^sim-/);
    assert.match(history[0].detalhe.texto, /Pessoa/);
    assert.equal((await request({ acao: 'simular', id: a.tasks[0].id })).status, 409);
    assert.ok(calls.every(path => path.startsWith('/rest/v1/') || path === '/auth/v1/user'));
});

test('concurrent HTTP simulation requests cannot both complete, and stale preference edits return 409', async () => {
    const a = await fixture(), b = await fixture();
    const { request } = await app(a, b);
    const results = await Promise.all([request({ acao: 'simular', id: a.tasks[0].id }), request({ acao: 'simular', id: a.tasks[0].id })]);
    assert.equal(results.filter(r => r.status === 200).length, 1, JSON.stringify(results));
    const prefs = (await request({ acao: 'listar' })).body.preferencias;
    prefs.config.pausado = true;
    assert.equal((await request({ acao: 'salvar', preferencias: prefs })).status, 200);
    assert.equal((await request({ acao: 'salvar', preferencias: prefs })).status, 409);
    const n = (await pool.query("select count(*)::int n from public.mensagens_historico where user_id=$1 and estado='simulada'", [a.owner])).rows[0].n;
    assert.equal(n, 1);
});
