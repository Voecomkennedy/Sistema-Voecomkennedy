// Domínio compartilhado entre a Central e o servidor. Sem I/O ou credenciais.
export const TYPES = Object.freeze(['48h', '24h', 'dia', 'volta_checkin', 'volta']);
export const DEFAULT_CONFIG = Object.freeze({ pausado: true, fuso: 'America/Sao_Paulo', silencioInicio: '21:00', silencioFim: '08:00', numeroTeste: '' });
export const defaultViagem = Object.freeze({ emissaoConfirmada: false, fusoIda: '', fusoVolta: '', fusoChegada: '', chegadaFinal: '' });
export const previewContext = Object.freeze({ primeiro_nome: 'Maria', origem: 'GYN', destino: 'GRU', data_voo: '15/11/2026', hora_voo: '10:00', quando: 'amanhã' });
const variables = Object.keys(previewContext);
const model = (nome, texto, antecedenciaMinutos, ativo = true) => Object.freeze({ nome, texto, ativo, antecedenciaMinutos, validadeMinutos: 15 });
export const DEFAULT_MODELOS = Object.freeze({
    '48h': model('Preparação da viagem', 'Oi, {{primeiro_nome}}! Sua viagem de {{origem}} para {{destino}} está chegando. ✈️\n\nConfira os documentos, a bagagem contratada e as orientações da companhia. Seu voo sai em {{data_voo}} às {{hora_voo}}, no horário local do aeroporto.\n\nQualquer dúvida, me chama aqui. — Kennedy', 2880),
    '24h': model('Check-in de ida', 'Oi, {{primeiro_nome}}! Seu voo de {{origem}} para {{destino}} é {{quando}}, às {{hora_voo}}.\n\nConfira o check-in no site ou aplicativo da companhia, conforme o prazo disponibilizado por ela. Se precisar de ajuda, me chama aqui.', 1440),
    dia: model('Boa viagem', 'Oi, {{primeiro_nome}}! Passando para desejar uma boa viagem! 🧳\n\nVoo {{origem}} → {{destino}}, em {{data_voo}} às {{hora_voo}} (horário local). Confira o horário de embarque e o portão no cartão.', 240),
    volta_checkin: model('Check-in de volta', 'Oi, {{primeiro_nome}}! Seu voo de volta é {{quando}}, às {{hora_voo}} (horário local).\n\nConfira se a companhia já disponibilizou o check-in. Precisa de ajuda?', 1440),
    volta: model('Após a chegada', 'Oi, {{primeiro_nome}}! Tudo bem depois da viagem? 😊\n\nComo foi sua experiência? Se puder indicar a VoeComKennedy para alguém, vou ficar muito feliz.', 1440, false)
});
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' ? x.trim() : '';
const fail = message => { throw new Error(message); };
const clock = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const timeMinutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const own = (o, key) => Object.hasOwn(o, key);
const validId = value => (typeof value === 'string' && value.trim().length > 0) || Number.isSafeInteger(value);

export function normalizarTelefone(value) {
    if (typeof value !== 'string') return null;
    const raw = value.trim();
    if (!/^\+?[\d\s().-]+$/.test(raw)) return null;
    const digits = raw.replace(/\D/g, '');
    if (!digits || /^(\d)\1+$/.test(digits)) return null;
    if (raw.startsWith('+')) return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
    if (/^[1-9]\d{9,10}$/.test(digits)) return '55' + digits;
    return /^[1-9]\d{11,14}$/.test(digits) ? digits : null;
}

const formatters = new Map();
function formatter(zone) {
    if (!formatters.has(zone)) {
        try {
            const f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
            // Bounded cache: preferences contain only a few zones at a time.
            if (formatters.size > 64) formatters.clear();
            formatters.set(zone, f);
        } catch { fail('Fuso horário inválido. Use um nome como America/Sao_Paulo.'); }
    }
    return formatters.get(zone);
}
function zoned(date, zone) {
    if (!Number.isFinite(date.getTime())) fail('Data e hora inválidas.');
    const parts = Object.fromEntries(formatter(zone).formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
export const instantToLocal = (instant, zone) => zoned(new Date(instant), zone);
function utcOfLocal(date, time) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !clock(time)) fail('Informe a data e a hora completas do voo.');
    const stamp = new Date(`${date}T${time}:00Z`);
    if (!Number.isFinite(stamp.getTime()) || stamp.toISOString().slice(0, 16) !== `${date}T${time}` || +date.slice(0, 4) < 2000 || +date.slice(0, 4) > 2100) fail('Data ou hora do voo inválida.');
    return stamp.getTime();
}

// Resolve o horário local sem depender do fuso do computador. Mudanças de DST
// que tornam uma hora inexistente ou ambígua exigem revisão, não um palpite.
export function localToInstant(date, time, zone) {
    if (!text(zone)) fail('Confirme o fuso horário do aeroporto.');
    const naive = utcOfLocal(date, time);
    const offsets = new Set();
    for (let hours = -36; hours <= 36; hours += 6) {
        const instant = new Date(naive + hours * 3600000);
        const local = zoned(instant, zone);
        offsets.add(Date.parse(`${local.date}T${local.time}:00Z`) - instant.getTime());
    }
    const matches = [...offsets].map(offset => new Date(naive - offset)).filter(instant => {
        const local = zoned(instant, zone);
        return local.date === date && local.time === time;
    });
    if (matches.length !== 1) fail('Horário local inexistente ou ambíguo por mudança de fuso. Revise o trecho.');
    return matches[0].toISOString();
}

function validateTemplate(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 4000) fail('O modelo precisa ter entre 1 e 4.000 caracteres.');
    const tokens = [...value.matchAll(/\{\{([^{}]*)\}\}/g)];
    for (const token of tokens) if (!variables.includes(token[1].trim())) fail(`Variável não permitida: ${token[1].trim()}.`);
    if (/[{}]/.test(value.replace(/\{\{([^{}]*)\}\}/g, ''))) fail('Use variáveis no formato {{primeiro_nome}}.');
    return value.replace(/\r\n?/g, '\n');
}
export function renderTemplate(value, context) {
    const template = validateTemplate(value);
    const result = template.replace(/\{\{([^{}]*)\}\}/g, (_, raw) => {
        const key = raw.trim();
        if (!object(context) || !own(context, key) || typeof context[key] !== 'string' || !context[key].trim()) fail(`Falta o valor de ${key} para montar a mensagem.`);
        // Values are literal; never evaluate templates a second time.
        return context[key];
    });
    if (result.length > 4000) fail('A mensagem preenchida ultrapassa 4.000 caracteres. Reduza o modelo.');
    return result;
}

export function validatePreferences(value) {
    if (!object(value) || !object(value.config) || !object(value.modelos) || !object(value.viagens)) fail('Configurações incompletas. Recarregue e tente novamente.');
    const c = value.config;
    if (typeof c.pausado !== 'boolean' || !text(c.fuso) || !clock(c.silencioInicio) || !clock(c.silencioFim) || c.silencioInicio === c.silencioFim) fail('Confira a pausa, o fuso e os horários de silêncio.');
    formatter(c.fuso);
    if (typeof c.numeroTeste !== 'string') fail('Número de teste inválido.');
    if (c.numeroTeste.trim() && !normalizarTelefone(c.numeroTeste)) fail('Número de teste inválido; para outro país, informe +DDI.');
    const config = { pausado: c.pausado, fuso: c.fuso.trim(), silencioInicio: c.silencioInicio, silencioFim: c.silencioFim, numeroTeste: c.numeroTeste.trim() ? '+' + normalizarTelefone(c.numeroTeste) : '' };
    const modelos = {};
    for (const tipo of TYPES) {
        const m = value.modelos[tipo];
        if (!object(m) || typeof m.ativo !== 'boolean') fail(`Confira o modelo ${tipo}.`);
        if (!Number.isInteger(m.antecedenciaMinutos) || m.antecedenciaMinutos < 0 || m.antecedenciaMinutos > 10080) fail('Antecedência deve ser um número inteiro entre 0 e 10.080 minutos.');
        if (!Number.isInteger(m.validadeMinutos) || m.validadeMinutos < 1 || m.validadeMinutos > 60) fail('Validade deve ser um número inteiro entre 1 e 60 minutos.');
        modelos[tipo] = { nome: DEFAULT_MODELOS[tipo].nome, texto: validateTemplate(m.texto), ativo: m.ativo, antecedenciaMinutos: m.antecedenciaMinutos, validadeMinutos: m.validadeMinutos };
    }
    const viagens = Object.create(null);
    if (Object.keys(value.viagens).length > 10000) fail('Há viagens demais nesta configuração.');
    for (const [id, v] of Object.entries(value.viagens)) {
        if (!id || id.length > 200 || !object(v) || typeof v.emissaoConfirmada !== 'boolean') fail('Revisão de viagem inválida.');
        for (const key of ['fusoIda', 'fusoVolta', 'chegadaFinal']) if (typeof v[key] !== 'string') fail('Preencha os dados de revisão da viagem.');
        if (v.fusoIda) formatter(v.fusoIda);
        if (v.fusoVolta) formatter(v.fusoVolta);
        if (v.fusoChegada !== undefined && typeof v.fusoChegada !== 'string') fail('Fuso da chegada inválido.');
        if (v.fusoChegada) formatter(v.fusoChegada);
        let chegadaFinal = v.chegadaFinal.trim();
        if (chegadaFinal) {
            if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(chegadaFinal)) fail('A chegada final deve incluir data, hora e fuso, por exemplo 2026-11-20T18:00:00-03:00.');
            // Validate the calendar as well: JS Date accepts 31/02 by rollover.
            utcOfLocal(chegadaFinal.slice(0, 10), chegadaFinal.slice(11, 16));
            const stamp = new Date(chegadaFinal);
            if (!Number.isFinite(stamp.getTime())) fail('Chegada final inválida.');
            chegadaFinal = stamp.toISOString();
        }
        viagens[id] = { emissaoConfirmada: v.emissaoConfirmada, fusoIda: v.fusoIda.trim(), fusoVolta: v.fusoVolta.trim(), fusoChegada: text(v.fusoChegada), chegadaFinal };
    }
    return { config, modelos, viagens };
}

export function emSilencio(instant, config) {
    const now = timeMinutes(zoned(new Date(instant), config.fuso).time);
    const start = timeMinutes(config.silencioInicio), end = timeMinutes(config.silencioFim);
    return start > end ? now >= start || now < end : now >= start && now < end;
}
function ajustarJanela(instant, config, after, validity) {
    let stamp = instant.getTime();
    if (!emSilencio(new Date(stamp), config)) return new Date(stamp);
    // Before flight: anticipate into the preceding allowed interval, with room
    // for one cron tick. After arrival: defer until the allowed interval starts.
    for (let i = 0; i < 1440 && emSilencio(new Date(stamp), config); i++) stamp += (after ? 1 : -1) * 60000;
    if (!after) {
        const candidate = stamp - (Math.max(validity, 15) - 1) * 60000;
        if (!emSilencio(new Date(candidate), config)) stamp = candidate;
    }
    return new Date(stamp);
}

export function contextoNoInstante(task, agora) {
    const event = zoned(new Date(task.embarque_em), task.fuso_voo);
    const today = zoned(new Date(agora), task.fuso_voo);
    const days = (Date.parse(event.date + 'T00:00:00Z') - Date.parse(today.date + 'T00:00:00Z')) / 86400000;
    const dateBR = event.date.split('-').reverse().join('/');
    return { ...task.contexto, data_voo: dateBR, hora_voo: event.time, quando: days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `no dia ${dateBR}` };
}

export function planejar({ userId, conteudo, origemVersao, preferencias, agora }) {
    if (!text(userId) || !Number.isSafeInteger(origemVersao) || origemVersao < 0 || !Number.isSafeInteger(preferencias?.versao) || preferencias.versao < 0) fail('Versão dos dados inválida.');
    const now = new Date(agora);
    if (!Number.isFinite(now.getTime())) fail('Relógio inválido.');
    const { config, modelos, viagens } = validatePreferences(preferencias);
    if (!object(conteudo) || !Array.isArray(conteudo.emissao_vendas) || !Array.isArray(conteudo.emissao_pessoas)) fail('Dados de vendas ou pessoas inválidos; a agenda foi preservada.');
    if (conteudo.emissao_cotacoes !== undefined && (!Array.isArray(conteudo.emissao_cotacoes) || conteudo.emissao_cotacoes.some(quote => !object(quote)))) fail('Dados de cotações inválidos; a agenda foi preservada.');
    const tarefas = [], pendencias = [];
    const sales = conteudo.emissao_vendas, people = conteudo.emissao_pessoas;
    const quotes = conteudo.emissao_cotacoes || [];
    const pending = (sale, codigo, mensagem) => pendencias.push({ venda_id: String(sale?.id ?? ''), codigo, mensagem });
    for (const sale of sales) {
        if (!object(sale) || !text(sale.id)) { pending(sale, 'venda_invalida', 'Venda sem identificação válida.'); continue; }
        if (sale.excluidaEm || sale.statusVenda !== 'emitida') continue;
        if (sales.filter(x => x?.id === sale.id).length !== 1) { pending(sale, 'duplicada', 'Identificação da venda duplicada; revise antes de agendar.'); continue; }
        const review = viagens[sale.id];
        if (!review?.emissaoConfirmada) { pending(sale, 'emissao_nao_confirmada', 'Confirme a emissão e os fusos em Regras para incluir esta viagem.'); continue; }
        const matches = validId(sale.clienteId) ? people.filter(x => object(x) && validId(x.id) && String(x.id) === String(sale.clienteId)) : [];
        const person = matches.length === 1 ? matches[0] : null;
        const phone = normalizarTelefone(person?.telefone);
        if (!person || !phone || !text(person.nome)) { pending(sale, 'contato_invalido', 'Confira o nome e o telefone do cliente; o contato precisa ser único.'); continue; }
        const origin = text(sale.origem).toUpperCase(), destination = text(sale.destino).toUpperCase();
        if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) { pending(sale, 'aeroporto_invalido', 'Confira os códigos dos aeroportos da viagem.'); continue; }
        // The current sales model stores only the outbound airports. Never
        // invent a reversed route when the linked quote has independent legs.
        const independentReturn = quotes.some(quote => {
            if (!object(quote) || String(quote.vendaId) !== sale.id || !object(quote.propostaCompleta)) return false;
            const proposal = quote.propostaCompleta;
            const airport = value => text(value).toUpperCase().match(/^[A-Z]{3}(?:\b|$)/)?.[0] || '';
            return Boolean(proposal.multitrecho) ||
                (Boolean(text(proposal.origVolta)) && airport(proposal.origVolta) !== destination) ||
                (Boolean(text(proposal.destVolta)) && airport(proposal.destVolta) !== origin);
        });
        let outbound;
        try { outbound = new Date(localToInstant(sale.dataEmbarque, sale.horaEmbarque, review.fusoIda)); }
        catch (e) { pending(sale, 'ida_invalida', e.message); continue; }
        let inbound = null;
        if (sale.dataVolta || sale.horaVolta) {
            if (independentReturn) {
                pending(sale, 'volta_multitrecho', 'Volta e pós-viagem suspensos: a cotação tem trechos independentes e a venda ainda não registra os aeroportos de retorno.');
            } else {
                try {
                    inbound = new Date(localToInstant(sale.dataVolta, sale.horaVolta, review.fusoVolta));
                    if (inbound <= outbound) fail('A volta deve ocorrer depois da ida.');
                } catch (e) { inbound = null; pending(sale, 'volta_invalida', e.message); }
            }
        }
        const rawName = person.nome.trim().split(/\s+/)[0];
        const first = rawName === rawName.toUpperCase() ? rawName[0] + rawName.slice(1).toLowerCase() : rawName;
        for (const type of TYPES) {
            const rule = modelos[type];
            if (!rule.ativo) continue;
            let flight = outbound, zone = review.fusoIda;
            if (type === 'volta_checkin' || type === 'volta') {
                if (!inbound) continue;
                flight = inbound; zone = review.fusoVolta;
            }
            if (type === 'volta') {
                if (!review.chegadaFinal || new Date(review.chegadaFinal) <= inbound) { pending(sale, 'chegada_nao_confirmada', 'Confirme a chegada final depois da partida de volta para preparar o pós-viagem.'); continue; }
                flight = new Date(review.chegadaFinal);
                zone = review.fusoChegada || config.fuso;
            }
            const desired = new Date(flight.getTime() + (type === 'volta' ? 1 : -1) * rule.antecedenciaMinutos * 60000);
            const due = ajustarJanela(desired, config, type === 'volta', rule.validadeMinutos);
            const expiry = new Date(Math.min(due.getTime() + rule.validadeMinutos * 60000, type === 'volta' ? Infinity : flight.getTime()));
            if (expiry <= due) { pending(sale, 'janela_invalida', `A regra ${rule.nome} não tem janela anterior ao voo. Ajuste a antecedência.`); continue; }
            const back = type === 'volta_checkin' || type === 'volta';
            const task = {
                venda_id: sale.id, tipo: type, modo: 'simulacao',
                chave_conversa: JSON.stringify([userId, phone, type, flight.toISOString(), back ? destination : origin, back ? origin : destination, 'simulacao']),
                agendado_em: due.toISOString(), expira_em: expiry.toISOString(), embarque_em: flight.toISOString(), destinatario: phone,
                origem_versao: origemVersao, preferencias_versao: preferencias.versao,
                fuso_voo: zone, fuso_operador: config.fuso,
                modelo_snapshot: { texto: rule.texto }, regra_snapshot: { antecedenciaMinutos: rule.antecedenciaMinutos, validadeMinutos: rule.validadeMinutos },
                contexto: { primeiro_nome: first, origem: back ? destination : origin, destino: back ? origin : destination }
            };
            task.contexto = contextoNoInstante(task, now);
            try { task.texto = renderTemplate(rule.texto, task.contexto); }
            catch (e) { pending(sale, 'modelo_invalido', e.message); continue; }
            tarefas.push(task);
        }
    }
    return { tarefas: tarefas.sort((a, b) => a.agendado_em.localeCompare(b.agendado_em)), pendencias };
}
