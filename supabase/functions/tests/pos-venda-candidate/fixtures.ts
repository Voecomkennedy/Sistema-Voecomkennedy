import type {
  Config,
  Evento,
  Snapshot,
  Venda,
} from "../../_shared/pos-venda-candidate/engine.ts";
import { montarEventos } from "../../_shared/pos-venda-candidate/engine.ts";

export const config: Config = {
  chave_cron: "chave-ficticia-somente-para-testes",
  ativo: true,
  modo_teste: false,
};
export function venda(overrides: Partial<Venda> = {}): Venda {
  return {
    id: "venda-1",
    clienteId: "pessoa-1",
    statusVenda: "emitida",
    origem: "GYN",
    destino: "GRU",
    dataEmbarque: "2026-10-06",
    horaEmbarque: "10:00",
    ...overrides,
  };
}
export function snapshot(
  overrides: Partial<Venda> = {},
  user_id = "conta-1",
): Snapshot {
  return {
    user_id,
    conteudo: {
      emissao_vendas: [venda(overrides)],
      emissao_pessoas: [{
        id: "pessoa-1",
        nome: "CLIENTE FICTÍCIO",
        telefone: "(62) 99999-0001",
      }],
    },
  };
}
export function evento(overrides: Partial<Venda> = {}): Evento {
  return montarEventos([snapshot(overrides)])[0];
}
