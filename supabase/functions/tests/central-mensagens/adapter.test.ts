import { deepEqual, equal, ok, rejects, throws } from "node:assert/strict";
import { createSupabaseAdapter } from "../../_shared/central-mensagens/adapter.ts";
import { parseOrigins } from "../../_shared/central-mensagens/cors.ts";
import { PublicError } from "../../_shared/central-mensagens/types.ts";
import {
  FINGERPRINT,
  ID,
  OTHER,
  OWNER,
  preferences,
  source,
  task,
  TOKEN,
} from "./fixtures.ts";

function setup(result: unknown = [], status = 200) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const adapter = createSupabaseAdapter({
    url: "https://database.example.test",
    serviceKey: "server-secret",
    authKey: "public-key",
    fetch: (input, init = {}) => {
      calls.push({ url: new URL(String(input)), init });
      return Promise.resolve(
        new Response(JSON.stringify(result), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
    },
  });
  return { ...adapter, calls };
}

Deno.test("Auth usa JWT no serviço oficial /auth/v1/user e valida identidade retornada", async () => {
  const test = setup({ id: OWNER });
  equal(await test.authenticate("user.jwt"), OWNER);
  equal(test.calls[0].url.pathname, "/auth/v1/user");
  const headers = test.calls[0].init.headers as Record<string, string>;
  equal(headers.Authorization, "Bearer user.jwt");
  equal(headers.apikey, "public-key");
  equal(test.calls[0].init.redirect, "error");
  equal(
    await setup({ id: OWNER, is_anonymous: true }).authenticate("user.jwt"),
    null,
  );
  equal(await setup({ id: "invalid" }).authenticate("user.jwt"), null);
  equal(await setup({ secret: "SECRET" }, 401).authenticate("invalid"), null);
});

Deno.test("consultas owner scoped usam projeções limitadas e nunca entregam chave ao navegador", async () => {
  const queries = setup([]);
  await queries.repository.preferences(OWNER);
  await queries.repository.tasks(OWNER);
  await queries.repository.history(OWNER);
  for (const { url, init } of queries.calls) {
    equal(url.origin, "https://database.example.test");
    equal(url.searchParams.get("user_id"), `eq.${OWNER}`);
    ok(!url.searchParams.get("select")!.includes("*"));
    equal(
      (init.headers as Record<string, string>).Authorization,
      "Bearer server-secret",
    );
    ok(!url.href.includes("server-secret"));
  }
  equal(queries.calls[1].url.searchParams.get("limit"), "500");
  equal(queries.calls[2].url.searchParams.get("limit"), "200");
  const snapshot = setup(source());
  deepEqual(await snapshot.repository.source(OWNER), source());
  equal(snapshot.calls[0].url.pathname, "/rest/v1/rpc/mensagens_fonte");
  equal(snapshot.calls[0].init.method, "POST");
  deepEqual(JSON.parse(String(snapshot.calls[0].init.body)), {
    p_user_id: OWNER,
  });
  equal(await setup(null).repository.source(OWNER), null);
  equal(
    (await setup([preferences()]).repository.preferences(OWNER))?.versao,
    1,
  );
});

Deno.test("cada RPC recebe owner autenticado e contrato de CAS/reserva esperado", async () => {
  const saved = setup(preferences());
  await saved.repository.save(OWNER, preferences());
  deepEqual(JSON.parse(String(saved.calls[0].init.body)), {
    p_user_id: OWNER,
    p_versao: 1,
    p_config: preferences().config,
    p_modelos: preferences().modelos,
    p_viagens: preferences().viagens,
  });
  const mutations = setup(task());
  await mutations.repository.prepare(OWNER, 7, 1, [], FINGERPRINT);
  await mutations.repository.control(OWNER, ID, "pausar");
  await mutations.repository.reserve(OWNER, ID);
  await mutations.repository.begin(OWNER, ID, TOKEN);
  await mutations.repository.finish(OWNER, ID, TOKEN, "simulada", {
    modo: "simulacao",
  });
  for (const { url, init } of mutations.calls) {
    ok(url.pathname.startsWith("/rest/v1/rpc/mensagens_"));
    equal(init.method, "POST");
    equal(JSON.parse(String(init.body)).p_user_id, OWNER);
  }
  equal(JSON.parse(String(mutations.calls[3].init.body)).p_token, TOKEN);
  equal(
    JSON.parse(String(mutations.calls[0].init.body)).p_fonte_hash,
    FINGERPRINT,
  );
  equal(JSON.parse(String(mutations.calls[4].init.body)).p_estado, "simulada");
  equal(await setup(null).repository.reserve(OTHER, ID), null);
});

Deno.test("SQLSTATE previsto vira erro seguro e falhas desconhecidas ocultam todo corpo upstream", async () => {
  for (
    const [code, status] of [["PT409", 409], ["PT422", 422], ["PT404", 404], [
      "OTHER",
      503,
    ]] as const
  ) {
    const test = setup({
      code,
      message: "SECRET",
      detail: "PRIVATE",
      hint: "token=SECRET",
    }, 400);
    await rejects(
      () => test.repository.control(OWNER, ID, "pausar"),
      (error: unknown) => {
        ok(error instanceof PublicError);
        equal(error.status, status);
        ok(!error.message.includes("SECRET"));
        return true;
      },
    );
    equal(test.calls.length, 1);
  }
});

Deno.test("timeout de mutação não é repetido e erro externo não vaza", async () => {
  let count = 0;
  const test = createSupabaseAdapter({
    url: "https://database.example.test",
    serviceKey: "secret",
    fetch: () => {
      count++;
      throw new Error("SECRET");
    },
  });
  await rejects(
    () => test.repository.finish(OWNER, ID, TOKEN, "simulada", {}),
    (error: unknown) =>
      error instanceof PublicError && error.status === 503 &&
      !error.message.includes("SECRET"),
  );
  equal(count, 1);
});

Deno.test("falha fechada para JSON inválido, registros duplicados e formas não esperadas", async () => {
  await rejects(
    () => setup([source(), source()]).repository.source(OWNER),
    PublicError,
  );
  await rejects(
    () =>
      setup({ versao: "7", conteudo: {}, fingerprint: FINGERPRINT }).repository
        .source(OWNER),
    PublicError,
  );
  for (const fingerprint of [undefined, null, "", "fake", "0".repeat(33)]) {
    await rejects(
      () => setup({ ...source(), fingerprint }).repository.source(OWNER),
      PublicError,
    );
  }
  const invalidHash = setup([]);
  await rejects(
    () => invalidHash.repository.prepare(OWNER, 7, 1, [], "invalid"),
    PublicError,
  );
  equal(invalidHash.calls.length, 0);
  await rejects(
    () => setup({ not: "array" }).repository.tasks(OWNER),
    PublicError,
  );
  await rejects(
    () =>
      setup({ id: ID, modo: "real", estado: "tentativa" }).repository.begin(
        OWNER,
        ID,
        TOKEN,
      ),
    PublicError,
  );
  const badJSON = createSupabaseAdapter({
    url: "https://database.example.test",
    serviceKey: "secret",
    fetch: () => Promise.resolve(new Response("not json", { status: 200 })),
  });
  await rejects(() => badJSON.repository.source(OWNER), PublicError);
});

Deno.test("config não aceita URL secreta, insegura, path adicional ou origem wildcard", () => {
  for (
    const url of [
      "http://outside.test",
      "https://u:p@database.test",
      "https://database.test?key=secret",
      "https://database.test/extra",
    ]
  ) throws(() => createSupabaseAdapter({ url, serviceKey: "secret" }));
  for (
    const value of [
      "*",
      "https://app.test/",
      "https://app.test/extra",
      "null",
      "http://outside.test",
    ]
  ) throws(() => parseOrigins(value));
  deepEqual(
    parseOrigins("https://app.test,http://localhost:9000,https://app.test"),
    ["https://app.test", "http://localhost:9000"],
  );
  deepEqual(parseOrigins(""), []);
});
