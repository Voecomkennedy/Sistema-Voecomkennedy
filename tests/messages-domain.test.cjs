const test = require('node:test');
const assert = require('node:assert/strict');
const domain = import('../js/messages-domain.mjs');
const now = new Date('2026-11-13T13:00:00Z');

async function fixture() {
    const d = await domain;
    return { userId: '11111111-1111-4111-8111-111111111111', origemVersao: 1, agora: now,
        preferencias: { versao: 1, config: structuredClone(d.DEFAULT_CONFIG), modelos: structuredClone(d.DEFAULT_MODELOS), viagens: {
            sale: { emissaoConfirmada: true, fusoIda: 'America/Sao_Paulo', fusoVolta: 'America/Sao_Paulo', chegadaFinal: '' }
        } }, conteudo: {
            emissao_vendas: [{ id: 'sale', clienteId: 'client', statusVenda: 'emitida', origem: ' GYN ', destino: 'gru', dataEmbarque: '2026-11-15', horaEmbarque: '10:00', dataVolta: '2026-11-20', horaVolta: '18:00', custo: 'SEGREDO_CUSTO' }],
            emissao_pessoas: [{ id: 'client', nome: 'MARIA Exemplo', telefone: '(62) 99999-1234', cpf: 'SEGREDO_CPF' }]
        } };
}

test('explicit foreign country code is preserved and malformed phones are rejected', async () => {
    const { normalizarTelefone: phone } = await domain;
    assert.equal(phone('+1 (212) 555-0100'), '12125550100');
    assert.equal(phone('62999991234'), '5562999991234');
    assert.equal(phone('+351 912 345 678'), '351912345678');
    for (const value of ['00000000000', '11111111111', 'x62999991234', '123@lid', '005562999991234', '', null]) assert.equal(phone(value), null);
});

test('wall-clock parsing does not depend on the computer zone and rejects rollovers', async () => {
    const { localToInstant: parse } = await domain;
    assert.equal(parse('2026-11-15', '10:00', 'America/Sao_Paulo'), '2026-11-15T13:00:00.000Z');
    assert.equal(parse('2026-11-15', '10:00', 'Asia/Kathmandu'), '2026-11-15T04:15:00.000Z');
    assert.equal(parse('2000-01-01', '00:00', 'UTC'), '2000-01-01T00:00:00.000Z');
    for (const [date, time, zone] of [['2026-02-31', '10:00', 'UTC'], ['2026-01-01', '24:00', 'UTC'], ['2026-01-01', '10:00', ''], ['2026-01-01', '10:00', 'invalid/zone']]) assert.throws(() => parse(date, time, zone));
});

test('ambiguous and nonexistent DST times require explicit review', async () => {
    const { localToInstant: parse } = await domain;
    assert.throws(() => parse('2026-11-01', '01:30', 'America/New_York'), /ambíguo/);
    assert.throws(() => parse('2026-03-08', '02:30', 'America/New_York'), /inexistente/);
    assert.equal(parse('2026-11-01', '03:30', 'America/New_York'), '2026-11-01T08:30:00.000Z');
});

test('templates preserve WhatsApp line breaks and reject unknown, missing and malformed tokens', async () => {
    const { renderTemplate: render, previewContext } = await domain;
    assert.equal(render('*Oi, {{ primeiro_nome }}!*\r\n\r\nVoo {{origem}}.', previewContext), '*Oi, Maria!*\n\nVoo GYN.');
    for (const template of ['{{custo}}', '{{primeiro_nome}', '{}', '', 'a'.repeat(4001)]) assert.throws(() => render(template, previewContext));
    assert.throws(() => render('{{origem}}', {}));
    assert.equal(render('{{primeiro_nome}}', { primeiro_nome: '{{custo}}' }), '{{custo}}');
});

test('preferences validate ranges, booleans, zones, arrival calendar and test phone', async () => {
    const d = await domain;
    const base = (await fixture()).preferencias;
    const mutate = fn => { const copy = structuredClone(base); fn(copy); return copy; };
    for (const value of [
        mutate(p => { p.config.pausado = 'false'; }),
        mutate(p => { p.config.silencioFim = p.config.silencioInicio; }),
        mutate(p => { p.modelos.dia.validadeMinutos = 61; }),
        mutate(p => { p.modelos.dia.antecedenciaMinutos = -1; }),
        mutate(p => { p.modelos.dia.texto = '{{segredo}}'; }),
        mutate(p => { p.config.numeroTeste = 'ramal 123'; }),
        mutate(p => { p.viagens.sale.chegadaFinal = '2026-02-31T10:00:00-03:00'; }),
        mutate(p => { p.viagens.sale.chegadaFinal = '2026-11-20T10:00'; })
    ]) assert.throws(() => d.validatePreferences(value));
    assert.equal(d.validatePreferences(base).config.pausado, true);
});

test('planner builds public immutable snapshots with normalized route and correct UTC', async () => {
    const d = await domain;
    const args = await fixture();
    const before = JSON.stringify(args);
    const result = d.planejar(args);
    assert.equal(result.tarefas.length, 4);
    assert.equal(result.pendencias.length, 0);
    const task = result.tarefas[0];
    assert.equal(task.agendado_em, '2026-11-13T13:00:00.000Z');
    assert.equal(task.expira_em, '2026-11-13T13:15:00.000Z');
    assert.equal(task.contexto.origem, 'GYN');
    assert.equal(task.contexto.destino, 'GRU');
    assert.equal(task.contexto.primeiro_nome, 'Maria');
    assert.equal(task.modo, 'simulacao');
    assert.equal(task.modelo_snapshot.texto, args.preferencias.modelos['48h'].texto);
    assert.doesNotMatch(JSON.stringify(result), /SEGREDO|custo|cpf/);
    assert.equal(JSON.stringify(args), before);
});

test('planner preserves expired scheduled instants instead of moving old messages to now', async () => {
    const d = await domain;
    const args = await fixture();
    const first = d.planejar(args).tarefas[0];
    args.agora = new Date('2026-12-15T13:00:00Z');
    const later = d.planejar(args).tarefas[0];
    assert.equal(later.agendado_em, first.agendado_em);
    assert.equal(later.expira_em, first.expira_em);
    assert.ok(new Date(later.expira_em) < args.agora);
});

test('inactive and archived sales never become tasks; emission status needs separate confirmation', async () => {
    const d = await domain;
    const args = await fixture();
    args.preferencias.viagens.sale.emissaoConfirmada = false;
    assert.equal(d.planejar(args).tarefas.length, 0);
    assert.equal(d.planejar(args).pendencias[0].codigo, 'emissao_nao_confirmada');
    args.preferencias.viagens.sale.emissaoConfirmada = true;
    for (const changes of [{ excluidaEm: now.toISOString() }, { statusVenda: 'cancelada' }]) {
        const copy = structuredClone(args);
        Object.assign(copy.conteudo.emissao_vendas[0], changes);
        assert.equal(d.planejar(copy).tarefas.length, 0);
    }
});

test('ambiguous clients, duplicate sales and missing timezones stay out of the queue', async () => {
    const d = await domain;
    for (const change of [
        a => a.conteudo.emissao_pessoas.push({ ...a.conteudo.emissao_pessoas[0] }),
        a => a.conteudo.emissao_vendas.push({ ...a.conteudo.emissao_vendas[0] }),
        a => { a.preferencias.viagens.sale.fusoIda = ''; },
        a => { a.conteudo.emissao_pessoas = []; }
    ]) {
        const args = await fixture(); change(args);
        const result = d.planejar(args);
        assert.equal(result.tarefas.length, 0);
        assert.ok(result.pendencias.length);
    }
});

test('return is interpreted in its departure timezone, independent of outbound timezone', async () => {
    const d = await domain;
    const args = await fixture();
    args.preferencias.viagens.sale.fusoVolta = 'America/New_York';
    const task = d.planejar(args).tarefas.find(t => t.tipo === 'volta_checkin');
    assert.equal(task.embarque_em, '2026-11-20T23:00:00.000Z');
    assert.equal(task.contexto.origem, 'GRU');
    assert.equal(task.contexto.hora_voo, '18:00');
});

test('missing, empty and malformed contact IDs cannot accidentally match each other', async () => {
    const d = await domain;
    for (const id of [undefined, null, '', '   ', {}, []]) {
        const args = await fixture();
        args.conteudo.emissao_vendas[0].clienteId = id;
        args.conteudo.emissao_pessoas[0].id = id;
        const result = d.planejar(args);
        assert.equal(result.tarefas.length, 0);
        assert.equal(result.pendencias[0].codigo, 'contato_invalido');
    }
    const args = await fixture();
    args.conteudo.emissao_vendas[0].clienteId = 123;
    args.conteudo.emissao_pessoas[0].id = '123';
    assert.equal(d.planejar(args).tarefas.length, 4);
});

test('linked independent return routes block return and post-trip instead of reversing outbound airports', async () => {
    const d = await domain;
    for (const proposal of [
        { multitrecho: true, origVolta: 'LIS — Lisboa', destVolta: 'GIG — Rio' },
        { multitrecho: true },
        { origVolta: 'LIS', destVolta: 'GIG' }
    ]) {
        const args = await fixture();
        args.preferencias.modelos.volta.ativo = true;
        args.preferencias.viagens.sale.chegadaFinal = '2026-11-21T12:00:00Z';
        args.conteudo.emissao_cotacoes = [{ vendaId: 'sale', propostaCompleta: proposal }];
        const result = d.planejar(args);
        assert.equal(result.tarefas.length, 3);
        assert.equal(result.tarefas.some(t => t.tipo.startsWith('volta')), false);
        assert.equal(result.pendencias[0].codigo, 'volta_multitrecho');
    }
    const args = await fixture();
    args.conteudo.emissao_cotacoes = [{ vendaId: 'other-sale', propostaCompleta: { multitrecho: true } },
        { vendaId: 'sale', propostaCompleta: { multitrecho: false, origVolta: 'GRU — Guarulhos', destVolta: 'GYN' } }];
    assert.equal(d.planejar(args).tarefas.length, 4);
    args.conteudo.emissao_cotacoes = {};
    assert.throws(() => d.planejar(args), /cotações inválidos/);
});

test('post-trip never infers arrival from return departure and only uses confirmed later arrival', async () => {
    const d = await domain;
    const args = await fixture();
    args.preferencias.modelos.volta.ativo = true;
    assert.equal(d.planejar(args).tarefas.some(t => t.tipo === 'volta'), false);
    args.preferencias.viagens.sale.chegadaFinal = '2026-11-20T18:00:00-03:00';
    assert.equal(d.planejar(args).tarefas.some(t => t.tipo === 'volta'), false);
    args.preferencias.viagens.sale.chegadaFinal = '2026-11-20T20:00:00-03:00';
    const task = d.planejar(args).tarefas.find(t => t.tipo === 'volta');
    assert.equal(task.embarque_em, '2026-11-20T23:00:00.000Z');
    assert.equal(task.agendado_em, '2026-11-21T23:00:00.000Z');
});

test('quiet hours affect planning and include 21:00 but exclude 08:00', async () => {
    const d = await domain;
    const args = await fixture();
    assert.equal(d.emSilencio('2026-11-14T00:00:00Z', args.preferencias.config), true);
    assert.equal(d.emSilencio('2026-11-14T11:00:00Z', args.preferencias.config), false);
    args.conteudo.emissao_vendas[0].horaEmbarque = '06:00';
    const task = d.planejar(args).tarefas.find(t => t.tipo === '48h');
    assert.ok(new Date(task.agendado_em) < new Date('2026-11-13T09:00:00Z'));
    assert.equal(d.emSilencio(task.agendado_em, args.preferencias.config), false);
    assert.equal(d.emSilencio(new Date(new Date(task.expira_em).getTime() - 1), args.preferencias.config), false);
});

test('actual-time composition replaces tomorrow with today after midnight', async () => {
    const d = await domain;
    const task = d.planejar(await fixture()).tarefas.find(t => t.tipo === '24h');
    assert.equal(d.contextoNoInstante(task, '2026-11-15T02:59:00Z').quando, 'amanhã');
    assert.equal(d.contextoNoInstante(task, '2026-11-15T03:00:00Z').quando, 'hoje');
});

test('source corruption and unsafe versions fail closed without returning an empty destructive plan', async () => {
    const d = await domain;
    for (const change of [a => { a.conteudo.emissao_vendas = 'bad'; }, a => { a.origemVersao = NaN; }, a => { a.agora = 'bad'; }, a => { a.preferencias.versao = 1.1; }]) {
        const args = await fixture(); change(args); assert.throws(() => d.planejar(args));
    }
});
