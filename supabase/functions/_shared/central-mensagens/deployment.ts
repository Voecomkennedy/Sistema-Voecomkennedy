import { parseOrigins } from "./cors.ts";
import { object } from "./types.ts";

// Escopo desta publicação autorizado expressamente. Copiar o pacote para outro
// projeto, ou editar só o JSON, não amplia o destino permitido pelo entrypoint.
export const AUTHORIZED_PROJECT_REF = "qryobmqrkzddcvlvgfrp";

export interface DeploymentEnvironment {
  supabaseUrl?: string;
  modeOverride?: string;
  originsOverride?: string;
}

export interface DeploymentResolution {
  enabled: boolean;
  allowedOrigins: string[];
  reason:
    | "simulacao"
    | "configuracao_invalida"
    | "projeto_invalido"
    | "desabilitada"
    | "origens_invalidas";
}

/** Somente valores públicos. Não acessa ambiente, rede, arquivos ou credenciais. */
export function resolveDeployment(
  value: unknown,
  environment: DeploymentEnvironment,
): DeploymentResolution {
  const closed = (
    reason: DeploymentResolution["reason"],
    allowedOrigins: string[] = [],
  ): DeploymentResolution => ({ enabled: false, allowedOrigins, reason });
  const config = object(value);
  if (
    !config ||
    Object.keys(config).some((key) =>
      !["projectRef", "mode", "allowedOrigins"].includes(key)
    ) || config.projectRef !== AUTHORIZED_PROJECT_REF ||
    !["simulacao", "desabilitada"].includes(String(config.mode)) ||
    !Array.isArray(config.allowedOrigins) || config.allowedOrigins.length < 1 ||
    config.allowedOrigins.length > 10
  ) return closed("configuracao_invalida");

  let allowedOrigins: string[];
  try {
    allowedOrigins = [
      ...new Set(config.allowedOrigins.map((origin: unknown) => {
        if (typeof origin !== "string" || !origin.startsWith("https://")) {
          throw new Error("invalid_origin");
        }
        const parsed = parseOrigins(origin);
        // Cada entrada representa uma única origem canônica, sem caminhos/vírgulas.
        if (parsed.length !== 1 || parsed[0] !== origin) {
          throw new Error("invalid_origin");
        }
        return parsed[0];
      })),
    ];
  } catch {
    return closed("configuracao_invalida");
  }

  const expected = `https://${AUTHORIZED_PROJECT_REF}.supabase.co`;
  if (
    environment.supabaseUrl !== expected &&
    environment.supabaseUrl !== expected + "/"
  ) return closed("projeto_invalido", allowedOrigins);

  // O JSON é a autorização máxima. ENV só pode restringir, nunca reativar JSON
  // desligado. Valor vazio também fecha; somente undefined significa ausência.
  if (
    config.mode !== "simulacao" ||
    (environment.modeOverride !== undefined &&
      environment.modeOverride !== "simulacao")
  ) return closed("desabilitada", allowedOrigins);

  if (environment.originsOverride !== undefined) {
    try {
      const restricted = parseOrigins(environment.originsOverride);
      if (
        !restricted.length ||
        restricted.some((origin) => !allowedOrigins.includes(origin))
      ) return closed("origens_invalidas");
      allowedOrigins = restricted;
    } catch {
      return closed("origens_invalidas");
    }
  }

  return { enabled: true, allowedOrigins, reason: "simulacao" };
}
