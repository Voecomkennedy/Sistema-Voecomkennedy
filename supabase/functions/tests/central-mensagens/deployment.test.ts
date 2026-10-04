import { deepEqual, equal } from "node:assert/strict";
import deployedConfig from "../../central-mensagens/deployment-config.json" with {
  type: "json",
};
import {
  AUTHORIZED_PROJECT_REF,
  resolveDeployment,
} from "../../_shared/central-mensagens/deployment.ts";
import { createHandler } from "../../_shared/central-mensagens/handler.ts";
import { domain } from "../../_shared/central-mensagens/domain.ts";
import { FakeRepository, request } from "./fixtures.ts";

const url = `https://${AUTHORIZED_PROJECT_REF}.supabase.co`;
const origin = "https://sistema.voecomkennedy.tur.br";
const config = {
  projectRef: AUTHORIZED_PROJECT_REF,
  mode: "simulacao",
  allowedOrigins: [origin],
};

Deno.test("configuração versionada ativa somente simulação no projeto e origem aprovados", () => {
  equal(deployedConfig.projectRef, AUTHORIZED_PROJECT_REF);
  deepEqual(deployedConfig.allowedOrigins, [origin]);
  equal(["simulacao", "desabilitada"].includes(deployedConfig.mode), true);
  equal(
    resolveDeployment(deployedConfig, { supabaseUrl: url }).enabled,
    deployedConfig.mode === "simulacao",
  );
  deepEqual(resolveDeployment(config, { supabaseUrl: url }), {
    enabled: true,
    allowedOrigins: [origin],
    reason: "simulacao",
  });
  equal(resolveDeployment(config, { supabaseUrl: url + "/" }).enabled, true);
});

Deno.test("projeto diferente, URL ausente, credenciais, paths e host enganoso ficam fechados", () => {
  for (
    const supabaseUrl of [
      undefined,
      "",
      "http://qryobmqrkzddcvlvgfrp.supabase.co",
      "https://other.supabase.co",
      url + ".evil.test",
      url + ":443",
      url + "/rest/v1",
      url + "?ref=expected",
      url + "#ignored",
      "https://user:password@qryobmqrkzddcvlvgfrp.supabase.co",
      url.toUpperCase(),
    ]
  ) {
    const result = resolveDeployment(config, { supabaseUrl });
    equal(result.enabled, false, String(supabaseUrl));
    equal(result.reason, "projeto_invalido");
  }
  equal(
    resolveDeployment({ ...config, projectRef: "lvmkyfycxylhdhqlpuyu" }, {
      supabaseUrl: "https://lvmkyfycxylhdhqlpuyu.supabase.co",
    }).enabled,
    false,
  );
});

Deno.test("configuração ausente, incompleta, extra e modo real falham fechadas", () => {
  for (
    const value of [
      null,
      undefined,
      [],
      {},
      { ...config, projectRef: "" },
      { ...config, mode: "real" },
      { ...config, mode: null },
      { ...config, secretKey: "forbidden" },
      { ...config, allowedOrigins: [] },
      { ...config, allowedOrigins: "*" },
    ]
  ) {
    equal(resolveDeployment(value, { supabaseUrl: url }).enabled, false);
  }
});

Deno.test("ENV ausente permite JSON autorizado; qualquer valor diferente de simulacao fecha", () => {
  equal(
    resolveDeployment(config, { supabaseUrl: url, modeOverride: "simulacao" })
      .enabled,
    true,
  );
  for (
    const modeOverride of [
      "",
      "desabilitada",
      "real",
      "true",
      "SIMULACAO",
      " simulacao ",
    ]
  ) {
    equal(
      resolveDeployment(config, { supabaseUrl: url, modeOverride }).enabled,
      false,
    );
  }
});

Deno.test("republicar JSON desabilitada reverte mesmo com ENV simulacao", () => {
  for (const modeOverride of [undefined, "simulacao", "", "desabilitada"]) {
    deepEqual(
      resolveDeployment({ ...config, mode: "desabilitada" }, {
        supabaseUrl: url,
        modeOverride,
      }),
      { enabled: false, allowedOrigins: [origin], reason: "desabilitada" },
    );
  }
});

Deno.test("origens devem ser HTTPS canônicas e únicas por entrada", () => {
  for (
    const candidate of [
      "*",
      "null",
      origin + "/",
      origin + "/mensagens.html",
      origin + "?x=1",
      "http://localhost:8080",
      "https://u:p@example.test",
      origin + ",https://other.test",
      " " + origin,
    ]
  ) {
    equal(
      resolveDeployment({ ...config, allowedOrigins: [candidate] }, {
        supabaseUrl: url,
      }).enabled,
      false,
      candidate,
    );
  }
});

Deno.test("ENV de origem somente restringe a lista pública e nunca a amplia", () => {
  equal(
    resolveDeployment(config, { supabaseUrl: url, originsOverride: origin })
      .enabled,
    true,
  );
  const two = {
    ...config,
    allowedOrigins: [origin, "https://second.example.test"],
  };
  deepEqual(
    resolveDeployment(two, { supabaseUrl: url, originsOverride: origin })
      .allowedOrigins,
    [origin],
  );
  for (
    const originsOverride of [
      "",
      "*",
      "https://evil.test",
      origin + ",https://evil.test",
      origin + "/",
    ]
  ) {
    equal(
      resolveDeployment(config, { supabaseUrl: url, originsOverride }).enabled,
      false,
    );
  }
});

Deno.test("JSON e listas de origem não são alterados pelo resolver", () => {
  const copy = structuredClone(config);
  const result = resolveDeployment(copy, { supabaseUrl: url });
  result.allowedOrigins.push("https://evil.test");
  deepEqual(copy, config);
  deepEqual(resolveDeployment(copy, { supabaseUrl: url }).allowedOrigins, [
    origin,
  ]);
});

Deno.test("gate fechado impede autenticação, leituras e escritas antes de qualquer ação", async () => {
  const repository = new FakeRepository();
  let authentications = 0;
  const deployment = resolveDeployment({ ...config, mode: "desabilitada" }, {
    supabaseUrl: url,
    modeOverride: "simulacao",
  });
  const handler = createHandler({
    ...deployment,
    repository,
    domain,
    authenticate: () => {
      authentications++;
      return Promise.resolve(null);
    },
  });
  const input = request({ acao: "preparar" });
  input.headers.set("origin", origin);
  const result = await handler(input);
  equal(result.status, 503);
  equal(result.headers.get("access-control-allow-origin"), origin);
  equal(authentications, 0);
  equal(repository.calls.length, 0);
});
