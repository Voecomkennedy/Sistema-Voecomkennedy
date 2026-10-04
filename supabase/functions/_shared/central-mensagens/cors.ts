import { PublicError } from "./types.ts";

/** Origens exatas; não aceita wildcard, path, credenciais ou prefix matching. */
export function parseOrigins(raw: string): string[] {
  return [
    ...new Set(
      raw.split(",").map((item) => item.trim()).filter(Boolean).map((item) => {
        const url = new URL(item);
        if (
          url.origin !== item || url.username || url.password ||
          (url.protocol !== "https:" &&
            !(url.protocol === "http:" &&
              ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
        ) {
          throw new Error("invalid_origin_config");
        }
        return url.origin;
      }),
    ),
  ];
}

export function corsHeaders(
  request: Request,
  allowed: readonly string[],
): Record<string, string> {
  const origin = request.headers.get("origin");
  if (origin && !allowed.includes(origin)) {
    throw new PublicError(403, "origem_nao_permitida", "Origem não permitida.");
  }
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
