import assert from "node:assert/strict";
import {
  type DependenciasEnvio,
  type Encerramento,
  executarCandidatos,
  interpretarAceite,
  type RegistroAtomico,
  type ReservaPedido,
  type ResultadoProvedor,
} from "../../_shared/pos-venda-candidate/dispatch.ts";
import {
  type Config,
  type Evento,
} from "../../_shared/pos-venda-candidate/engine.ts";
import { config, evento } from "./fixtures.ts";

// Fake local, não comprova atomicidade PostgreSQL. A produção precisará cumprir
// este contrato com constraints/transações e testes contra banco isolado.
class RegistroFake implements RegistroAtomico {
  pedidos = new Map<string, ReservaPedido>();
  conclusoes: Encerramento[] = [];
  iniciadas = 0;
  antesDeIniciar: () => boolean = () => true;
  reservar(pedido: ReservaPedido): Promise<string | null> {
    const duplicado = [...this.pedidos.values()].some((p) =>
      p.chave === pedido.chave || p.chaveConversa === pedido.chaveConversa
    );
    if (duplicado) return Promise.resolve(null);
    const token = `reserva-${this.pedidos.size}`;
    this.pedidos.set(token, pedido); // Mantém estados incertos/reservados bloqueados.
    return Promise.resolve(token);
  }
  iniciarTentativa(): Promise<boolean> {
    this.iniciadas++;
    return Promise.resolve(this.antesDeIniciar());
  }
  concluir(_token: string, resultado: Encerramento): Promise<void> {
    this.conclusoes.push(resultado);
    return Promise.resolve();
  }
}
function fixture() {
  const e = evento();
  const state = {
    agora: new Date(e.quando),
    config: { ...config } as Config,
    revisao: "rev1",
    atualizado: 0,
    enviados: [] as { destino: string; texto: string }[],
    evento: e as Evento | null,
  };
  const registro = new RegistroFake();
  const deps: DependenciasEnvio = {
    agora: () => new Date(state.agora),
    atualizar: (candidato) => {
      state.atualizado++;
      return Promise.resolve({
        config: state.config,
        revisao: state.revisao,
        evento: state.evento === null ? null : {
          ...state.evento,
          venda: { ...state.evento.venda, id: candidato.venda.id },
        },
      });
    },
    registro,
    enviar: (destino, texto) => {
      state.enviados.push({ destino, texto });
      return Promise.resolve({ estado: "aceito", messageId: "id-ficticio" });
    },
  };
  return { e, state, registro, deps };
}

Deno.test("aceite do provedor não é registrado como entrega ao cliente", async () => {
  const f = fixture();
  const r = await executarCandidatos([f.e], f.deps);
  assert.equal(r[0].estado, "aceito");
  assert.equal(f.registro.iniciadas, 1);
  assert.deepEqual(f.registro.conclusoes, [{
    estado: "aceito",
    messageId: "id-ficticio",
  }]);
});
Deno.test("resposta ambígua, erro com palavra messageId e HTTP 5xx ficam incertos", () => {
  for (
    const payload of [{ error: "messageId ausente" }, "messageId", {
      zaapId: "id-parcial",
    }, { messageId: "" }]
  ) {
    assert.deepEqual(interpretarAceite(200, payload), { estado: "incerto" });
  }
  assert.deepEqual(interpretarAceite(500, { messageId: "id" }), {
    estado: "incerto",
  });
  assert.deepEqual(
    interpretarAceite(200, { messageId: "id", zaapId: "zaap" }),
    { estado: "aceito", messageId: "id", zaapId: "zaap" },
  );
});
Deno.test("releitura que retorna outra conta nunca fornece destinatário", async () => {
  const f = fixture();
  f.state.evento = { ...f.e, proprietario: "outra-conta" };
  await executarCandidatos([f.e], f.deps);
  assert.equal(f.state.enviados.length, 0);
  assert.equal(f.registro.pedidos.size, 0);
});
Deno.test("concorrência reserva uma única tentativa", async () => {
  const f = fixture();
  await Promise.all([
    executarCandidatos([f.e], f.deps),
    executarCandidatos([f.e], f.deps),
  ]);
  assert.equal(f.state.enviados.length, 1);
});
Deno.test("mesmo voo e destinatário em vendas diferentes não duplica", async () => {
  const f = fixture();
  const outra = { ...f.e, venda: { ...f.e.venda, id: "venda-2" } };
  await executarCandidatos([f.e, outra], f.deps);
  assert.equal(f.state.enviados.length, 1);
});
Deno.test("timeout fica incerto e não reenvia no próximo tick", async () => {
  const f = fixture();
  let tentativas = 0;
  f.deps.enviar = () => {
    tentativas++;
    throw new Error("timeout com URL sensível");
  };
  const r = await executarCandidatos([f.e], f.deps);
  await executarCandidatos([f.e], f.deps);
  assert.equal(tentativas, 1);
  assert.equal(r[0].estado, "incerto");
  assert.deepEqual(f.registro.conclusoes, [{ estado: "incerto" }]);
});
Deno.test("aceite sem ID fica incerto, não vira enviado", async () => {
  const f = fixture();
  f.deps.enviar = () => Promise.resolve({ estado: "aceito", messageId: "" });
  assert.equal((await executarCandidatos([f.e], f.deps))[0].estado, "incerto");
});
Deno.test("rejeição explícita não recebe retry cego", async () => {
  const f = fixture();
  let tentativas = 0;
  f.deps.enviar = () => {
    tentativas++;
    return Promise.resolve({ estado: "rejeitado" } as ResultadoProvedor);
  };
  await executarCandidatos([f.e], f.deps);
  await executarCandidatos([f.e], f.deps);
  assert.equal(tentativas, 1);
});
Deno.test("pausa e modo teste são conferidos novamente após reserva", async () => {
  for (
    const mudar of [
      (c: Config) => c.ativo = false,
      (c: Config) => c.modo_teste = true,
    ]
  ) {
    const f = fixture();
    const atualizar = f.deps.atualizar;
    f.deps.atualizar = async (e) => {
      if (f.state.atualizado === 1) mudar(f.state.config);
      return await atualizar(e);
    };
    await executarCandidatos([f.e], f.deps);
    assert.equal(f.state.enviados.length, 0);
    assert.equal(f.registro.conclusoes[0].estado, "cancelado");
  }
});
Deno.test("arquivamento e mudança de voo após reserva cancelam", async () => {
  for (
    const mudar of [
      (e: Evento) => e.venda.excluidaEm = "2026-10-04T13:00:00Z",
      (e: Evento) => e.venda.horaEmbarque = "12:00",
    ]
  ) {
    const f = fixture();
    const atualizar = f.deps.atualizar;
    f.deps.atualizar = async (e) => {
      if (f.state.atualizado === 1) mudar(f.e);
      return await atualizar(e);
    };
    await executarCandidatos([f.e], f.deps);
    assert.equal(f.state.enviados.length, 0);
  }
});
Deno.test("falha de reserva e rejeição da transação impedem HTTP", async () => {
  const f = fixture();
  f.registro.antesDeIniciar = () => false;
  await executarCandidatos([f.e], f.deps);
  assert.equal(f.state.enviados.length, 0);
  const g = fixture();
  g.registro.reservar = () => {
    throw new Error("DB indisponível");
  };
  await assert.rejects(() => executarCandidatos([g.e], g.deps));
  assert.equal(g.state.enviados.length, 0);
});
Deno.test("falha ao salvar depois do HTTP preserva reserva e exige reconciliação", async () => {
  const f = fixture();
  f.registro.concluir = () => {
    throw new Error("persistência indisponível");
  };
  await assert.rejects(() => executarCandidatos([f.e], f.deps));
  await executarCandidatos([f.e], f.deps);
  assert.equal(f.state.enviados.length, 1);
});
Deno.test("latência de reserva não autoriza envio após 21h", async () => {
  const f = fixture();
  f.e.quando = new Date("2026-10-04T23:50:00Z");
  f.state.agora = new Date("2026-10-04T23:59:59Z");
  f.registro.antesDeIniciar = () => {
    f.state.agora = new Date("2026-10-05T00:00:00Z");
    return true;
  };
  const r = await executarCandidatos([f.e], f.deps);
  assert.equal(f.state.enviados.length, 0);
  assert.equal(r[0].estado, "instante_nao_permitido");
});
Deno.test("latência da transação não recupera janela vencida", async () => {
  const f = fixture();
  f.registro.antesDeIniciar = () => {
    f.state.agora = new Date(f.e.quando.getTime() + 15 * 60_000);
    return true;
  };
  await executarCandidatos([f.e], f.deps);
  assert.equal(f.state.enviados.length, 0);
});
Deno.test("cada mensagem do lote reconsulta silêncio e pausa", async () => {
  const f = fixture();
  const outra = { ...f.e, venda: { ...f.e.venda, id: "venda-2" } };
  const enviar = f.deps.enviar;
  f.deps.enviar = async (d, t) => {
    const r = await enviar(d, t);
    f.state.config.ativo = false;
    return r;
  };
  await executarCandidatos([f.e, outra], f.deps);
  assert.equal(f.state.enviados.length, 1);
});
Deno.test("modo teste requer ativo e telefone teste válido", async () => {
  const f = fixture();
  f.state.config.modo_teste = true;
  await executarCandidatos([f.e], f.deps);
  assert.equal(f.state.enviados.length, 0);
  f.state.config.numero_teste = "62999990009";
  await executarCandidatos([f.e], f.deps);
  assert.equal(f.state.enviados[0].destino, "5562999990009");
  assert.ok(f.state.enviados[0].texto.startsWith("🧪 TESTE"));
});
