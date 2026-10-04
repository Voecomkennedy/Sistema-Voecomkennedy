import { deepEqual, equal, match, ok } from "node:assert/strict";
import { domain } from "../../_shared/central-mensagens/domain.ts";
import { createHandler } from "../../_shared/central-mensagens/handler.ts";
import {
  FakeRepository,
  FINGERPRINT,
  ID,
  NOW,
  OTHER,
  OWNER,
  preferences,
  request,
  TOKEN,
} from "./fixtures.ts";
import type {
  Domain,
  JsonObject,
} from "../../_shared/central-mensagens/types.ts";

function setup(
  options: { enabled?: boolean; domain?: Domain; now?: () => Date } = {},
) {
  const repository = new FakeRepository();
  const authentications: string[] = [];
  const handler = createHandler({
    enabled: options.enabled ?? true,
    allowedOrigins: ["https://app.example.test"],
    repository,
    domain: options.domain ?? domain,
    now: options.now ?? (() => new Date(NOW)),
    authenticate(token) {
      authentications.push(token);
      return Promise.resolve(token === "valid.jwt" ? OWNER : null);
    },
  });
  return { repository, authentications, handler };
}

Deno.test("gate fechado, GET e preflight não acessam dados nem autenticação", async () => {
  const test = setup({ enabled: false });
  equal((await test.handler(request({ acao: "simular", id: ID }))).status, 503);
  equal((await test.handler(request({}, { method: "GET" }))).status, 405);
  equal((await test.handler(request({}, { method: "OPTIONS" }))).status, 204);
  equal(test.authentications.length, 0);
  equal(test.repository.calls.length, 0);
});

Deno.test("valida bearer antes de ler qualquer cadastro, rejeita token ausente/inválido", async () => {
  const test = setup();
  equal(
    (await test.handler(request({ acao: "listar" }, { token: "" }))).status,
    401,
  );
  equal(
    (await test.handler(request({ acao: "listar" }, { token: "forged" })))
      .status,
    401,
  );
  equal(test.repository.calls.length, 0);
  deepEqual(test.authentications, ["forged"]);
});

Deno.test("CORS aceita somente origem exata configurada, sem cookie/wildcard", async () => {
  const test = setup();
  const good = request({ acao: "listar" });
  good.headers.set("origin", "https://app.example.test");
  const response = await test.handler(good);
  equal(response.status, 200);
  equal(
    response.headers.get("access-control-allow-origin"),
    "https://app.example.test",
  );
  equal(response.headers.get("access-control-allow-credentials"), null);
  const evil = request({ acao: "listar" });
  evil.headers.set("origin", "https://app.example.test.evil.test");
  equal((await test.handler(evil)).status, 403);
  equal(test.authentications.length, 1);
});

Deno.test("rejeita owner, clock, modo e transporte fornecidos pelo chamador", async () => {
  for (
    const extra of [{ user_id: OTHER }, { agora: NOW }, { modo: "real" }, {
      transport: "zapi",
    }, { url: "https://evil.test" }]
  ) {
    const test = setup();
    equal(
      (await test.handler(request({ acao: "listar", ...extra }))).status,
      400,
    );
    equal(test.repository.calls.length, 0);
  }
});

Deno.test("rejeita JSON malformado, conteúdo não JSON e corpo excessivo", async () => {
  const test = setup();
  equal(
    (await test.handler(
      new Request("https://example.test", {
        method: "POST",
        headers: {
          authorization: "Bearer valid.jwt",
          "content-type": "application/json",
        },
        body: "{",
      }),
    )).status,
    400,
  );
  equal(
    (await test.handler(
      request({ acao: "listar" }, { contentType: "text/plain" }),
    )).status,
    400,
  );
  equal(
    (await test.handler(
      request({ acao: "listar", extra: "a".repeat(260 * 1024) }),
    )).status,
    400,
  );
  equal(test.repository.calls.length, 0);
});

Deno.test("listar não grava e retorna DTO sem snapshot privado nem tokens de reserva", async () => {
  const test = setup();
  test.repository.currentTask!.reserva_token = TOKEN;
  test.repository.currentTask!.contexto.custo = "PRIVATE";
  test.repository.histories = [{
    id: ID,
    tarefa_id: ID,
    estado: "simulada",
    detalhe: {
      modo: "simulacao",
      motivo: "simulacao_concluida",
      token: "SECRET",
      contexto: { primeiro_nome: "Maria", custo: "PRIVATE" },
    },
    user_id: OWNER,
    snapshot: {
      ...test.repository.currentTask,
      fonte_hash: "PRIVATE",
      reserva_token: TOKEN,
    },
    criado_em: NOW,
  }];
  const response = await test.handler(request({ acao: "listar" }));
  equal(response.status, 200);
  const value = await response.json();
  equal(value.modo, "simulacao");
  equal(value.vendas[0].nomeCliente, "Maria Exemplo");
  equal(value.tarefas[0].reserva_token, undefined);
  equal(value.tarefas[0].user_id, undefined);
  equal(value.historico[0].detalhe.token, undefined);
  equal(value.historico[0].snapshot.reserva_token, undefined);
  equal(value.historico[0].snapshot.fonte_hash, undefined);
  equal(
    value.historico[0].snapshot.modelo_snapshot.texto,
    "Oi, {{primeiro_nome}}! Seu voo é {{quando}}.",
  );
  ok(!JSON.stringify(value).includes("PRIVATE"));
  ok(
    !test.repository.calls.some((c) =>
      ["save", "prepare", "reserve", "begin", "finish"].includes(c.name)
    ),
  );
  ok(test.repository.calls.every((c) => c.owner === OWNER));
});

Deno.test("listar sem preferências retorna defaults pausados sem criar dados; preparar inicializa CAS0", async () => {
  const test = setup();
  test.repository.currentPreferences = null;
  const initial = await (await test.handler(request({ acao: "listar" })))
    .json();
  equal(initial.preferencias.versao, 0);
  equal(initial.preferencias.config.pausado, true);
  equal(test.repository.currentPreferences, null);
  equal((await test.handler(request({ acao: "preparar" }))).status, 200);
  const saved = test.repository.calls.find((call) => call.name === "save")!;
  equal((saved.args[0] as JsonObject).versao, 0);
  equal(test.repository.currentPreferences!.config.pausado, true);
  ok(!test.repository.calls.some((call) => call.name === "reserve"));
});

Deno.test("sem fonte sincronizada listar é vazio e preparar não escreve defaults", async () => {
  const test = setup();
  test.repository.currentSource = null;
  test.repository.currentPreferences = null;
  const initial = await (await test.handler(request({ acao: "listar" })))
    .json();
  equal(initial.vendas.length, 0);
  equal(initial.pendencias[0].codigo, "dados_ausentes");
  equal((await test.handler(request({ acao: "preparar" }))).status, 409);
  ok(!test.repository.calls.some((call) => call.name === "save"));
});

Deno.test("preparar transmite fingerprint da leitura e conflito sem incremento de versão impede simulação", async () => {
  const valid = setup();
  equal((await valid.handler(request({ acao: "preparar" }))).status, 200);
  equal(
    valid.repository.calls.find((call) => call.name === "prepare")!.args[3],
    FINGERPRINT,
  );
  const stale = setup();
  stale.repository.prepareHook = () => {
    stale.repository.currentSource!.fingerprint = "f".repeat(32);
  };
  equal(
    (await stale.handler(request({ acao: "simular", id: ID }))).status,
    409,
  );
  equal(stale.repository.currentSource!.versao, 7);
  equal(stale.repository.currentTask!.estado, "pendente");
  ok(
    !stale.repository.calls.some((call) =>
      ["reserve", "begin", "finish"].includes(call.name)
    ),
  );
});

Deno.test("salvar valida config e preserva controle CAS; conflito não dispara outras ações", async () => {
  const test = setup();
  const valid = preferences();
  equal(
    (await test.handler(
      request({ acao: "salvar", preferencias: { ...valid, versao: 0 } }),
    )).status,
    409,
  );
  equal(
    (await test.handler(
      request({
        acao: "salvar",
        preferencias: {
          ...valid,
          config: { ...valid.config, fuso: "invalid" },
        },
      }),
    )).status,
    422,
  );
  equal(
    (await test.handler(request({ acao: "salvar", preferencias: valid })))
      .status,
    200,
  );
  equal(test.repository.currentPreferences!.versao, 2);
  ok(
    !test.repository.calls.some((call) =>
      ["prepare", "reserve", "begin", "finish"].includes(call.name)
    ),
  );
});

Deno.test("controlar aceita somente comando previsto e id válido, sempre com owner da sessão", async () => {
  const test = setup();
  equal(
    (await test.handler(
      request({ acao: "controlar", id: ID, comando: "reenviar" }),
    )).status,
    400,
  );
  equal(
    (await test.handler(
      request({ acao: "controlar", id: "foreign", comando: "pausar" }),
    )).status,
    400,
  );
  equal(
    (await test.handler(
      request({ acao: "controlar", id: ID, comando: "pausar" }),
    )).status,
    200,
  );
  const calls = test.repository.calls.filter((c) => c.name === "control");
  equal(calls.length, 1);
  equal(calls[0].owner, OWNER);
  deepEqual(calls[0].args, [ID, "pausar"]);
});

Deno.test("simular prepara, reserva, registra tentativa e conclui somente como simulada", async () => {
  const test = setup();
  const result = await test.handler(request({ acao: "simular", id: ID }));
  equal(result.status, 200);
  deepEqual(
    test.repository.calls.filter((call) =>
      ["prepare", "reserve", "begin", "finish"].includes(call.name)
    ).map((call) => call.name),
    ["prepare", "reserve", "begin", "finish"],
  );
  equal(test.repository.currentTask!.estado, "simulada");
  const detail = test.repository.histories[0].detalhe as JsonObject;
  equal(detail.modo, "simulacao");
  equal(detail.texto, "Oi, Maria! Seu voo é amanhã.");
  match(String(detail.id_simulado), /^sim-[a-f0-9]{64}$/);
  ok(!String(detail.id_simulado).includes(TOKEN));
  equal((await test.handler(request({ acao: "simular", id: ID }))).status, 409);
  equal(test.repository.calls.filter((c) => c.name === "finish").length, 1);
});

Deno.test("recompõe quando no instante depois de iniciar usando modelo congelado", async () => {
  let now = new Date("2026-11-14T14:59:00.000Z");
  const test = setup({ now: () => now });
  // O dia muda no fuso do voo durante uma janela de 15 min ainda válida.
  const sale = (test.repository.currentSource!.conteudo as {
    emissao_vendas: JsonObject[];
  }).emissao_vendas[0];
  sale.horaEmbarque = "23:59";
  (test.repository.currentPreferences!.viagens.sale as JsonObject).fusoIda =
    "Asia/Tokyo";
  test.repository.beginHook = () => {
    now = new Date("2026-11-14T15:01:00.000Z");
    (test.repository.currentPreferences!.modelos["24h"] as JsonObject).texto =
      "NOVO TEXTO NÃO DEVE APARECER";
  };
  equal((await test.handler(request({ acao: "simular", id: ID }))).status, 200);
  const detail = test.repository.histories[0].detalhe as JsonObject;
  equal(detail.texto, "Oi, Maria! Seu voo é hoje.");
  equal(detail.simulado_em, now.toISOString());
});

Deno.test("reserva bloqueada ou pausa/alteração entre reserva e tentativa não produz simulação", async () => {
  for (const phase of ["reserve", "begin"]) {
    const test = setup();
    test.repository.reserveBlocked = phase === "reserve";
    test.repository.beginBlocked = phase === "begin";
    equal(
      (await test.handler(request({ acao: "simular", id: ID }))).status,
      409,
    );
    equal(test.repository.histories.length, 0);
    ok(!test.repository.calls.some((call) => call.name === "finish"));
  }
});

Deno.test("falha de composição depois da tentativa grava falha local sem repetir ou expor erro", async () => {
  const test = setup({
    domain: {
      ...domain,
      contextoNoInstante() {
        throw new Error("SECRET");
      },
    },
  });
  const response = await test.handler(request({ acao: "simular", id: ID }));
  equal(response.status, 422);
  ok(!(await response.text()).includes("SECRET"));
  equal(test.repository.currentTask!.estado, "falha");
  equal(
    test.repository.calls.filter((call) => call.name === "finish").length,
    1,
  );
});

Deno.test("janela fecha exatamente no limite depois de iniciar: bloqueia simulação e deixa falha sem retry", async () => {
  let now = new Date(NOW);
  const test = setup({ now: () => now });
  test.repository.beginHook = () => {
    now = new Date("2026-11-14T13:15:00.000Z");
  };
  const response = await test.handler(request({ acao: "simular", id: ID }));
  equal(response.status, 409);
  equal((await response.json()).erro, "janela_encerrada");
  equal(test.repository.currentTask!.estado, "falha");
  equal(
    (test.repository.histories[0].detalhe as JsonObject).motivo,
    "janela_encerrada",
  );
});

Deno.test("silêncio começou depois de iniciar: bloqueia apesar de janela ainda válida", async () => {
  const make = (advance: boolean) => {
    let now = new Date("2026-11-14T23:59:00.000Z");
    const test = setup({ now: () => now });
    const sale = (test.repository.currentSource!.conteudo as {
      emissao_vendas: JsonObject[];
    }).emissao_vendas[0];
    sale.horaEmbarque = "20:59";
    if (advance) {
      test.repository.beginHook = () => {
        now = new Date("2026-11-15T00:00:00.000Z");
      };
    }
    return test;
  };
  const control = make(false);
  equal(
    (await control.handler(request({ acao: "simular", id: ID }))).status,
    200,
  );
  const afterSilence = make(true);
  equal(
    (await afterSilence.handler(request({ acao: "simular", id: ID }))).status,
    409,
  );
  equal(afterSilence.repository.currentTask!.estado, "falha");
});

Deno.test("falha de persistência posterior deixa tentativa e exige reconciliação sem retry", async () => {
  const test = setup();
  test.repository.finishThrows = true;
  const response = await test.handler(request({ acao: "simular", id: ID }));
  equal(response.status, 503);
  const result = await response.json();
  equal(result.erro, "reconciliacao_necessaria");
  ok(!JSON.stringify(result).includes("SECRET"));
  equal(test.repository.currentTask!.estado, "tentativa");
  equal((await test.handler(request({ acao: "simular", id: ID }))).status, 409);
  equal(
    test.repository.calls.filter((call) => call.name === "finish").length,
    1,
  );
});

Deno.test("limite do texto renderizado coincide com SQL: 4000 aceita, 4001 registra falha local", async () => {
  for (const length of [4000, 4001]) {
    const test = setup({
      domain: { ...domain, renderTemplate: () => "x".repeat(length) },
    });
    const response = await test.handler(request({ acao: "simular", id: ID }));
    equal(response.status, length === 4000 ? 200 : 422);
    equal(
      test.repository.currentTask!.estado,
      length === 4000 ? "simulada" : "falha",
    );
    equal(test.repository.calls.filter((c) => c.name === "finish").length, 1);
  }
});

Deno.test("ID sintético é determinístico para a mesma tarefa e reserva", async () => {
  const first = setup(), second = setup();
  await first.handler(request({ acao: "simular", id: ID }));
  await second.handler(request({ acao: "simular", id: ID }));
  equal(
    (first.repository.histories[0].detalhe as JsonObject).id_simulado,
    (second.repository.histories[0].detalhe as JsonObject).id_simulado,
  );
});
