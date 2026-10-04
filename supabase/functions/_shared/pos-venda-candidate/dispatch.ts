// Orquestração sem transporte real e sem implementação de banco. Etapa 2 deve
// implementar o contrato atômico abaixo ANTES de conectar este módulo ao cron.
import {
  assinaturaEvento,
  chaveEnvio,
  chaveEvento,
  type Config,
  devido,
  type Evento,
  normalizarTelefone,
  texto,
} from "./engine.ts";

export interface EstadoAtual {
  config: Config;
  evento: Evento | null;
  revisao: string;
}
export type ResultadoProvedor =
  | { estado: "aceito"; messageId: string; zaapId?: string }
  | { estado: "rejeitado" | "incerto" };
export type Encerramento = ResultadoProvedor | {
  estado: "cancelado";
  motivo: string;
};

// Sem regex sobre resposta bruta: "erro: messageId ausente" não é um aceite.
// Mesmo HTTP 5xx pode chegar depois de um efeito remoto: mantém incerteza.
export function interpretarAceite(
  httpStatus: number,
  payload: unknown,
): ResultadoProvedor {
  if (
    httpStatus < 200 || httpStatus >= 300 || !payload ||
    typeof payload !== "object" || Array.isArray(payload)
  ) {
    return { estado: "incerto" };
  }
  const p = payload as Record<string, unknown>;
  if (p.error || typeof p.messageId !== "string" || !p.messageId.trim()) {
    return { estado: "incerto" };
  }
  return {
    estado: "aceito",
    messageId: p.messageId,
    ...(typeof p.zaapId === "string" && p.zaapId.trim()
      ? { zaapId: p.zaapId }
      : {}),
  };
}
export interface ReservaPedido {
  chave: string;
  chaveConversa: string;
  revisao: string;
  assinatura: string;
}
export interface RegistroAtomico {
  /** Transação: chaves únicas de envio E conversa. Nunca read-then-insert.
   * Estados reservado/tentativa/aceito/rejeitado/incerto bloqueiam repetição.
   * Não liberar timeout por TTL para tentar de novo automaticamente. */
  reservar(pedido: ReservaPedido): Promise<string | null>;
  /** Compare-and-set por token, revisão/config ATUAL e assinatura. Persistir
   * tentativa ANTES do HTTP. Também validar ativo, modo, janela e silêncio no DB.
   * Retornar false quando o estado mudou; erro de persistência impede envio. */
  iniciarTentativa(
    token: string,
    pedido: ReservaPedido,
    agora: Date,
  ): Promise<boolean>;
  /** Compare-and-set por token; erro aqui após envio exige reconciliação humana.
   * Nunca interpretar "aceito" como entregue ao cliente. */
  concluir(token: string, resultado: Encerramento): Promise<void>;
}
export interface DependenciasEnvio {
  agora(): Date;
  atualizar(evento: Evento): Promise<EstadoAtual>;
  registro: RegistroAtomico;
  // O adaptador futuro NÃO pode fazer retry HTTP automático. Deve ter timeout
  // limitado; timeout/falha de rede ou resposta ambígua = resultado incerto.
  enviar(destino: string, mensagem: string): Promise<ResultadoProvedor>;
}
export interface ResultadoExecucao {
  chave: string;
  estado: string;
}

function preparar(atual: EstadoAtual, agora: Date) {
  const { config, evento } = atual;
  if (
    config.ativo !== true || typeof config.modo_teste !== "boolean" ||
    !atual.revisao || !evento || !devido(evento, agora)
  ) return null;
  const modo = config.modo_teste ? "teste" : "real";
  const destino = normalizarTelefone(
    modo === "teste" ? config.numero_teste : evento.cliente?.telefone,
  );
  if (!destino) return null;
  const rota = evento.tipo === "volta_checkin"
    ? [evento.venda.destino, evento.venda.origem]
    : [evento.venda.origem, evento.venda.destino];
  const pedido: ReservaPedido = {
    chave: chaveEnvio(evento, modo),
    // Impede cobranças duplicadas do mesmo voo/contato em vendas diferentes,
    // sem fundir cadastros nem remover o nono dígito do telefone.
    chaveConversa: JSON.stringify([
      evento.proprietario,
      normalizarTelefone(evento.cliente?.telefone),
      evento.tipo,
      evento.embarque.toISOString(),
      rota,
      modo,
    ]),
    revisao: atual.revisao,
    assinatura: JSON.stringify([
      assinaturaEvento(evento),
      modo,
      destino,
      config.instagram || "",
    ]),
  };
  return { evento, modo, destino, pedido, config };
}

export async function executarCandidatos(
  eventos: readonly Evento[],
  deps: DependenciasEnvio,
): Promise<ResultadoExecucao[]> {
  const resultados: ResultadoExecucao[] = [];
  for (const candidato of eventos) {
    // Sem captura única de new Date() no início do lote.
    const inicial = preparar(await deps.atualizar(candidato), deps.agora());
    if (!inicial || chaveEvento(inicial.evento) !== chaveEvento(candidato)) {
      continue;
    }
    const token = await deps.registro.reservar(inicial.pedido);
    if (!token) continue;
    const cancelar = async (motivo: string) => {
      await deps.registro.concluir(token, { estado: "cancelado", motivo });
      resultados.push({ chave: inicial.pedido.chave, estado: motivo });
    };
    // Releitura após reserva: arquivamento, pausa, telefone/voo ou modo podem mudar.
    const final = preparar(await deps.atualizar(candidato), deps.agora());
    if (
      !final || JSON.stringify(final.pedido) !== JSON.stringify(inicial.pedido)
    ) {
      await cancelar("estado_alterado");
      continue;
    }
    if (
      !await deps.registro.iniciarTentativa(token, final.pedido, deps.agora())
    ) {
      await cancelar("reserva_invalidada");
      continue;
    }
    // A transação/rede pode ter atravessado 21:00 ou o fim da janela.
    const instanteEnvio = deps.agora();
    if (!devido(final.evento, instanteEnvio)) {
      await cancelar("instante_nao_permitido");
      continue;
    }
    let mensagem = texto(final.evento, instanteEnvio, final.config.instagram);
    if (final.modo === "teste") {
      mensagem = `🧪 TESTE | ${final.evento.tipo}\n\n${mensagem}`;
    }
    let resultado: ResultadoProvedor;
    try {
      resultado = await deps.enviar(final.destino, mensagem);
      if (resultado.estado === "aceito" && !resultado.messageId?.trim()) {
        resultado = { estado: "incerto" };
      }
    } catch {
      // Não vazar URL com token, telefone ou resposta bruta nos logs/retornos.
      resultado = { estado: "incerto" };
    }
    await deps.registro.concluir(token, resultado);
    resultados.push({ chave: final.pedido.chave, estado: resultado.estado });
  }
  return resultados;
}
