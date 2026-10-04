import assert from "node:assert/strict";
import {
  ajustarSilencio,
  chaveEnvio,
  devido,
  emSilencio,
  lerDataHora,
  montarEventos,
  motivoBloqueio,
  normalizarTelefone,
  texto,
  TOLERANCIA_MS,
} from "../../_shared/pos-venda-candidate/engine.ts";
import { evento, snapshot, venda } from "./fixtures.ts";

Deno.test("arquivadas e vendas não emitidas não geram eventos", () => {
  for (
    const overrides of [{ excluidaEm: "2026-10-03T10:00:00Z" }, {
      statusVenda: "cancelada",
    }, { statusVenda: "reembolso_total" }]
  ) {
    assert.equal(montarEventos([snapshot(overrides)]).length, 0);
  }
  assert.equal(montarEventos([snapshot({ excluidaEm: null })]).length, 3);
});
Deno.test("valida datas e horas sem rollover ou ausência", () => {
  for (
    const [data, hora] of [
      ["2026-02-31", "10:00"],
      ["2026-10-06", "24:00"],
      ["2026-10-06", "10:60"],
      ["2026-10-06", ""],
      ["2026-13-01", "10:00"],
      ["2026-10-06abc", "10:00"],
    ]
  ) {
    assert.equal(lerDataHora(data, hora), null);
    assert.equal(
      montarEventos([snapshot({ dataEmbarque: data, horaEmbarque: hora })])
        .length,
      0,
    );
  }
  assert.equal(
    lerDataHora("2028-02-29", "08:00")?.toISOString(),
    "2028-02-29T11:00:00.000Z",
  );
});
Deno.test("clientes com ID igual em contas distintas permanecem separados", () => {
  const a = snapshot();
  const b = {
    user_id: "conta-2",
    conteudo: {
      emissao_vendas: [venda()],
      emissao_pessoas: [{
        id: "pessoa-1",
        nome: "Outra pessoa",
        telefone: "62999990002",
      }],
    },
  };
  const eventos = montarEventos([a, b]);
  assert.equal(eventos.length, 6);
  assert.equal(
    eventos.find((e) => e.proprietario === "conta-2")?.cliente?.nome,
    "Outra pessoa",
  );
  assert.notEqual(
    chaveEnvio(eventos[0], "real"),
    chaveEnvio(eventos[1], "real"),
  );
});
Deno.test("nunca busca cliente em outra conta ou aceita cadastro ambíguo", () => {
  const falta = {
    user_id: "conta-1",
    conteudo: { emissao_vendas: [venda()], emissao_pessoas: [] },
  };
  const outro = snapshot({}, "conta-2");
  const e = montarEventos([falta, outro]).find((e) =>
    e.proprietario === "conta-1"
  )!;
  assert.equal(e.cliente, null);
  assert.equal(devido(e, e.quando), false);
  const ambiguo = {
    user_id: "conta-1",
    conteudo: {
      emissao_vendas: [venda()],
      emissao_pessoas: [{ id: "pessoa-1", telefone: "62999990001" }, {
        id: "pessoa-1",
        telefone: "62999990002",
      }],
    },
  };
  assert.equal(montarEventos([ambiguo])[0].cliente, null);
});
Deno.test("dados malformados, conta duplicada e venda duplicada não provocam envio", () => {
  assert.deepEqual(montarEventos([{ user_id: "", conteudo: null }]), []);
  assert.deepEqual(montarEventos([snapshot(), snapshot()]), []);
  assert.deepEqual(
    montarEventos([{
      user_id: "conta",
      conteudo: { emissao_vendas: [venda(), venda()] },
    }]),
    [],
  );
  assert.deepEqual(
    montarEventos([{
      user_id: "conta",
      conteudo: { emissao_vendas: "corrompido" },
    }]),
    [],
  );
});
Deno.test("silêncio se aplica no instante real: 08:00 permite, 21:00 bloqueia", () => {
  assert.equal(emSilencio(new Date("2026-10-04T10:59:59Z")), true);
  assert.equal(emSilencio(new Date("2026-10-04T11:00:00Z")), false);
  assert.equal(emSilencio(new Date("2026-10-04T23:59:59Z")), false);
  assert.equal(emSilencio(new Date("2026-10-05T00:00:00Z")), true);
  assert.equal(emSilencio(new Date("invalid")), true);
});
Deno.test("agendamento de madrugada preserva antecipação para 20h da véspera", () => {
  assert.equal(
    ajustarSilencio(new Date("2026-10-05T05:30:00Z")).toISOString(),
    "2026-10-04T23:00:00.000Z",
  );
  assert.equal(
    ajustarSilencio(new Date("2026-10-05T01:00:00Z")).toISOString(),
    "2026-10-04T23:00:00.000Z",
  );
});
Deno.test("tolerância é menor que 15 minutos, sem recuperar lote de 6h/24h", () => {
  const e = evento();
  assert.equal(devido(e, new Date(e.quando.getTime() - 1)), false);
  assert.equal(devido(e, e.quando), true);
  assert.equal(
    devido(e, new Date(e.quando.getTime() + TOLERANCIA_MS - 1)),
    true,
  );
  assert.equal(
    motivoBloqueio(e, new Date(e.quando.getTime() + TOLERANCIA_MS)),
    "janela_expirada",
  );
  assert.equal(devido(e, new Date(e.quando.getTime() + 6 * 3_600_000)), false);
  assert.equal(devido(e, new Date(e.quando.getTime() + 24 * 3_600_000)), false);
});
Deno.test("embarque já ocorrido nunca é elegível", () => {
  const e = evento();
  e.quando = new Date(e.embarque);
  assert.equal(motivoBloqueio(e, e.embarque), "embarque_passado");
});
Deno.test("hoje e amanhã usam instante da composição, não agendamento", () => {
  const e = evento();
  e.tipo = "24h";
  assert.ok(
    texto(e, new Date("2026-10-05T23:00:00Z")).includes("Sua viagem é amanhã."),
  );
  assert.ok(
    texto(e, new Date("2026-10-06T11:00:00Z")).includes("Sua viagem é hoje."),
  );
  e.tipo = "dia";
  assert.ok(
    texto(e, new Date("2026-10-06T11:00:00Z")).startsWith("Hoje é dia"),
  );
  e.tipo = "volta_checkin";
  assert.ok(
    texto(e, new Date("2026-10-06T11:00:00Z")).includes(
      "Seu voo de volta é hoje.",
    ),
  );
});
Deno.test("volta exige horário para check-in; partida não comprova chegada", () => {
  const semHora = montarEventos([snapshot({ dataVolta: "2026-10-10" })]);
  assert.equal(semHora.length, 3);
  const comHora = montarEventos([
    snapshot({ dataVolta: "2026-10-10", horaVolta: "10:00" }),
  ]);
  assert.equal(comHora.filter((e) => e.tipo === "volta_checkin").length, 1);
  assert.equal(comHora.some((e) => e.tipo === "volta"), false);
  const e = evento();
  e.tipo = "volta";
  assert.equal(motivoBloqueio(e, e.quando), "chegada_nao_confirmada");
  assert.throws(() => texto(e, e.quando));
});
Deno.test("não transforma LID, lixo ou telefone vazio em destinatário", () => {
  assert.equal(normalizarTelefone("123456789123@lid"), null);
  assert.equal(normalizarTelefone("abc62999990001"), null);
  assert.equal(normalizarTelefone(""), null);
  assert.equal(normalizarTelefone("123"), null);
  assert.equal(normalizarTelefone("+55 (62) 99999-0001"), "5562999990001");
});
Deno.test("preserva DDI explícito e aplica Brasil somente ao nacional sem +", () => {
  assert.equal(normalizarTelefone("+1 (212) 555-0100"), "12125550100");
  assert.equal(normalizarTelefone(" +351 912 345 678 "), "351912345678");
  assert.equal(normalizarTelefone("+55 (62) 99999-0001"), "5562999990001");
  assert.equal(normalizarTelefone("(62) 99999-0001"), "5562999990001");
  assert.equal(normalizarTelefone("(62) 3333-0001"), "556233330001");
  assert.equal(normalizarTelefone("5562999990001"), "5562999990001");
});
Deno.test("rejeita destinatários obviamente inválidos sem transformar texto", () => {
  for (
    const entrada of [
      "00000000000",
      "11111111111",
      "00999990001",
      "+00012345678",
      "+1212",
      "+1234567890123456",
      "62/99999-0001",
      "++1 212 555 0100",
      "62 99999-0001 ramal 2",
    ]
  ) {
    assert.equal(normalizarTelefone(entrada), null, entrada);
  }
});
Deno.test("chave de envio distingue modo e não reseta ao alterar horário", () => {
  const e = evento();
  const key = chaveEnvio(e, "real");
  assert.notEqual(key, chaveEnvio(e, "teste"));
  e.embarque = new Date("2026-10-10T13:00:00Z");
  assert.equal(chaveEnvio(e, "real"), key);
});
