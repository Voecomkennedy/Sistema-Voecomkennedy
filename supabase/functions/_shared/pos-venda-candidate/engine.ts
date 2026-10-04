// Candidato local. Não é importado pela função publicada nem conectado ao cron.
export const HORA = 3_600_000;
export const TOLERANCIA_MS = 15 * 60_000;
const TZ = -3; // Preserva a interpretação Brasília da v9; não infere fuso de aeroporto.
const BR = new Set(
  ("GRU CGH VCP SDU GIG BSB CNF PLU CWB POA FLN NVT JOI XAP CCM JJG IGU LDB MGF CAC GYN CGB CGR PMW SSA REC FOR " +
    "NAT JPA MCZ AJU THE PHB SLZ BEL MAO STM MCP BVB PVH RBR IOS BPS PNZ JDO VIX UDI UBA RAO SJP ARU PPB JTC MII IMP MAB ATM " +
    "CPV MVF FEN JJD VDC FEC LEC BRA PAV TBT PIN ROO OPS AFL DOU CMG BYO TJL RVD CLV AUX VAG MOC GVR IPN IZA JDF CAW MEA CFB " +
    "CXJ PET RIA PFB URG GEL LAJ PGZ GPB PTO TOW CKS SJK").split(" "),
);

export type Tipo = "48h" | "24h" | "dia" | "volta_checkin" | "volta";
export interface Venda {
  id: string;
  clienteId: string;
  statusVenda: string;
  origem: string;
  destino: string;
  dataEmbarque: string;
  horaEmbarque: string;
  dataVolta?: string;
  horaVolta?: string;
  excluidaEm?: unknown;
  dataAtualizacao?: string;
}
export interface Pessoa {
  id: string;
  nome?: string;
  telefone?: string;
}
export interface Snapshot {
  user_id: string;
  conteudo: unknown;
}
export interface Evento {
  proprietario: string;
  venda: Venda;
  cliente: Pessoa | null;
  tipo: Tipo;
  quando: Date;
  embarque: Date;
}
export interface Config {
  chave_cron: string;
  ativo: boolean;
  modo_teste: boolean;
  numero_teste?: string;
  instagram?: string;
}

const objeto = (x: unknown): Record<string, unknown> | null =>
  x !== null && typeof x === "object" && !Array.isArray(x)
    ? x as Record<string, unknown>
    : null;
const string = (x: unknown): x is string =>
  typeof x === "string" && x.trim().length > 0;
const dataValida = (d: Date) => Number.isFinite(d.getTime());
const pad = (n: number) => String(n).padStart(2, "0");

export function partesBrasilia(d: Date) {
  const l = new Date(d.getTime() + TZ * HORA);
  return {
    y: l.getUTCFullYear(),
    m: l.getUTCMonth() + 1,
    d: l.getUTCDate(),
    h: l.getUTCHours(),
    mi: l.getUTCMinutes(),
  };
}
function emBrasilia(y: number, m: number, d: number, h: number, mi = 0) {
  return new Date(Date.UTC(y, m - 1, d, h - TZ, mi));
}

// Rejeita rollover silencioso de 31/02, 24:00, horas ausentes e formatos parciais.
export function lerDataHora(data: unknown, hora: unknown): Date | null {
  if (
    typeof data !== "string" || typeof hora !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)
  ) return null;
  const [y, m, d] = data.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  if (
    y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31 || h > 23 ||
    mi > 59
  ) return null;
  const result = emBrasilia(y, m, d, h, mi);
  const p = partesBrasilia(result);
  return p.y === y && p.m === m && p.d === d ? result : null;
}

export function emSilencio(agora: Date): boolean {
  if (!dataValida(agora)) return true;
  const h = partesBrasilia(agora).h;
  return h < 8 || h >= 21;
}
export function ajustarSilencio(t: Date): Date {
  const p = partesBrasilia(t);
  if (p.h >= 21) return emBrasilia(p.y, p.m, p.d, 20);
  if (p.h < 8) return emBrasilia(p.y, p.m, p.d - 1, 20);
  return new Date(t);
}
export function primeiroNome(nome?: string): string {
  const n = nome?.trim().split(/\s+/)[0] || "";
  return n === n.toUpperCase() || n === n.toLowerCase()
    ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase()
    : n;
}
export function normalizarTelefone(t?: string): string | null {
  if (!t) return null;
  const entrada = t.trim();
  // Apenas formatação de telefone; não converte @lid, ramais ou texto livre.
  if (!/^\+?[\d\s().-]+$/.test(entrada)) return null;
  const d = entrada.replace(/\D/g, "");
  if (!d || /^(\d)\1+$/.test(d)) return null;
  // DDI explícito com + deve ser preservado, inclusive com 10/11 dígitos.
  // Validação estrutural conservadora; não comprova existência/WhatsApp.
  if (entrada.startsWith("+")) return /^[1-9]\d{7,14}$/.test(d) ? d : null;
  // Sem +, números nacionais de 10/11 dígitos mantêm a região padrão Brasil.
  // Não adivinha código de operadora/prefixo 00 nem aceita DDD começando em 0.
  if (/^[1-9]\d{9,10}$/.test(d)) return "55" + d;
  return /^[1-9]\d{11,14}$/.test(d) ? d : null;
}
export function nacional(o: string, d: string) {
  return BR.has(o.trim().toUpperCase()) && BR.has(d.trim().toUpperCase());
}
function vendaValida(x: unknown): x is Venda {
  const v = objeto(x);
  return !!v &&
    [
      "id",
      "clienteId",
      "statusVenda",
      "origem",
      "destino",
      "dataEmbarque",
      "horaEmbarque",
    ].every((k) => string(v[k]));
}
function pessoaValida(x: unknown): x is Pessoa {
  const p = objeto(x);
  return !!p && string(p.id) &&
    (p.nome === undefined || typeof p.nome === "string") &&
    (p.telefone === undefined || typeof p.telefone === "string");
}

export function montarEventos(linhas: readonly Snapshot[]): Evento[] {
  const out: Evento[] = [];
  const vistos = new Set<string>();
  // Proprietários repetidos ou ausentes não podem ser fundidos silenciosamente.
  const contas = new Map<string, number>();
  for (const l of linhas) {
    contas.set(l.user_id, (contas.get(l.user_id) || 0) + 1);
  }
  for (const l of linhas) {
    if (!string(l.user_id) || contas.get(l.user_id) !== 1) continue;
    const conteudo = objeto(l.conteudo);
    const vendas = Array.isArray(conteudo?.emissao_vendas)
      ? conteudo.emissao_vendas.filter(vendaValida)
      : [];
    const pessoas = Array.isArray(conteudo?.emissao_pessoas)
      ? conteudo.emissao_pessoas.filter(pessoaValida)
      : [];
    for (const v of vendas) {
      if (v.excluidaEm || v.statusVenda !== "emitida") continue;
      if (vendas.filter((x) => x.id === v.id).length !== 1) continue;
      const emb = lerDataHora(v.dataEmbarque, v.horaEmbarque);
      if (!emb) continue;
      const matches = pessoas.filter((p) => p.id === v.clienteId);
      const cliente = matches.length === 1 ? matches[0] : null;
      const add = (tipo: Tipo, quando: Date, embarque: Date) => {
        const e: Evento = {
          proprietario: l.user_id,
          venda: v,
          cliente,
          tipo,
          quando,
          embarque,
        };
        // Não ignora nono dígito nem mistura contas/pessoas de mesmo telefone.
        const key = chaveEvento(e);
        if (!vistos.has(key)) {
          vistos.add(key);
          out.push(e);
        }
      };
      add("48h", ajustarSilencio(new Date(emb.getTime() - 48 * HORA)), emb);
      add("24h", ajustarSilencio(new Date(emb.getTime() - 24 * HORA)), emb);
      add("dia", ajustarSilencio(new Date(emb.getTime() - 4 * HORA)), emb);
      const volta = lerDataHora(v.dataVolta, v.horaVolta);
      if (volta && volta.getTime() - emb.getTime() >= 48 * HORA) {
        add(
          "volta_checkin",
          ajustarSilencio(new Date(volta.getTime() - 24 * HORA)),
          volta,
        );
      }
      // V9 agendava "chegou bem?" por data de PARTIDA da volta. Não há chegada
      // confirmada no esquema: fica fora de envios automáticos neste candidato.
    }
  }
  return out.sort((a, b) => a.quando.getTime() - b.quando.getTime());
}

// A reserva persistente usa chave lógica por venda/tipo/modo, SEM data: alterar
// o voo não pode criar nova tentativa de uma mensagem já aceita/incerta.
export function chaveEvento(e: Evento): string {
  return JSON.stringify([e.proprietario, e.venda.id, e.tipo]);
}
export function chaveEnvio(e: Evento, modo: "teste" | "real"): string {
  return JSON.stringify([e.proprietario, e.venda.id, e.tipo, modo]);
}
export function assinaturaEvento(e: Evento): string {
  return JSON.stringify([
    e.proprietario,
    e.venda,
    e.cliente,
    e.tipo,
    e.quando.getTime(),
    e.embarque.getTime(),
  ]);
}

export function motivoBloqueio(e: Evento, agora: Date): string | null {
  if (!dataValida(agora) || !dataValida(e.quando) || !dataValida(e.embarque)) {
    return "data_invalida";
  }
  if (e.venda.excluidaEm || e.venda.statusVenda !== "emitida") {
    return "venda_inativa";
  }
  if (e.tipo === "volta") return "chegada_nao_confirmada";
  if (emSilencio(agora)) return "horario_silencioso";
  if (agora.getTime() < e.quando.getTime()) return "ainda_nao_devido";
  if (agora.getTime() >= e.quando.getTime() + TOLERANCIA_MS) {
    return "janela_expirada";
  }
  if (agora.getTime() >= e.embarque.getTime()) return "embarque_passado";
  if (!e.cliente || !normalizarTelefone(e.cliente.telefone)) {
    return "cliente_sem_telefone_valido";
  }
  return null;
}
export const devido = (e: Evento, agora: Date) =>
  motivoBloqueio(e, agora) === null;
const dia = (d: Date) => Math.floor((d.getTime() + TZ * HORA) / (24 * HORA));
const ddmm = (d: Date) => {
  const p = partesBrasilia(d);
  return `${pad(p.d)}/${pad(p.m)}`;
};

export function texto(e: Evento, agoraReal: Date, instagram?: string): string {
  if (!dataValida(agoraReal)) throw new Error("instante inválido");
  const nome = primeiroNome(e.cliente?.nome);
  const oi = nome ? `Oi, ${nome}!` : "Oi!";
  const dif = dia(e.embarque) - dia(agoraReal);
  const quando = dif === 0
    ? "hoje"
    : dif === 1
    ? "amanhã"
    : `no dia ${ddmm(e.embarque)}`;
  if (e.tipo === "48h") {
    return `${oi} Aqui é o Kennedy, da VoeComKennedy 😊\n\nSua viagem está chegando! Separei algumas dicas:\n\n` +
      (nacional(e.venda.origem, e.venda.destino)
        ? "🕑 *Chegue com antecedência*\n2 horas antes do voo. Em aeroporto grande, 3 horas.\n\n📄 *Documento*\nRG ou CNH com foto, físico ou digital.\n\n"
        : "🕑 *Chegue com antecedência*\n3 horas antes do voo.\n\n🛂 *Passaporte*\nLeve o passaporte válido e confira se o destino pede visto ou vacina.\n\n") +
      "📲 *Check-in*\nFaça pelo app ou site da companhia assim que abrir.\n\n🧳 *Mala despachada*\nVá direto ao balcão da companhia quando chegar.\n\n" +
      "⏰ *Atenção ao horário*\nA passagem mostra a hora da decolagem. O portão fecha antes disso. Confira no cartão de embarque a hora do embarque e o portão.\n\nQualquer dúvida, é só me chamar aqui.";
  }
  if (e.tipo === "24h") {
    return `${oi} ✈️\n\nSua viagem é ${quando}.\nJá conseguiu fazer o check-in?\n\nSe tiver qualquer problema, me chama aqui que eu te ajudo.`;
  }
  if (e.tipo === "volta_checkin") {
    return `${oi} Tudo certo por aí? 😊\n\nSeu voo de volta é ${quando}.\nJá conseguiu fazer o check-in?\n\nSe precisar de ajuda, é só me chamar aqui.`;
  }
  if (e.tipo === "dia") {
    const rel = dif === 0
      ? "Hoje"
      : dif === 1
      ? "Amanhã"
      : `Dia ${ddmm(e.embarque)}`;
    return `${rel} é dia de viagem${
      nome ? `, ${nome}` : ""
    }! 🧳\n\nBoa viagem e aproveite muito.\n\n📸 Se postar alguma foto, marca a gente no Instagram:\n${
      instagram || "https://www.instagram.com/voecomkennedy/"
    }`;
  }
  throw new Error("pós-retorno depende de chegada confirmada e revisão");
}
