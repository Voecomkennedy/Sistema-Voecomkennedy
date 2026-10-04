const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { pool, domain, session, rpc, fixture } = require('./helpers.cjs');
test.after(() => pool.end());
const reserve = (f, id = f.tasks[0].id) => rpc('mensagens_reservar', [f.owner, id]);
const begin = (f, task) => rpc('mensagens_iniciar', [f.owner, task.id, task.reserva_token]);
const finish = (f, task, state = 'simulada') => rpc('mensagens_concluir', [f.owner, task.id, task.reserva_token, state, { modo: 'simulacao', motivo: 'teste_ficticio', id_simulado: 'sim-local' }]);

test('real PostgreSQL RLS separates accounts and forbids client writes/RPC execution', async () => {
    const a = await fixture(), b = await fixture();
    await session('authenticated', a.owner, async c => {
        const rows = (await c.query('select user_id from public.mensagens_tarefas')).rows;
        assert.ok(rows.length);
        assert.ok(rows.every(r => r.user_id === a.owner));
        assert.equal((await c.query('select * from public.mensagens_preferencias where user_id=$1', [b.owner])).rowCount, 0);
    });
    for (const role of ['anon', 'authenticated']) {
        await assert.rejects(session(role, a.owner, c => c.query('select public.mensagens_reservar($1,$2)', [a.owner, a.tasks[0].id])), { code: '42501' });
        await assert.rejects(session(role, a.owner, c => c.query("update public.mensagens_tarefas set estado='simulada' where user_id=$1", [a.owner])), { code: '42501' });
    }
    await assert.rejects(session('anon', null, c => c.query('select * from public.mensagens_historico')), { code: '42501' });
    await assert.rejects(rpc('mensagens_controlar', [a.owner, b.tasks[0].id, 'cancelar']), { code: 'PT404' });
});

test('two independent database connections reserve only one logical task', async () => {
    const f = await fixture();
    const results = await Promise.all([reserve(f), reserve(f)]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(results.find(Boolean).estado, 'reservada');
});

test('conversation uniqueness prevents duplicate sales and retains completed tombstone', async () => {
    const f = await fixture({ duplicate: true });
    assert.equal(f.tasks.length, 2);
    const results = await Promise.all(f.tasks.map(task => reserve(f, task.id)));
    assert.equal(results.filter(Boolean).length, 1);
    const reserved = results.find(Boolean);
    const started = await begin(f, reserved);
    assert.equal(started.estado, 'tentativa');
    await finish(f, started);
    const other = f.tasks.find(t => t.id !== started.id);
    assert.equal(await reserve(f, other.id), null);
    assert.equal(await reserve(f, started.id), null);
});

test('pause and cancellation before begin prevent the attempt; old token cannot revive it', async () => {
    for (const command of ['pausar', 'cancelar']) {
        const f = await fixture();
        const reserved = await reserve(f);
        await rpc('mensagens_controlar', [f.owner, reserved.id, command]);
        assert.equal(await begin(f, reserved), null);
        assert.equal((await pool.query('select tentativa_em from public.mensagens_tarefas where id=$1', [reserved.id])).rows[0].tentativa_em, null);
    }
});

test('pause after attempt begins reports conflict instead of pretending to cancel delivery', async () => {
    const f = await fixture();
    const started = await begin(f, await reserve(f));
    await assert.rejects(rpc('mensagens_controlar', [f.owner, started.id, 'cancelar']), { code: 'PT409' });
    assert.equal((await pool.query('select estado from public.mensagens_tarefas where id=$1', [started.id])).rows[0].estado, 'tentativa');
});

test('global pause and optimistic preference revision are enforced inside database', async () => {
    const f = await fixture();
    const reserved = await reserve(f);
    const config = { ...f.preferences.config, pausado: true };
    await rpc('mensagens_salvar_preferencias', [f.owner, f.preferences.versao, config, f.preferences.modelos, f.preferences.viagens]);
    assert.equal(await begin(f, reserved), null);
    await assert.rejects(rpc('mensagens_salvar_preferencias', [f.owner, f.preferences.versao, config, f.preferences.modelos, f.preferences.viagens]), { code: 'PT409' });
});

test('expired resume/preparation never resets old deadlines or resurrects manual cancellation', async () => {
    const f = await fixture();
    await rpc('mensagens_controlar', [f.owner, f.tasks[0].id, 'pausar']);
    await pool.query("update public.mensagens_tarefas set agendado_em=clock_timestamp()-interval '2 days', expira_em=clock_timestamp()-interval '2 days'+interval '15 minutes' where id=$1", [f.tasks[0].id]);
    await rpc('mensagens_controlar', [f.owner, f.tasks[0].id, 'retomar']);
    assert.equal(await reserve(f), null);
    const row = (await pool.query('select estado,expira_em from public.mensagens_tarefas where id=$1', [f.tasks[0].id])).rows[0];
    assert.equal(row.estado, 'expirada');
    await rpc('mensagens_preparar', [f.owner, 1, f.preferences.versao, JSON.stringify(f.plan.tarefas), f.fingerprint]);
    assert.equal((await pool.query('select expira_em from public.mensagens_tarefas where id=$1', [f.tasks[0].id])).rows[0].expira_em.getTime(), row.expira_em.getTime());
    const g = await fixture();
    await rpc('mensagens_controlar', [g.owner, g.tasks[0].id, 'cancelar']);
    await rpc('mensagens_preparar', [g.owner, 1, g.preferences.versao, JSON.stringify(g.plan.tarefas), g.fingerprint]);
    assert.equal(await reserve(g), null);
});

test('archival or changed source version after reservation prevents begin', async () => {
    for (const change of ['archive', 'version']) {
        const f = await fixture();
        const reserved = await reserve(f);
        if (change === 'archive') {
            f.source.emissao_vendas[0].excluidaEm = new Date().toISOString();
            await pool.query('update public.dados_app set conteudo=$2 where user_id=$1', [f.owner, f.source]);
        } else await pool.query('update public.dados_app set versao=versao+1 where user_id=$1', [f.owner]);
        assert.equal(await begin(f, reserved), null);
    }
});

test('phone or flight changes without version increments also invalidate a reservation', async () => {
    for (const field of ['phone', 'flight']) {
        const f = await fixture();
        const reserved = await reserve(f);
        if (field === 'phone') f.source.emissao_pessoas[0].telefone = '+55 62 98888-4321';
        else f.source.emissao_vendas[0].horaEmbarque = '00:01';
        await pool.query('update public.dados_app set conteudo=$2 where user_id=$1', [f.owner, f.source]);
        assert.equal(await begin(f, reserved), null);
    }
});

test('time window and quiet hours use database clock, not caller-provided time', async () => {
    const f = await fixture();
    await pool.query("update public.mensagens_tarefas set agendado_em=clock_timestamp()+interval '1 hour', expira_em=clock_timestamp()+interval '75 minutes' where id=$1", [f.tasks[0].id]);
    assert.equal(await reserve(f), null);
    const g = await fixture();
    const start = new Date(Date.now() - 60000).toISOString().slice(11, 16);
    const end = new Date(Date.now() + 60000).toISOString().slice(11, 16);
    await pool.query("update public.mensagens_preferencias set config=jsonb_set(jsonb_set(config,'{silencioInicio}',to_jsonb($2::text)),'{silencioFim}',to_jsonb($3::text)) where user_id=$1", [g.owner, start, end]);
    assert.equal(await reserve(g), null);
});

test('attempt token is CAS-protected; crash/uncertain state does not automatically retry', async () => {
    const f = await fixture();
    const reserved = await reserve(f);
    assert.equal(await rpc('mensagens_iniciar', [f.owner, reserved.id, randomUUID()]), null);
    const started = await begin(f, reserved);
    assert.equal(await reserve(f), null); // Process crashed after begin.
    assert.equal(await rpc('mensagens_concluir', [f.owner, started.id, randomUUID(), 'simulada', {}]), null);
    await finish(f, started, 'incerto');
    assert.equal(await reserve(f), null);
});

test('finish is idempotent in effect and history is immutable to client/service roles', async () => {
    const f = await fixture();
    const started = await begin(f, await reserve(f));
    await finish(f, started);
    const before = (await pool.query('select count(*)::int n from public.mensagens_historico where tarefa_id=$1', [started.id])).rows[0].n;
    await finish(f, started);
    const after = (await pool.query('select count(*)::int n from public.mensagens_historico where tarefa_id=$1', [started.id])).rows[0].n;
    assert.equal(after, before);
    for (const role of ['authenticated', 'service_role']) await assert.rejects(session(role, f.owner, c => c.query('delete from public.mensagens_historico where tarefa_id=$1', [started.id])), { code: '42501' });
    await assert.rejects(pool.query('update public.mensagens_historico set estado=$2 where tarefa_id=$1', [started.id, 'entregue']), { code: 'PT422' });
});

test('replanning a changed unattempted task preserves its pause and invalidates old token', async () => {
    const f = await fixture();
    const reserved = await reserve(f);
    await rpc('mensagens_controlar', [f.owner, reserved.id, 'pausar']);
    f.source.emissao_pessoas[0].nome = 'Nome revisado';
    await pool.query('update public.dados_app set conteudo=$2,versao=2 where user_id=$1', [f.owner, f.source]);
    const plan = (await domain).planejar({ userId: f.owner, conteudo: f.source, origemVersao: 2, preferencias: f.preferences, agora: new Date() });
    const { fingerprint } = await rpc('mensagens_fonte', [f.owner]);
    await rpc('mensagens_preparar', [f.owner, 2, f.preferences.versao, JSON.stringify(plan.tarefas), fingerprint]);
    assert.equal(await begin(f, reserved), null);
    assert.equal(await reserve(f), null);
    const row = (await pool.query('select * from public.mensagens_tarefas where id=$1', [reserved.id])).rows[0];
    assert.equal(row.estado, 'pausada');
    assert.equal(row.contexto.primeiro_nome, 'Nome');
});

test('preparation rejects a changed source snapshot even when an old writer did not increment version', async () => {
    const f = await fixture();
    f.source.emissao_pessoas[0].telefone = '+55 62 98888-4321';
    await pool.query('update public.dados_app set conteudo=$2 where user_id=$1', [f.owner, f.source]);
    await assert.rejects(rpc('mensagens_preparar', [f.owner, 1, f.preferences.versao, JSON.stringify(f.plan.tarefas), f.fingerprint]), { code: 'PT409' });
});
