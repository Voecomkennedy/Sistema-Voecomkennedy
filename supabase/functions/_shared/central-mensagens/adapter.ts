import { object, PublicError, uuid } from "./types.ts";
import type { Preferences, Repository, Source, Task } from "./types.ts";

type Fetch = typeof fetch;
interface Options {
  url: string;
  serviceKey: string;
  /** Pode ser publishable/anon. O service key permanece exclusivamente no servidor. */
  authKey?: string;
  fetch?: Fetch;
}

const unavailable = () =>
  new PublicError(
    503,
    "indisponivel",
    "Central indisponível. Tente novamente mais tarde.",
  );

/** Sem SDK, retry, URL do cliente ou transporte de mensagens. Somente Auth/REST. */
export function createSupabaseAdapter(options: Options): {
  authenticate(bearer: string): Promise<string | null>;
  repository: Repository;
} {
  const base = new URL(options.url);
  if (
    base.username || base.password || base.search || base.hash ||
    (base.pathname !== "/" && base.pathname !== "") ||
    (base.protocol !== "https:" &&
      !(base.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname))) ||
    !options.serviceKey
  ) throw unavailable();
  const request = options.fetch ?? fetch;

  async function call(
    path: string,
    method: string,
    body?: unknown,
    bearer?: string,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await request(new URL(path, base), {
        method,
        headers: {
          apikey: bearer
            ? (options.authKey || options.serviceKey)
            : options.serviceKey,
          Authorization: `Bearer ${bearer ?? options.serviceKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw unavailable();
    }
    if (bearer && (response.status === 401 || response.status === 403)) {
      return null;
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw unavailable();
    }
    if (!response.ok) {
      const code = object(data)?.code;
      if (code === "PT409") {
        throw new PublicError(
          409,
          "conflito",
          "Os dados mudaram. Atualize antes de tentar novamente.",
        );
      }
      if (code === "PT404") {
        throw new PublicError(
          404,
          "nao_encontrado",
          "Registro não encontrado nesta conta.",
        );
      }
      if (code === "PT422") {
        throw new PublicError(
          422,
          "dados_invalidos",
          "Dados inválidos para esta operação.",
        );
      }
      // Nunca propaga mensagem, URL, detalhe ou cabeçalhos retornados pelo upstream.
      throw unavailable();
    }
    return data;
  }

  async function rows(
    table: string,
    owner: string,
    select: string,
    extras: Record<string, string> = {},
  ) {
    if (!uuid(owner)) throw unavailable();
    const query = new URLSearchParams({
      user_id: `eq.${owner}`,
      select,
      ...extras,
    });
    const value = await call(`/rest/v1/${table}?${query}`, "GET");
    if (!Array.isArray(value) || value.some((row) => !object(row))) {
      throw unavailable();
    }
    return value as Record<string, unknown>[];
  }
  async function rpc(
    name: string,
    owner: string,
    args: Record<string, unknown>,
  ) {
    if (!uuid(owner)) throw unavailable();
    return await call(`/rest/v1/rpc/${name}`, "POST", {
      p_user_id: owner,
      ...args,
    });
  }
  function task(value: unknown): Task | null {
    if (value === null) return null;
    const row = object(value);
    if (
      !row || !uuid(row.id) || row.modo !== "simulacao" ||
      typeof row.estado !== "string"
    ) throw unavailable();
    return row as Task;
  }
  function preferences(value: unknown): Preferences {
    const row = object(value);
    if (
      !row || !Number.isSafeInteger(row.versao) || Number(row.versao) < 1 ||
      !object(row.config) || !object(row.modelos) || !object(row.viagens)
    ) throw unavailable();
    return {
      versao: Number(row.versao),
      config: row.config as Record<string, unknown>,
      modelos: row.modelos as Record<string, unknown>,
      viagens: row.viagens as Record<string, unknown>,
    };
  }

  const repository: Repository = {
    async source(owner) {
      // Conteúdo e fingerprint vêm da mesma leitura. Não reproduz jsonb::text no JS.
      const value = await rpc("mensagens_fonte", owner, {});
      if (value === null) return null;
      const result = object(value);
      if (
        !result || !Number.isSafeInteger(result.versao) ||
        Number(result.versao) < 0 || !Object.hasOwn(result, "conteudo") ||
        typeof result.fingerprint !== "string" ||
        !/^[a-f0-9]{32}$/.test(result.fingerprint)
      ) throw unavailable();
      return {
        versao: Number(result.versao),
        conteudo: result.conteudo,
        fingerprint: result.fingerprint,
      } satisfies Source;
    },
    async preferences(owner) {
      const result = await rows(
        "mensagens_preferencias",
        owner,
        "versao,config,modelos,viagens",
        { limit: "2" },
      );
      if (result.length > 1) throw unavailable();
      return result.length ? preferences(result[0]) : null;
    },
    async tasks(owner) {
      const result = await rows(
        "mensagens_tarefas",
        owner,
        "id,venda_id,tipo,modo,estado,agendado_em,expira_em,embarque_em,destinatario,texto,contexto,modelo_snapshot,regra_snapshot,fuso_voo,fuso_operador,origem_versao,preferencias_versao",
        { order: "agendado_em.desc,id.desc", limit: "500" },
      );
      return result.map((row) => task(row)!);
    },
    async history(owner) {
      return await rows(
        "mensagens_historico",
        owner,
        "id,tarefa_id,estado,detalhe,snapshot,criado_em",
        { order: "criado_em.desc,id.desc", limit: "200" },
      );
    },
    async save(owner, value) {
      return preferences(
        await rpc("mensagens_salvar_preferencias", owner, {
          p_versao: value.versao,
          p_config: value.config,
          p_modelos: value.modelos,
          p_viagens: value.viagens,
        }),
      );
    },
    async prepare(
      owner,
      sourceVersion,
      preferencesVersion,
      tasks,
      sourceFingerprint,
    ) {
      if (!/^[a-f0-9]{32}$/.test(sourceFingerprint)) throw unavailable();
      await rpc("mensagens_preparar", owner, {
        p_origem_versao: sourceVersion,
        p_preferencias_versao: preferencesVersion,
        p_itens: tasks,
        p_fonte_hash: sourceFingerprint,
      });
    },
    async control(owner, id, command) {
      await rpc("mensagens_controlar", owner, { p_id: id, p_comando: command });
    },
    async reserve(owner, id) {
      return task(await rpc("mensagens_reservar", owner, { p_id: id }));
    },
    async begin(owner, id, token) {
      return task(
        await rpc("mensagens_iniciar", owner, { p_id: id, p_token: token }),
      );
    },
    async finish(owner, id, token, state, detail) {
      return task(
        await rpc("mensagens_concluir", owner, {
          p_id: id,
          p_token: token,
          p_estado: state,
          p_detalhe: detail,
        }),
      );
    },
  };
  return {
    async authenticate(bearer) {
      const user = object(
        await call("/auth/v1/user", "GET", undefined, bearer),
      );
      return user && uuid(user.id) && user.is_anonymous !== true
        ? user.id
        : null;
    },
    repository,
  };
}
