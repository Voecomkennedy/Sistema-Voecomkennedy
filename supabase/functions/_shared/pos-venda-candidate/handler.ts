// Handler candidato, SEM Deno.serve, credenciais, SDK ou transportes de rede.
import {
  type Config,
  devido,
  lerDataHora,
  montarEventos,
  normalizarTelefone,
  partesBrasilia,
  primeiroNome,
  type Snapshot,
  texto,
} from "./engine.ts";

export interface DependenciasHandler {
  agora(): Date;
  configuracao(): Promise<Config | null>;
  snapshots(): Promise<Snapshot[]>;
  // Só deve existir quando o contrato atômico estiver implementado/validado.
  executar?: () => Promise<unknown>;
}
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

function autorizado(enviada: string | null, esperada: string): boolean {
  if (
    !enviada || !esperada || esperada.length < 16 ||
    enviada.length !== esperada.length
  ) return false;
  let diferente = 0;
  for (let i = 0; i < esperada.length; i++) {
    diferente |= enviada.charCodeAt(i) ^ esperada.charCodeAt(i);
  }
  return diferente === 0;
}

export function criarHandlerCandidato(deps: DependenciasHandler) {
  return async (req: Request): Promise<Response> => {
    try {
      if (req.method !== "GET" && req.method !== "POST") {
        return json({ erro: "método não permitido" }, 405);
      }
      const cfg = await deps.configuracao();
      if (
        !cfg || typeof cfg.chave_cron !== "string" ||
        cfg.chave_cron.length < 16 ||
        typeof cfg.ativo !== "boolean" || typeof cfg.modo_teste !== "boolean"
      ) return json({ erro: "configuração inválida" }, 503);
      if (!autorizado(req.headers.get("x-cron-key"), cfg.chave_cron)) {
        return json({ erro: "não autorizado" }, 401);
      }
      const url = new URL(req.url);
      const previa = url.searchParams.get("previa") === "1";
      const dry = url.searchParams.get("dry") === "1";
      const simulado = url.searchParams.get("agora");

      if (req.method === "GET") {
        if (!previa && !dry) {
          return json({
            erro: "GET permite somente dry=1 ou previa=1, sem envio",
          }, 405);
        }
        if (
          simulado !== null &&
          (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:[0-5]\d(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/
            .test(simulado) ||
            !lerDataHora(simulado.slice(0, 10), simulado.slice(11, 16)))
        ) {
          return json(
            { erro: "agora deve ser um timestamp ISO com fuso" },
            400,
          );
        }
        const agora = simulado === null ? deps.agora() : new Date(simulado);
        if (!Number.isFinite(agora.getTime())) {
          return json({ erro: "agora inválido" }, 400);
        }
        const eventos = montarEventos(await deps.snapshots());
        const agenda = eventos.map((e) => ({
          proprietario: e.proprietario,
          venda: e.venda.id,
          tipo: e.tipo,
          envio_brasilia: partesBrasilia(e.quando),
          cliente: primeiroNome(e.cliente?.nome),
          telefone: normalizarTelefone(e.cliente?.telefone)?.slice(-4) || null,
          elegivel_no_instante: cfg.ativo && devido(e, agora),
          ...(previa ? { texto: texto(e, agora, cfg.instagram) } : {}),
        }));
        // Preview continua útil quando pausada, mas NUNCA chama executar/enviar.
        return json({
          somente_leitura: true,
          simulado: simulado !== null,
          ativo: cfg.ativo,
          modo: cfg.modo_teste ? "teste" : "real",
          agora: agora.toISOString(),
          agenda,
          pos_retorno: "pendente de chegada confirmada e revisão humana",
        });
      }
      if (previa || dry || simulado !== null) {
        return json(
          { erro: "simulação é permitida somente na prévia GET" },
          400,
        );
      }
      if (!cfg.ativo) {
        return json({ executado: false, motivo: "automação desativada" });
      }
      if (!deps.executar) {
        return json({
          erro:
            "candidato não conectado: falta reserva transacional da etapa 2",
        }, 503);
      }
      // O executor precisa reler ativo/modo por mensagem. Esta checagem inicial
      // não substitui as validações transacionais e no instante efetivo do envio.
      return json(await deps.executar());
    } catch {
      return json({ erro: "falha interna; execução interrompida" }, 503);
    }
  };
}
