const { Pool } = require('pg');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const url = new URL(process.env.VCK_TEST_DATABASE_URL || 'http://missing.invalid');
if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.pathname !== '/vck_central_test' || !url.port) {
    throw new Error('Use npm run test:db. Testes aceitam somente o banco local dedicado vck_central_test.');
}
const pool = new Pool({ connectionString: url.href, max: 12 });
const domain = import('../../js/messages-domain.mjs');

async function session(role, owner, callback) {
    assert.ok(['service_role', 'authenticated', 'anon'].includes(role));
    const client = await pool.connect();
    try {
        await client.query('begin');
        await client.query(`set local role ${role}`);
        if (owner) await client.query("select set_config('request.jwt.claim.sub', $1, true)", [owner]);
        const value = await callback(client);
        await client.query('commit');
        return value;
    } catch (e) { await client.query('rollback'); throw e; }
    finally { client.release(); }
}
const rpc = (name, args) => {
    assert.match(name, /^mensagens_[a-z_]+$/);
    return session('service_role', null, async c => (await c.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as value`, args)).rows[0].value);
};

async function fixture({ duplicate = false } = {}) {
    const d = await domain;
    const owner = randomUUID();
    const now = new Date();
    const flight = new Date(Math.floor(now.getTime() / 60000) * 60000 + 3600000);
    const quiet = new Date(now.getTime() + 2 * 3600000).toISOString().slice(11, 16);
    const quietEnd = new Date(now.getTime() + 2 * 3600000 + 60000).toISOString().slice(11, 16);
    const preferences = { versao: 0, config: { ...d.DEFAULT_CONFIG, pausado: false, fuso: 'UTC', silencioInicio: quiet, silencioFim: quietEnd }, modelos: structuredClone(d.DEFAULT_MODELOS), viagens: {} };
    for (const m of Object.values(preferences.modelos)) { m.ativo = false; }
    Object.assign(preferences.modelos.dia, { ativo: true, antecedenciaMinutos: 60 });
    const sale = { id: 'sale-1', clienteId: 'person-1', statusVenda: 'emitida', origem: 'GYN', destino: 'GRU', dataEmbarque: flight.toISOString().slice(0, 10), horaEmbarque: flight.toISOString().slice(11, 16), custo: 'CUSTO_PRIVADO' };
    const source = { emissao_vendas: [sale], emissao_pessoas: [{ id: 'person-1', nome: 'Pessoa Fictícia', telefone: '+55 62 99999-1234', cpf: 'DOCUMENTO_PRIVADO' }] };
    preferences.viagens[sale.id] = { ...d.defaultViagem, emissaoConfirmada: true, fusoIda: 'UTC' };
    if (duplicate) {
        source.emissao_vendas.push({ ...sale, id: 'sale-2', origem: ' gyn ', destino: 'gru' });
        preferences.viagens['sale-2'] = { ...preferences.viagens[sale.id] };
    }
    await pool.query('insert into auth.users(id) values($1)', [owner]);
    await pool.query('insert into public.dados_app(user_id,conteudo,versao) values($1,$2,1)', [owner, source]);
    const saved = await rpc('mensagens_salvar_preferencias', [owner, 0, preferences.config, preferences.modelos, preferences.viagens]);
    const plan = d.planejar({ userId: owner, conteudo: source, origemVersao: 1, preferencias: saved, agora: now });
    const { fingerprint } = await rpc('mensagens_fonte', [owner]);
    await rpc('mensagens_preparar', [owner, 1, saved.versao, JSON.stringify(plan.tarefas), fingerprint]);
    const tasks = (await pool.query('select * from public.mensagens_tarefas where user_id=$1 order by venda_id', [owner])).rows;
    return { owner, preferences: saved, source, tasks, plan, fingerprint };
}
module.exports = { pool, domain, session, rpc, fixture };
