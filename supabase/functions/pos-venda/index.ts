// Automação pós-venda VoeComKennedy
// Roda a cada 15 minutos (agendador do Supabase). Lê as vendas do sistema (dados_app),
// calcula quando cada mensagem deve sair e envia pelo Z-API.
// Proteção: só executa com o cabeçalho x-cron-key igual ao valor salvo em pos_venda_config.
import { createClient } from "npm:@supabase/supabase-js@2";

const TZ = -3; // horário de Brasília (Brasil sem horário de verão)
const H = 3600e3;
// Aeroportos brasileiros (IATA). Se origem E destino estiverem aqui, a viagem é nacional.
const BR = new Set(("GRU CGH VCP SDU GIG BSB CNF PLU CWB POA FLN NVT JOI XAP CCM JJG IGU LDB MGF CAC GYN CGB CGR PMW SSA REC FOR " +
  "NAT JPA MCZ AJU THE PHB SLZ BEL MAO STM MCP BVB PVH RBR IOS BPS PNZ JDO VIX UDI UBA RAO SJP ARU PPB JTC MII IMP MAB ATM " +
  "CPV MVF FEN JJD VDC FEC LEC BRA PAV TBT PIN ROO OPS AFL DOU CMG BYO TJL RVD CLV AUX VAG MOC GVR IPN IZA JDF CAW MEA CFB " +
  "CXJ PET RIA PFB URG GEL LAJ PGZ GPB PTO TOW CKS SJK").split(" "));
const nacional = (o?: string, d?: string) => BR.has(String(o || "").trim().toUpperCase()) && BR.has(String(d || "").trim().toUpperCase());
const IG_PADRAO = "https://www.instagram.com/voecomkennedy/";
const JANELA_PRE = 6 * H;   // até 6h de atraso para mensagens antes da viagem
const JANELA_VOLTA = 24 * H;

const pad = (n: number) => String(n).padStart(2, "0");
const localParts = (d: Date) => {
  const l = new Date(d.getTime() + TZ * H);
  return { y: l.getUTCFullYear(), m: l.getUTCMonth() + 1, d: l.getUTCDate(), h: l.getUTCHours(), mi: l.getUTCMinutes() };
};
const atLocal = (y: number, m: number, d: number, h: number, mi = 0) => new Date(Date.UTC(y, m - 1, d, h - TZ, mi));
const fromLocalStr = (data: string, hora: string) => {
  const [y, m, d] = data.slice(0, 10).split("-").map(Number);
  const [h, mi] = (hora || "00:00").split(":").map(Number);
  return atLocal(y, m, d, h, mi || 0);
};
const dayIdx = (d: Date) => Math.floor((d.getTime() + TZ * H) / 86400e3);
const ddmm = (d: Date) => { const p = localParts(d); return `${pad(p.d)}/${pad(p.m)}`; };

// Nada sai entre 21h e 8h: se cair nessa faixa, sai às 20h (do mesmo dia se for depois das 21h, do dia anterior se for madrugada)
function ajustarSilencio(t: Date): Date {
  const p = localParts(t);
  if (p.h >= 21) return atLocal(p.y, p.m, p.d, 20);
  if (p.h < 8) return new Date(atLocal(p.y, p.m, p.d, 20).getTime() - 24 * H);
  return t;
}

function primeiroNome(n?: string): string {
  if (!n) return "";
  const w = n.trim().split(/\s+/)[0] || "";
  return (w === w.toUpperCase() || w === w.toLowerCase()) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w;
}

function telefone(t?: string): string | null {
  const d = (t || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

type Evento = { venda: any; cliente: any; tipo: "48h" | "24h" | "dia" | "volta_checkin" | "volta"; quando: Date; embarque: Date; _ig?: string };

function montarEventos(vendas: any[], pessoas: any[]): Evento[] {
  const out: Evento[] = [];
  const vistos = new Set<string>(); // mesmo cliente + mesmo voo em vendas diferentes = uma mensagem só
  const add = (e: Evento) => {
    const t = telefone(e.cliente?.telefone);
    // compara celular brasileiro ignorando o nono dígito (DDD + últimos 8 números)
    const quem = t ? (t.startsWith("55") && t.length >= 12 ? t.slice(2, 4) + t.slice(-8) : t) : (e.cliente?.id || e.venda.id);
    const k = `${quem}|${e.tipo}|${e.embarque.getTime()}|${e.venda.origem}|${e.venda.destino}`;
    if (vistos.has(k)) return;
    vistos.add(k); out.push(e);
  };
  for (const v of vendas) {
    if (v?.statusVenda !== "emitida" || !v?.dataEmbarque || !v?.horaEmbarque) continue;
    const emb = fromLocalStr(v.dataEmbarque, v.horaEmbarque);
    const cliente = pessoas.find((p) => p?.id === v.clienteId) || null;
    add({ venda: v, cliente, tipo: "48h", quando: ajustarSilencio(new Date(emb.getTime() - 48 * H)), embarque: emb });
    add({ venda: v, cliente, tipo: "24h", quando: ajustarSilencio(new Date(emb.getTime() - 24 * H)), embarque: emb });
    add({ venda: v, cliente, tipo: "dia", quando: ajustarSilencio(new Date(emb.getTime() - 4 * H)), embarque: emb });
    if (v.dataVolta && v.horaVolta) {
      const volta = fromLocalStr(v.dataVolta, v.horaVolta);
      if (volta.getTime() - emb.getTime() >= 48 * H) {
        add({ venda: v, cliente, tipo: "volta_checkin", quando: ajustarSilencio(new Date(volta.getTime() - 24 * H)), embarque: volta });
      }
    }
    if (v.dataVolta) {
      const [y, m, d] = String(v.dataVolta).slice(0, 10).split("-").map(Number);
      add({ venda: v, cliente, tipo: "volta", quando: atLocal(y, m, d + 1, 10), embarque: emb });
    }
  }
  return out;
}

function devido(e: Evento, agora: Date): boolean {
  const t = agora.getTime(), q = e.quando.getTime();
  if (e.tipo === "volta") return t >= q && t < q + JANELA_VOLTA;
  return t >= q && t < q + JANELA_PRE && t < e.embarque.getTime();
}

function texto(e: Evento): string {
  const v = e.venda;
  const nome = primeiroNome(e.cliente?.nome);
  const oi = nome ? `Oi, ${nome}!` : "Oi!";
  const dif = dayIdx(e.embarque) - dayIdx(e.quando);
  const quando = dif === 0 ? "hoje" : dif === 1 ? "amanhã" : `no dia ${ddmm(e.embarque)}`;
  if (e.tipo === "48h") {
    const nac = nacional(v.origem, v.destino);
    return `${oi} Aqui é o Kennedy, da VoeComKennedy 😊\n\n` +
      `Sua viagem está chegando! Separei algumas dicas:\n\n` +
      (nac
        ? `🕑 *Chegue com antecedência*\n2 horas antes do voo. Em aeroporto grande, 3 horas.\n\n📄 *Documento*\nRG ou CNH com foto, físico ou digital.\n\n`
        : `🕑 *Chegue com antecedência*\n3 horas antes do voo.\n\n🛂 *Passaporte*\nLeve o passaporte válido e confira se o destino pede visto ou vacina.\n\n`) +
      `📲 *Check-in*\nFaça pelo app ou site da companhia assim que abrir.\n\n` +
      `🧳 *Mala despachada*\nVá direto ao balcão da companhia quando chegar.\n\n` +
      `⏰ *Atenção ao horário*\nA passagem mostra a hora da decolagem. O portão fecha antes disso. Confira no cartão de embarque a hora do embarque e o portão.\n\n` +
      `Qualquer dúvida, é só me chamar aqui.`;
  }
  if (e.tipo === "24h") {
    const frase = dif === 0 ? "Sua viagem é hoje." : dif === 1 ? "Sua viagem é amanhã." : `Sua viagem é no dia ${ddmm(e.embarque)}.`;
    return `${oi} ✈️\n\n${frase}\nJá conseguiu fazer o check-in?\n\nSe tiver qualquer problema, me chama aqui que eu te ajudo.`;
  }
  if (e.tipo === "volta_checkin") {
    return `${oi} Tudo certo por aí? 😊\n\nSeu voo de volta é ${quando}.\nJá conseguiu fazer o check-in?\n\nSe precisar de ajuda, é só me chamar aqui.`;
  }
  if (e.tipo === "dia") {
    const rel = dif === 0 ? "Hoje" : dif === 1 ? "Amanhã" : `Dia ${ddmm(e.embarque)}`;
    const vocativo = nome ? `, ${nome}` : "";
    const ig = e._ig || IG_PADRAO;
    return `${rel} é dia de viagem${vocativo}! 🧳\n\nBoa viagem e aproveite muito.\n\n📸 Se postar alguma foto, marca a gente no Instagram:\n${ig}`;
  }
  return `${oi} Chegou bem? 😊\n\nQueria saber como foi a viagem e se correu tudo certo com os voos.\n\nSua opinião me ajuda a melhorar o atendimento.`;
}

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o, null, 2), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cfg, error: cfgErr } = await sb.from("pos_venda_config").select("*").eq("id", 1).single();
  if (cfgErr || !cfg) return json({ erro: "configuração não encontrada" }, 500);
  if (req.headers.get("x-cron-key") !== cfg.chave_cron) return json({ erro: "não autorizado" }, 401);

  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const agora = url.searchParams.get("agora") ? new Date(url.searchParams.get("agora")!) : new Date();

  const { data: linhas, error: dErr } = await sb.from("dados_app").select("conteudo");
  if (dErr) return json({ erro: "falha ao ler dados_app", detalhe: dErr.message }, 500);
  const vendas: any[] = [], pessoas: any[] = [];
  for (const l of linhas || []) {
    vendas.push(...(l.conteudo?.emissao_vendas || []));
    pessoas.push(...(l.conteudo?.emissao_pessoas || []));
  }
  const eventos = montarEventos(vendas, pessoas);
  for (const e of eventos) e._ig = cfg.instagram || "";
  const modo = cfg.modo_teste ? "teste" : "real";

  if (dry) {
    const futuros = eventos.filter((e) => e.quando.getTime() >= agora.getTime() - 24 * H)
      .sort((a, b) => a.quando.getTime() - b.quando.getTime())
      .map((e) => {
        const p = localParts(e.quando);
        const tel = telefone(e.cliente?.telefone);
        return {
          venda: e.venda.id, tipo: e.tipo, rota: `${e.venda.origem} → ${e.venda.destino}`,
          envio_brasilia: `${pad(p.d)}/${pad(p.m)}/${p.y} ${pad(p.h)}:${pad(p.mi)}`,
          cliente: primeiroNome(e.cliente?.nome) || "(sem cliente)",
          telefone: tel ? "..." + tel.slice(-4) : "SEM TELEFONE",
          devido_agora: devido(e, agora),
        };
      });
    const exemplo = eventos.find((e) => devido(e, agora));
    const segredos = Object.keys(Deno.env.toObject()).filter((k) => /zapi/i.test(k)).map((k) => JSON.stringify(k));
    return json({ modo, ativo: cfg.ativo, segredos_zapi: segredos, agora: agora.toISOString(), total: futuros.length, agenda: futuros,
      exemplo_texto: exemplo ? texto(exemplo) : null });
  }

  const inst = Deno.env.get("ZAPI_INSTANCE_ID"), tok = Deno.env.get("ZAPI_TOKEN"), ct = Deno.env.get("ZAPI_CLIENT_TOKEN");
  if (!inst || !tok) return json({ erro: "credenciais do Z-API não configuradas (ZAPI_INSTANCE_ID e ZAPI_TOKEN)" }, 500);
  const enviar = async (phone: string, message: string) => {
    const r = await fetch(`https://api.z-api.io/instances/${inst}/token/${tok}/send-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(ct ? { "Client-Token": ct } : {}) },
      body: JSON.stringify({ phone, message }),
    });
    const corpo = (await r.text()).slice(0, 500);
    return { ok: r.ok && /messageId|zaapId/.test(corpo), corpo };
  };

  if (url.searchParams.get("previa") === "1") {
    const futuros = eventos.filter((e) => e.embarque.getTime() > agora.getTime());
    const nac = futuros.find((e) => e.tipo === "48h" && nacional(e.venda.origem, e.venda.destino));
    const intl = futuros.find((e) => e.tipo === "48h" && !nacional(e.venda.origem, e.venda.destino));
    const amostras = [nac, intl, ...(["24h", "volta_checkin", "dia", "volta"] as const).map((t) => futuros.find((e) => e.tipo === t))]
      .filter(Boolean) as Evento[];
    const out: any[] = [];
    for (const e of amostras) {
      const rotulo = e.tipo === "48h" ? (nacional(e.venda.origem, e.venda.destino) ? "48h nacional" : "48h internacional") : e.tipo;
      const r = await enviar(cfg.numero_teste, `🧪 PRÉVIA | ${rotulo}\n\n` + texto(e));
      out.push({ tipo: rotulo, enviado: r.ok });
      await new Promise((ok) => setTimeout(ok, 2000));
    }
    return json({ previa: out });
  }

  if (!cfg.ativo) return json({ ok: true, msg: "automação desativada" });

  const devidos = eventos.filter((e) => devido(e, agora));
  if (!devidos.length) return json({ ok: true, enviados: 0 });

  const { data: ja } = await sb.from("pos_venda_envios").select("venda_id,tipo,modo,status")
    .in("venda_id", [...new Set(devidos.map((e) => e.venda.id))]);
  const feito = new Set((ja || []).map((r) => `${r.venda_id}|${r.tipo}|${r.modo}|${r.status}`));

  const res: any[] = [];
  for (const e of devidos) {
    const chave = `${e.venda.id}|${e.tipo}|${modo}`;
    if (feito.has(chave + "|enviado")) continue;
    const telCliente = telefone(e.cliente?.telefone);
    const nomeCompleto = e.cliente?.nome || "(sem cliente)";
    if (modo === "real" && !telCliente) {
      if (!feito.has(chave + "|erro")) {
        await sb.from("pos_venda_envios").insert({ venda_id: e.venda.id, tipo: e.tipo, modo, status: "erro",
          cliente_nome: nomeCompleto, agendado_para: e.quando.toISOString(), detalhe: "cliente sem telefone" });
      }
      res.push({ venda: e.venda.id, tipo: e.tipo, status: "sem telefone" });
      continue;
    }
    const destino = modo === "teste" ? cfg.numero_teste : telCliente!;
    let msg = texto(e);
    if (modo === "teste") msg = `🧪 TESTE | ${e.tipo} | para ${nomeCompleto} (${telCliente || "sem telefone"})\n\n` + msg;
    const r = await enviar(destino, msg);
    const corpo = r.corpo;
    const status = r.ok ? "enviado" : "erro";
    if (status === "enviado" || !feito.has(chave + "|erro")) {
      await sb.from("pos_venda_envios").insert({ venda_id: e.venda.id, tipo: e.tipo, modo, status,
        cliente_nome: nomeCompleto, telefone: destino, agendado_para: e.quando.toISOString(), detalhe: corpo });
    }
    res.push({ venda: e.venda.id, tipo: e.tipo, status });
    await new Promise((ok) => setTimeout(ok, 3000));
  }
  return json({ ok: true, modo, resultados: res });
});
