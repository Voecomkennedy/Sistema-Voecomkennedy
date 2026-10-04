import { domain } from "../../_shared/central-mensagens/domain.ts";
import { defaultPreferences } from "../../_shared/central-mensagens/handler.ts";
import { PublicError } from "../../_shared/central-mensagens/types.ts";
import type {
  JsonObject,
  Preferences,
  Repository,
  Source,
  Task,
} from "../../_shared/central-mensagens/types.ts";

export const OWNER = "00000000-0000-4000-8000-000000000001";
export const OTHER = "00000000-0000-4000-8000-000000000002";
export const ID = "00000000-0000-4000-8000-000000000003";
export const TOKEN = "00000000-0000-4000-8000-000000000004";
export const NOW = "2026-11-14T13:00:00.000Z";
export const FINGERPRINT = "0123456789abcdef0123456789abcdef";

export function preferences(): Preferences {
  const value = defaultPreferences(domain);
  value.versao = 1;
  value.config.pausado = false;
  for (const [key, rule] of Object.entries(value.modelos)) {
    (rule as JsonObject).ativo = key === "24h";
  }
  (value.modelos["24h"] as JsonObject).texto =
    "Oi, {{primeiro_nome}}! Seu voo é {{quando}}.";
  value.viagens.sale = {
    emissaoConfirmada: true,
    fusoIda: "America/Sao_Paulo",
    fusoVolta: "",
    chegadaFinal: "",
  };
  return value;
}
export function source(): Source {
  return {
    versao: 7,
    fingerprint: FINGERPRINT,
    conteudo: {
      emissao_vendas: [{
        id: "sale",
        clienteId: "person",
        statusVenda: "emitida",
        origem: "GYN",
        destino: "GRU",
        dataEmbarque: "2026-11-15",
        horaEmbarque: "10:00",
        custo: 9000,
        comissao: 1000,
        documento: "PRIVATE",
      }],
      emissao_pessoas: [{
        id: "person",
        nome: "Maria Exemplo",
        telefone: "+55 62 99999-8888",
        cpf: "PRIVATE",
        custo: 9000,
      }],
      segredos: "PRIVATE",
    },
  };
}
export function task(): Task {
  const planned = domain.planejar({
    userId: OWNER,
    conteudo: source().conteudo,
    origemVersao: 7,
    preferencias: preferences(),
    agora: new Date(NOW),
  }).tarefas[0];
  return {
    ...planned,
    id: ID,
    estado: "pendente",
    user_id: OWNER,
  } as unknown as Task;
}
export class FakeRepository implements Repository {
  calls: { name: string; owner: string; args: unknown[] }[] = [];
  currentSource: Source | null = source();
  currentPreferences: Preferences | null = preferences();
  currentTask: Task | null = task();
  histories: JsonObject[] = [];
  reserveBlocked = false;
  beginBlocked = false;
  finishThrows = false;
  beginHook?: () => void;
  prepareHook?: () => void;
  record(name: string, owner: string, ...args: unknown[]) {
    this.calls.push({ name, owner, args });
    if (owner !== OWNER) throw new Error("owner escape");
  }
  source(owner: string) {
    this.record("source", owner);
    return Promise.resolve(structuredClone(this.currentSource));
  }
  preferences(owner: string) {
    this.record("preferences", owner);
    return Promise.resolve(structuredClone(this.currentPreferences));
  }
  tasks(owner: string) {
    this.record("tasks", owner);
    return Promise.resolve(
      this.currentTask ? [structuredClone(this.currentTask)] : [],
    );
  }
  history(owner: string) {
    this.record("history", owner);
    return Promise.resolve(structuredClone(this.histories));
  }
  save(owner: string, value: Preferences) {
    this.record("save", owner, value);
    if (value.versao !== (this.currentPreferences?.versao ?? 0)) {
      throw new PublicError(409, "conflito", "Os dados mudaram.");
    }
    this.currentPreferences = {
      ...structuredClone(value),
      versao: value.versao + 1,
    };
    return Promise.resolve(structuredClone(this.currentPreferences));
  }
  prepare(
    owner: string,
    sourceVersion: number,
    preferencesVersion: number,
    tasks: JsonObject[],
    sourceFingerprint: string,
  ) {
    this.record(
      "prepare",
      owner,
      sourceVersion,
      preferencesVersion,
      tasks,
      sourceFingerprint,
    );
    this.prepareHook?.();
    if (
      this.currentSource?.versao !== sourceVersion ||
      this.currentSource?.fingerprint !== sourceFingerprint
    ) throw new PublicError(409, "conflito", "Os dados mudaram.");
    if (
      this.currentTask && this.currentTask.estado === "pendente" && tasks.length
    ) {
      this.currentTask = {
        ...tasks[0],
        id: ID,
        estado: "pendente",
        user_id: OWNER,
      } as unknown as Task;
    }
    return Promise.resolve();
  }
  control(owner: string, id: string, command: string) {
    this.record("control", owner, id, command);
    return Promise.resolve();
  }
  reserve(owner: string, id: string) {
    this.record("reserve", owner, id);
    if (
      this.reserveBlocked || !this.currentTask || this.currentTask.id !== id ||
      this.currentTask.estado !== "pendente"
    ) return Promise.resolve(null);
    this.currentTask.estado = "reservada";
    this.currentTask.reserva_token = TOKEN;
    return Promise.resolve(structuredClone(this.currentTask));
  }
  begin(owner: string, id: string, token: string) {
    this.record("begin", owner, id, token);
    this.beginHook?.();
    if (this.beginBlocked || !this.currentTask) return Promise.resolve(null);
    this.currentTask.estado = "tentativa";
    return Promise.resolve(structuredClone(this.currentTask));
  }
  finish(
    owner: string,
    id: string,
    token: string,
    state: "simulada" | "falha",
    detail: JsonObject,
  ) {
    this.record("finish", owner, id, token, state, detail);
    if (this.finishThrows) throw new Error("upstream SECRET");
    if (!this.currentTask) return Promise.resolve(null);
    this.currentTask.estado = state;
    this.histories.push({
      id: ID,
      tarefa_id: ID,
      estado: state,
      detalhe: detail,
      criado_em: NOW,
      user_id: OWNER,
    });
    return Promise.resolve(structuredClone(this.currentTask));
  }
}

export function request(
  value: unknown,
  options: { method?: string; token?: string; contentType?: string } = {},
) {
  const method = options.method ?? "POST";
  return new Request(
    "https://central.example.test/functions/v1/central-mensagens",
    {
      method,
      headers: {
        authorization: options.token === ""
          ? ""
          : `Bearer ${options.token ?? "valid.jwt"}`,
        "content-type": options.contentType ?? "application/json",
      },
      body: ["GET", "OPTIONS"].includes(method)
        ? undefined
        : JSON.stringify(value),
    },
  );
}
