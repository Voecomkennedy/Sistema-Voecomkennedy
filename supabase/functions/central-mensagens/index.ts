// Etapa 2: exclusivamente simulação. Não substitui pos-venda, não cria cron.
import { createSupabaseAdapter } from "../_shared/central-mensagens/adapter.ts";
import { createHandler } from "../_shared/central-mensagens/handler.ts";
import { domain } from "../_shared/central-mensagens/domain.ts";
import {
  corsHeaders,
  parseOrigins,
} from "../_shared/central-mensagens/cors.ts";

let allowedOrigins: string[] = [];
try {
  allowedOrigins = parseOrigins(
    Deno.env.get("CENTRAL_MENSAGENS_ORIGENS") ?? "",
  );
} catch { /* Lista inválida não libera nenhuma origem de navegador. */ }
const disabled = (request: Request) => {
  let cors: Record<string, string>;
  try {
    cors = corsHeaders(request, allowedOrigins);
  } catch {
    return new Response(null, { status: 403 });
  }
  return new Response(
    request.method === "OPTIONS" ? null : JSON.stringify({
      erro: "simulacao_desabilitada",
      mensagem: "Central de Mensagens indisponível neste ambiente.",
    }),
    {
      status: request.method === "OPTIONS" ? 204 : 503,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...cors,
      },
    },
  );
};

let handler: (request: Request) => Promise<Response> | Response = disabled;
if (Deno.env.get("CENTRAL_MENSAGENS_HABILITADA") === "simulacao") {
  try {
    const adapter = createSupabaseAdapter({
      url: Deno.env.get("SUPABASE_URL") ?? "",
      serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      authKey: Deno.env.get("SUPABASE_ANON_KEY"),
    });
    handler = createHandler({
      enabled: true,
      allowedOrigins,
      ...adapter,
      domain,
    });
  } catch {
    /* Configuração ausente/inválida mantém bloqueado, sem log de segredos. */
  }
}
Deno.serve(handler);
