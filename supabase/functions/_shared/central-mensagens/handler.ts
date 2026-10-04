import { object, PublicError, uuid } from "./types.ts";
import type {
  Domain,
  JsonObject,
  Ports,
  Preferences,
  Source,
  Task,
} from "./types.ts";
import { corsHeaders } from "./cors.ts";

const TASK_FIELDS = [
  "id",
  "venda_id",
  "tipo",
  "modo",
  "estado",
  "agendado_em",
  "expira_em",
  "embarque_em",
  "destinatario",
  "texto",
  "contexto",
  "modelo_snapshot",
  "regra_snapshot",
  "fuso_voo",
  "fuso_operador",
  "origem_versao",
  "preferencias_versao",
];
const CONTEXT_FIELDS = [
  "primeiro_nome",
  "origem",
  "destino",
  "data_voo",
  "hora_voo",
  "quando",
];
const MAX_BODY = 256 * 1024;
const bad = () =>
  new PublicError(
    400,
    "requisicao_invalida",
    "Requisição inválida para a Central de Mensagens.",
  );
const blocked = () =>
  new PublicError(
    409,
    "simulacao_bloqueada",
    "Esta tarefa não está disponível para simulação. Atualize a agenda e confira as regras.",
  );

function pick(value: JsonObject, keys: string[]): JsonObject {
  return Object.fromEntries(
    keys.filter((key) => Object.hasOwn(value, key)).map((
      key,
    ) => [key, value[key]]),
  );
}
function exact(value: JsonObject, keys: string[]) {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw bad();
}
async function body(request: Request): Promise<JsonObject> {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  ) throw bad();
  if (
    Number(request.headers.get("content-length") || 0) > MAX_BODY ||
    !request.body
  ) throw bad();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_BODY) {
        await reader.cancel();
        throw bad();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const result = object(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
    if (!result) throw bad();
    return result;
  } catch {
    throw bad();
  }
}

export function defaultPreferences(domain: Domain): Preferences {
  return {
    versao: 0,
    ...domain.validatePreferences(
      structuredClone({
        config: domain.DEFAULT_CONFIG,
        modelos: domain.DEFAULT_MODELOS,
        viagens: {},
      }),
    ),
  };
}

/** Não retorna telefone de cadastro, custos, documentos, anexos nem o snapshot completo. */
export function salesDTO(source: Source | null): JsonObject[] {
  const data = object(source?.conteudo);
  const sales = Array.isArray(data?.emissao_vendas)
    ? data.emissao_vendas.map(object).filter((v): v is JsonObject => !!v)
    : [];
  const people = Array.isArray(data?.emissao_pessoas)
    ? data.emissao_pessoas.map(object).filter((v): v is JsonObject => !!v)
    : [];
  return sales.filter((sale) =>
    typeof sale.id === "string" && sale.statusVenda === "emitida" &&
    !sale.excluidaEm && sales.filter((other) =>
        other.id === sale.id
      ).length === 1
  ).map((sale) => {
    const matches = people.filter((person) => person.id === sale.clienteId);
    const name = matches.length === 1 && typeof matches[0].nome === "string"
      ? matches[0].nome
      : "Cliente não identificado";
    const fields = pick(sale, [
      "id",
      "origem",
      "destino",
      "dataEmbarque",
      "horaEmbarque",
      "dataVolta",
      "horaVolta",
    ]);
    // Campos inesperados/malformados também não são serializados através do DTO.
    for (const key of Object.keys(fields)) {
      if (typeof fields[key] !== "string") fields[key] = "";
    }
    return { ...fields, nomeCliente: name };
  });
}

function publicTask(task: Task) {
  return {
    ...pick(task, TASK_FIELDS),
    contexto: pick(object(task.contexto) ?? {}, CONTEXT_FIELDS),
    modelo_snapshot: pick(object(task.modelo_snapshot) ?? {}, ["texto"]),
    regra_snapshot: pick(object(task.regra_snapshot) ?? {}, [
      "antecedenciaMinutos",
      "validadeMinutos",
    ]),
  };
}
function publicHistory(row: JsonObject) {
  const detail = object(row.detalhe) ?? {};
  const safeDetail = pick(detail, [
    "modo",
    "motivo",
    "id_simulado",
    "texto",
    "simulado_em",
    "comando",
  ]);
  if (object(detail.contexto)) {
    safeDetail.contexto = pick(detail.contexto as JsonObject, CONTEXT_FIELDS);
  }
  return {
    ...pick(row, ["id", "tarefa_id", "estado", "criado_em"]),
    detalhe: safeDetail,
    ...(object(row.snapshot)
      ? { snapshot: publicTask(row.snapshot as Task) }
      : {}),
  };
}

/** Todas as ações usam as mesmas portas; a função não conhece Z-API nem URLs de envio. */
export function createHandler(ports: Ports) {
  const repo = ports.repository;
  const now = ports.now ?? (() => new Date());
  async function state(owner: string) {
    const [source, saved] = await Promise.all([
      repo.source(owner),
      repo.preferences(owner),
    ]);
    return { source, preferences: saved ?? defaultPreferences(ports.domain) };
  }
  function plan(owner: string, source: Source, preferences: Preferences) {
    return ports.domain.planejar({
      userId: owner,
      conteudo: source.conteudo,
      origemVersao: source.versao,
      preferencias: preferences,
      agora: now(),
    });
  }
  async function list(owner: string) {
    const [{ source, preferences }, tasks, history] = await Promise.all([
      state(owner),
      repo.tasks(owner),
      repo.history(owner),
    ]);
    const pendencias = source ? plan(owner, source, preferences).pendencias : [{
      venda_id: "",
      codigo: "dados_ausentes",
      mensagem: "Nenhum cadastro sincronizado nesta conta.",
    }];
    return {
      modo: "simulacao",
      preferencias: preferences,
      tarefas: tasks.map(publicTask),
      historico: history.map(publicHistory),
      vendas: salesDTO(source),
      pendencias,
      limites: { tarefas: 500, historico: 200 },
    };
  }
  async function prepare(owner: string) {
    const current = await state(owner);
    if (!current.source) {
      throw new PublicError(
        409,
        "dados_ausentes",
        "Sincronize os cadastros desta conta antes de preparar a agenda.",
      );
    }
    // Primeira preparação inicializa somente defaults pausados. CAS impede corrida silenciosa.
    if (current.preferences.versao === 0) {
      current.preferences = await repo.save(owner, current.preferences);
    }
    const planned = plan(owner, current.source, current.preferences);
    await repo.prepare(
      owner,
      current.source.versao,
      current.preferences.versao,
      planned.tarefas,
      current.source.fingerprint,
    );
    return current.preferences;
  }
  async function simulate(owner: string, id: string) {
    const preparedPreferences = await prepare(owner);
    const reserved = await repo.reserve(owner, id);
    if (
      !reserved || reserved.id !== id || reserved.modo !== "simulacao" ||
      reserved.estado !== "reservada" || !uuid(reserved.reserva_token)
    ) throw blocked();
    const token = reserved.reserva_token;
    // A RPC repete pausa, janela, silêncio, fonte e preferências e grava tentativa atomicamente.
    const started = await repo.begin(owner, id, token);
    if (
      !started || started.id !== id || started.modo !== "simulacao" ||
      started.estado !== "tentativa"
    ) throw blocked();
    let detail: JsonObject;
    let failureReason = "composicao_invalida";
    try {
      const instant = now();
      if (!Number.isFinite(instant.getTime())) throw new Error("invalid_clock");
      const due = Date.parse(String(started.agendado_em));
      const expiry = Date.parse(String(started.expira_em));
      const anchor = Date.parse(String(started.embarque_em));
      if (
        !Number.isFinite(due) || !Number.isFinite(expiry) ||
        !Number.isFinite(anchor) || instant.getTime() < due ||
        instant.getTime() >= expiry ||
        (started.tipo !== "volta" && instant.getTime() >= anchor) ||
        ports.domain.emSilencio(instant, preparedPreferences.config)
      ) {
        failureReason = "janela_encerrada";
        throw new Error("window_closed");
      }
      const context = pick(
        ports.domain.contextoNoInstante(started, instant),
        CONTEXT_FIELDS,
      );
      const template = object(started.modelo_snapshot)?.texto;
      if (typeof template !== "string") throw new Error("missing_snapshot");
      const text = ports.domain.renderTemplate(template, context);
      if (typeof text !== "string" || !text.trim() || text.length > 4000) {
        throw new Error("invalid_text");
      }
      // Identificador sintético determinístico; não é recibo nem ID de um fornecedor.
      const hash = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${id}:${token}`),
      );
      const syntheticId = "sim-" +
        Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0"))
          .join("");
      detail = {
        modo: "simulacao",
        motivo: "simulacao_concluida",
        id_simulado: syntheticId,
        texto: text,
        contexto: context,
        simulado_em: instant.toISOString(),
      };
    } catch {
      // Nenhum efeito externo ocorreu; erro de composição é falha local, sem retry automático.
      await repo.finish(owner, id, token, "falha", {
        modo: "simulacao",
        motivo: failureReason,
      });
      if (failureReason === "janela_encerrada") {
        throw new PublicError(
          409,
          failureReason,
          "A janela terminou durante a tentativa de simulação. A tarefa foi bloqueada para revisão.",
        );
      }
      throw new PublicError(
        422,
        "composicao_invalida",
        "Não foi possível compor esta simulação. Revise os dados e o modelo.",
      );
    }
    // Falha de persistência conserva tentativa no banco. Não repetir reserve/begin/finish.
    let completed: Task | null;
    try {
      completed = await repo.finish(owner, id, token, "simulada", detail);
    } catch {
      throw new PublicError(
        503,
        "reconciliacao_necessaria",
        "A simulação precisa de reconciliação no histórico; ela não será repetida automaticamente.",
      );
    }
    if (!completed || completed.id !== id || completed.estado !== "simulada") {
      throw new PublicError(
        503,
        "reconciliacao_necessaria",
        "A simulação precisa de reconciliação no histórico; ela não será repetida automaticamente.",
      );
    }
  }

  return async (request: Request): Promise<Response> => {
    let cors: Record<string, string>;
    try {
      cors = corsHeaders(request, ports.allowedOrigins ?? []);
    } catch {
      return new Response(
        JSON.stringify({
          erro: "origem_nao_permitida",
          mensagem: "Origem não permitida.",
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            Vary: "Origin",
          },
        },
      );
    }
    const response = (status: number, value: unknown) =>
      new Response(JSON.stringify(value), {
        status,
        headers: {
          ...cors,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return response(405, {
        erro: "metodo_invalido",
        mensagem: "Use POST para acessar a Central.",
      });
    }
    if (!ports.enabled) {
      return response(503, {
        erro: "simulacao_desabilitada",
        mensagem: "Central de Mensagens indisponível neste ambiente.",
      });
    }
    try {
      const authorization = request.headers.get("authorization") ?? "";
      const bearer = /^Bearer ([^\s]+)$/i.exec(authorization)?.[1];
      if (!bearer || bearer.length > 8192) {
        throw new PublicError(
          401,
          "nao_autenticado",
          "Entre na sua conta para acessar a Central.",
        );
      }
      const owner = await ports.authenticate(bearer);
      if (!uuid(owner)) {
        throw new PublicError(
          401,
          "nao_autenticado",
          "Sessão inválida ou expirada. Entre novamente.",
        );
      }
      const input = await body(request);
      switch (input.acao) {
        case "listar":
          exact(input, ["acao"]);
          break;
        case "salvar": {
          exact(input, ["acao", "preferencias"]);
          const value = object(input.preferencias);
          if (!value) throw bad();
          exact(value, ["versao", "config", "modelos", "viagens"]);
          if (!Number.isSafeInteger(value.versao) || Number(value.versao) < 0) {
            throw bad();
          }
          let validated: Omit<Preferences, "versao">;
          try {
            validated = ports.domain.validatePreferences({
              config: value.config,
              modelos: value.modelos,
              viagens: value.viagens,
            });
          } catch {
            throw new PublicError(
              422,
              "preferencias_invalidas",
              "Confira os modelos, fusos, horários e regras informados.",
            );
          }
          await repo.save(owner, {
            ...validated,
            versao: Number(value.versao),
          });
          break;
        }
        case "preparar":
          exact(input, ["acao"]);
          await prepare(owner);
          break;
        case "controlar":
          exact(input, ["acao", "id", "comando"]);
          if (
            !uuid(input.id) ||
            !["pausar", "retomar", "cancelar"].includes(String(input.comando))
          ) throw bad();
          await repo.control(owner, input.id, String(input.comando));
          break;
        case "simular":
          exact(input, ["acao", "id"]);
          if (!uuid(input.id)) throw bad();
          await simulate(owner, input.id);
          break;
        default:
          throw bad();
      }
      return response(200, await list(owner));
    } catch (error) {
      if (error instanceof PublicError) {
        return response(error.status, {
          erro: error.code,
          mensagem: error.message,
        });
      }
      return response(503, {
        erro: "indisponivel",
        mensagem: "Central indisponível. Nenhum envio real foi realizado.",
      });
    }
  };
}
