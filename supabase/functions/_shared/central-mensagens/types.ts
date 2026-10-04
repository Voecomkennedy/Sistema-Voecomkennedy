export type JsonObject = Record<string, unknown>;

export interface Preferences {
  versao: number;
  config: JsonObject;
  modelos: JsonObject;
  viagens: JsonObject;
}

export interface Source {
  versao: number;
  conteudo: unknown;
  fingerprint: string;
}

export interface Task extends JsonObject {
  id: string;
  venda_id: string;
  tipo: string;
  modo: "simulacao";
  estado: string;
  reserva_token?: string | null;
  modelo_snapshot: { texto: string };
  contexto: JsonObject;
}

export interface Domain {
  DEFAULT_CONFIG: JsonObject;
  DEFAULT_MODELOS: JsonObject;
  validatePreferences(input: unknown): Omit<Preferences, "versao">;
  planejar(input: {
    userId: string;
    conteudo: unknown;
    origemVersao: number;
    preferencias: Preferences;
    agora: Date;
  }): { tarefas: JsonObject[]; pendencias: unknown[] };
  contextoNoInstante(task: Task, agora: Date): JsonObject;
  emSilencio(agora: Date, config: JsonObject): boolean;
  renderTemplate(texto: string, contexto: JsonObject): string;
}

/** A propriedade vem exclusivamente de Auth; cada operação filtra-a no servidor. */
export interface Repository {
  source(owner: string): Promise<Source | null>;
  preferences(owner: string): Promise<Preferences | null>;
  tasks(owner: string): Promise<Task[]>;
  history(owner: string): Promise<JsonObject[]>;
  save(owner: string, preferences: Preferences): Promise<Preferences>;
  prepare(
    owner: string,
    sourceVersion: number,
    preferencesVersion: number,
    tasks: JsonObject[],
    sourceFingerprint: string,
  ): Promise<void>;
  control(owner: string, id: string, command: string): Promise<void>;
  reserve(owner: string, id: string): Promise<Task | null>;
  begin(owner: string, id: string, token: string): Promise<Task | null>;
  finish(
    owner: string,
    id: string,
    token: string,
    state: "simulada" | "falha",
    detail: JsonObject,
  ): Promise<Task | null>;
}

export interface Ports {
  enabled: boolean;
  allowedOrigins?: readonly string[];
  authenticate(bearer: string): Promise<string | null>;
  repository: Repository;
  domain: Domain;
  /** Relógio do servidor. Nunca obtido do corpo da requisição. */
  now?: () => Date;
}

export function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

export const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export class PublicError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "PublicError";
    this.status = status;
    this.code = code;
  }
}
