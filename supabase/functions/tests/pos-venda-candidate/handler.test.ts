import assert from "node:assert/strict";
import { criarHandlerCandidato } from "../../_shared/pos-venda-candidate/handler.ts";
import { config, snapshot } from "./fixtures.ts";

function fixture(ativo = true) {
  const state = { leituras: 0, execucoes: 0 };
  const handler = criarHandlerCandidato({
    agora: () => new Date("2026-10-04T13:00:00Z"),
    configuracao: () => Promise.resolve({ ...config, ativo }),
    snapshots: () => {
      state.leituras++;
      return Promise.resolve([snapshot()]);
    },
    executar: () => {
      state.execucoes++;
      return Promise.resolve({ executado: true });
    },
  });
  const req = (query = "", method = "GET", key = config.chave_cron) =>
    new Request("https://local.invalid/pos-venda" + query, {
      method,
      headers: { "x-cron-key": key },
    });
  return { state, handler, req };
}
Deno.test("autenticação precede leitura de clientes e qualquer execução", async () => {
  const f = fixture();
  for (
    const [query, method] of [["?previa=1", "GET"], ["?dry=1", "GET"], [
      "",
      "POST",
    ]]
  ) {
    const r = await f.handler(f.req(query, method, "errada"));
    assert.equal(r.status, 401);
  }
  assert.equal(f.state.leituras, 0);
  assert.equal(f.state.execucoes, 0);
});
Deno.test("GET previa e dry nunca enviam, mesmo ativo ou pausado", async () => {
  for (const ativo of [true, false]) {
    const f = fixture(ativo);
    for (const query of ["?previa=1", "?dry=1"]) {
      const r = await f.handler(f.req(query));
      assert.equal(r.status, 200);
      const body = await r.json();
      assert.equal(body.somente_leitura, true);
      assert.equal(body.ativo, ativo);
      assert.equal(JSON.stringify(body).includes(config.chave_cron), false);
    }
    assert.equal(f.state.execucoes, 0);
  }
});
Deno.test("POST pausado não lê clientes nem chama executor", async () => {
  const f = fixture(false);
  assert.equal((await f.handler(f.req("", "POST"))).status, 200);
  assert.deepEqual(f.state, { leituras: 0, execucoes: 0 });
});
Deno.test("GET sem prévia e métodos estranhos nunca disparam envio", async () => {
  const f = fixture();
  assert.equal((await f.handler(f.req())).status, 405);
  assert.equal((await f.handler(f.req("", "PUT"))).status, 405);
  assert.equal(f.state.execucoes, 0);
});
Deno.test("simular relógio é exclusivo de prévia, nunca POST", async () => {
  const f = fixture();
  assert.equal(
    (await f.handler(f.req("?agora=2026-10-04T13:00:00Z", "POST"))).status,
    400,
  );
  assert.equal((await f.handler(f.req("?previa=1", "POST"))).status, 400);
  assert.equal((await f.handler(f.req("?dry=1", "POST"))).status, 400);
  assert.equal((await f.handler(f.req("?dry=1&agora=lixo"))).status, 400);
  assert.equal(
    (await f.handler(f.req("?dry=1&agora=2026-02-31T13:00:00Z"))).status,
    400,
  );
  assert.equal(
    (await f.handler(f.req("?dry=1&agora=2026-10-04T13:00:00"))).status,
    400,
  );
  assert.equal(
    (await f.handler(f.req("?dry=1&agora=2026-10-04T13:00:00Z"))).status,
    200,
  );
  assert.equal(f.state.execucoes, 0);
});
Deno.test("candidato sem executor transacional não se apresenta como pronto", async () => {
  const handler = criarHandlerCandidato({
    agora: () => new Date(),
    configuracao: () => Promise.resolve(config),
    snapshots: () => {
      throw new Error("não deve ler");
    },
  });
  const r = await handler(
    new Request("https://local.invalid", {
      method: "POST",
      headers: { "x-cron-key": config.chave_cron },
    }),
  );
  assert.equal(r.status, 503);
});
Deno.test("falha de configuração é fechada e não expõe detalhes sensíveis", async () => {
  const handler = criarHandlerCandidato({
    agora: () => new Date(),
    configuracao: () => {
      throw new Error("TOKEN-SECRETO");
    },
    snapshots: () => Promise.resolve([]),
  });
  const r = await handler(new Request("https://local.invalid?dry=1"));
  assert.equal(r.status, 503);
  assert.equal((await r.text()).includes("TOKEN-SECRETO"), false);
});
