// Primeira fatia: somente repositório e transporte sintéticos, sem rede ou cache comercial.
import { normalizarTelefone } from './messages-domain.mjs';
export const CONFIG = Object.freeze({ enabled: false, mode: 'sintetico' });
export const clone = value => structuredClone(value);
const fail = (message, status = 422) => { throw Object.assign(new Error(message), { status }); };
const id = value => typeof value === 'string' && /^[\w:@.+-]{1,160}$/.test(value);
const time = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fail('Data inválida.');
const ranks = { pendente: 0, aceita: 1, entregue: 2, lida: 3 };
const key = (...parts) => JSON.stringify(parts);
export function identity({ phone, lid }) {
    const normalized = phone ? normalizarTelefone(phone) : null;
    if (phone && !normalized) fail('Telefone inválido.');
    if (lid && !/^\d{5,30}@lid$/.test(lid)) fail('LID inválido.');
    if (!normalized && !lid) fail('Contato sem identidade.');
    return { phone: normalized, lid: lid || null };
}
export function demoAllowed(location, config = CONFIG) {
    return config.mode === 'sintetico' && ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)
        && new URLSearchParams(location.search).get('demo') === '1';
}
export function commercialContext(source, chat, financialSummary) {
    // A fonte deve ser obtida pelo servidor usando Auth, nunca por cache sem dono.
    const person = (source.emissao_pessoas || []).find(p => String(p.id) === chat.clienteId);
    const quotes = (source.emissao_cotacoes || []).filter(q => String(q.clienteId) === chat.clienteId);
    const sales = (source.emissao_vendas || []).filter(s => String(s.clienteId) === chat.clienteId);
    return {
        cliente: person ? { id: String(person.id), nome: person.nome } : null,
        cotacoes: quotes.map(q => ({ id: String(q.id), origem: q.origem, destino: q.destino, status: q.status })),
        vendas: sales.map(s => ({ id: String(s.id), origem: s.origem, destino: s.destino, arquivada: !!s.excluidaEm,
            vinculada: chat.vendaId === String(s.id), recebidoLiquido: financialSummary(s).receitaRealizada })),
        origemContato: chat.origemContato || 'Não informada',
        atribuicao: 'Vínculo manual; não comprova origem da venda nem comissão.'
    };
}
export function createSyntheticService({ owner, now = () => new Date().toISOString(), uuid = () => crypto.randomUUID(), source = {}, financialSummary = () => ({ receitaRealizada: null }) }) {
    if (!id(owner)) fail('Proprietário inválido.', 401);
    let state = { version: 1, mode: 'sintetico', owner, chats: [], messages: [], events: [], files: [] };
    const authorized = actor => { if (actor !== owner) fail('Acesso negado.', 403); };
    const chatFor = cid => state.chats.find(c => c.id === cid) || fail('Conversa não encontrada.', 404);
    const messageFor = mid => state.messages.find(m => m.id === mid) || fail('Mensagem não encontrada.', 404);
    const event = (type, details) => state.events.push({ id: uuid(), type, at: time(now()), ...clone(details) });
    const resolve = address => {
        const peers = state.chats.filter(c => (address.phone && c.phone === address.phone) || (address.lid && c.lid === address.lid));
        if (peers.length > 1) fail('Telefone e LID apontam para conversas distintas; revisão manual.', 409);
        let chat = peers[0];
        if (chat) {
            if ((address.phone && chat.phone && address.phone !== chat.phone) || (address.lid && chat.lid && address.lid !== chat.lid)) fail('Identidade conflitante; revisão manual.', 409);
            // Alias comprovado somente em um mesmo evento de contato recebido, não por semelhança.
            chat.phone ||= address.phone; chat.lid ||= address.lid;
        } else {
            chat = { id: uuid(), ...address, nome: address.phone ? '+' + address.phone : address.lid, clienteId: null, vendaId: null, cotacaoId: null, origemContato: '', etiquetas: [], readIds: [] };
            state.chats.push(chat);
        }
        return chat;
    };
    function ingest(actor, input) {
        authorized(actor);
        if (input.isGroup || input.isNewsletter) return { ignored: 'grupo_ou_canal' };
        if (!id(input.instance) || !id(input.messageId) || !['message', 'status'].includes(input.type)) fail('Evento inválido.');
        if (!Object.hasOwn(ranks, input.status)) fail('Estado inválido.');
        const at = time(input.at), address = identity(input);
        const dedupe = key(input.instance, input.type, input.messageId, input.type === 'status' ? input.status : 'conteudo');
        if (state.events.some(e => e.dedupe === dedupe)) return { duplicate: true };
        const existing = state.messages.find(m => m.instance === input.instance && m.providerId === input.messageId);
        if (input.type === 'status') {
            if (existing && ((address.phone && existing.phone && address.phone !== existing.phone) || (address.lid && existing.lid && address.lid !== existing.lid))) fail('Status de outro contato.', 409);
            event('status', { dedupe, instance: input.instance, providerId: input.messageId, status: input.status, at, ...address });
            if (existing && existing.direction === 'out') existing.status = ranks[input.status] > ranks[existing.status] ? input.status : existing.status;
            return { pending: !existing };
        }
        if (typeof input.fromMe !== 'boolean' || typeof input.text !== 'string' || input.text.length > 10000) fail('Conteúdo inválido.');
        const statuses = state.events.filter(e => e.type === 'status' && e.instance === input.instance && e.providerId === input.messageId);
        if (statuses.some(e => (e.phone && address.phone && e.phone !== address.phone) || (e.lid && address.lid && e.lid !== address.lid))) fail('Status pendente de outro contato.', 409);
        if (existing && existing.direction !== (input.fromMe ? 'out' : 'in')) fail('Direção de mensagem conflitante.', 409);
        if (existing && ((address.phone && existing.phone && address.phone !== existing.phone) || (address.lid && existing.lid && address.lid !== existing.lid))) fail('Mensagem de outro contato.', 409);
        const chat = resolve(address);
        if (existing && existing.chatId !== chat.id) fail('Mensagem pertence a outra conversa.', 409);
        let message = existing;
        if (!message) {
            message = { id: uuid(), chatId: chat.id, ...address, instance: input.instance, providerId: input.messageId, direction: input.fromMe ? 'out' : 'in', text: input.text, at, status: input.status, attachmentId: null, mode: 'sintetico' };
            state.messages.push(message);
        }
        if (message.direction === 'out') {
            for (const status of [input, ...statuses]) if (ranks[status.status] > ranks[message.status]) message.status = status.status;
        }
        event('message', { dedupe, instance: input.instance, providerId: input.messageId, chatId: chat.id, at });
        // Callback não agenda resposta, não cria outbox e não reenvia mensagem própria.
        return { chatId: chat.id, messageId: message.id };
    }
    function list(actor, { search = '', unread = false, label = '' } = {}) {
        authorized(actor);
        const needle = search.toLocaleLowerCase('pt-BR');
        return clone(state.chats.map(c => {
            const messages = state.messages.filter(m => m.chatId === c.id).sort((a,b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
            return { ...c, unread: messages.filter(m => m.direction === 'in' && !c.readIds.includes(m.id)).length, last: messages.at(-1) || null, context: commercialContext(source, c, financialSummary) };
        }).filter(c => (!unread || c.unread > 0) && (!label || c.etiquetas.includes(label)) &&
            (!needle || [c.nome, c.phone, c.lid, ...c.etiquetas, ...state.messages.filter(m => m.chatId === c.id).map(m => m.text)].join(' ').toLocaleLowerCase('pt-BR').includes(needle)))
            .sort((a,b) => (b.last?.at || '').localeCompare(a.last?.at || '')));
    }
    function read(actor, cid) {
        authorized(actor); const chat = chatFor(cid);
        // Marca IDs vistos; uma mensagem atrasada ainda é não lida, mesmo com timestamp anterior.
        chat.readIds = state.messages.filter(m => m.chatId === cid && m.direction === 'in').map(m => m.id);
    }
    function link(actor, cid, { clienteId = null, cotacaoId = null, vendaId = null, origemContato = '', etiquetas = [] }) {
        authorized(actor); const chat = chatFor(cid);
        if (typeof origemContato !== 'string' || origemContato.length > 120 || !Array.isArray(etiquetas) || etiquetas.length > 10 || etiquetas.some(t => typeof t !== 'string' || !t.trim() || t.length > 40)) fail('Origem ou etiquetas inválidas.');
        if (clienteId && !(source.emissao_pessoas || []).some(p => String(p.id) === clienteId && p.tipo === 'cliente')) fail('Cliente fora da fonte autorizada.');
        for (const [recordId, rows] of [[cotacaoId, source.emissao_cotacoes], [vendaId, source.emissao_vendas]]) {
            if (recordId && !(rows || []).some(r => String(r.id) === recordId && String(r.clienteId) === clienteId)) fail('Vínculo comercial incompatível.');
        }
        Object.assign(chat, { clienteId, cotacaoId, vendaId, origemContato: origemContato.trim(), etiquetas: [...new Set(etiquetas.map(t => t.trim()))] });
        event('link', { chatId: cid, clienteId, cotacaoId, vendaId, origemContato });
    }
    function compose(actor, cid, { text = '', attachmentId = null, requestId }) {
        authorized(actor); const chat = chatFor(cid);
        if (!chat.phone) fail('LID ainda sem telefone comprovado.');
        if (!id(requestId) || typeof text !== 'string' || text.length > 10000 || (!text.trim() && !attachmentId)) fail('Mensagem inválida.');
        if (attachmentId && !state.files.some(f => f.id === attachmentId && f.chatId === cid)) fail('Anexo de outra conversa.');
        const prior = state.messages.find(m => m.requestId === requestId);
        if (prior) {
            if (prior.chatId !== cid || prior.text !== text.trim() || prior.attachmentId !== attachmentId) fail('Chave reutilizada com outro conteúdo.', 409);
            return clone(prior);
        }
        const message = { id: uuid(), chatId: cid, phone: chat.phone, lid: chat.lid, instance: 'mock', requestId, direction: 'out', text: text.trim(), attachmentId, at: time(now()), status: 'pendente', mode: 'sintetico', attempt: 0, result: 'pendente' };
        state.messages.push(message); event('compose', { messageId: message.id, chatId: cid }); return clone(message);
    }
    async function dispatch(actor, mid, transport) {
        authorized(actor); const message = messageFor(mid);
        if (transport?.mode !== 'sintetico') fail('Transporte real indisponível nesta fatia.', 403);
        if (!['pendente', 'falha_segura'].includes(message.result) || message.direction !== 'out' || !message.requestId) fail('Tentativa bloqueada.', 409);
        if (message.attempt >= 3) fail('Limite de tentativas atingido.', 409);
        // Reserva síncrona antes do await: impede concorrência na demonstração.
        message.result = 'tentativa'; message.attempt++; event('attempt', { messageId: mid, attempt: message.attempt });
        try {
            const outcome = await transport.send(clone(message));
            if (outcome?.definitelyNotSent === true && !outcome.providerId) message.result = 'falha_segura';
            else if (id(outcome?.providerId) && !state.messages.some(m => m.id !== mid && m.instance === 'mock' && m.providerId === outcome.providerId)) {
                message.result = 'simulada'; message.providerId = outcome.providerId; message.status = 'aceita';
            } else message.result = 'incerto';
        } catch { message.result = 'incerto'; }
        event('result', { messageId: mid, result: message.result }); return clone(message);
    }
    async function archive(actor, cid, { name, bytes, mime = 'application/pdf' }) {
        authorized(actor); chatFor(cid);
        const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        if (mime !== 'application/pdf' || typeof name !== 'string' || !/\.pdf$/i.test(name) || name.length > 120 || (/[/\\]/.test(name) || [...name].some(c => c.charCodeAt(0) < 32)) || data.length > 5 * 1024 * 1024 || data.length < 5 || new TextDecoder().decode(data.slice(0, 5)) !== '%PDF-') fail('Use um PDF de até 5 MB.');
        const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), x => x.toString(16).padStart(2,'0')).join('');
        const file = { id: uuid(), chatId: cid, name, mime, sha256, size: data.length, bytes: Array.from(data), path: '', mode: 'sintetico' };
        file.path = `${owner}/${cid}/${file.id}.pdf`; state.files.push(file); event('archive', { attachmentId: file.id, chatId: cid }); return clone(file);
    }
    async function restore(actor, backup) {
        authorized(actor);
        // Restaurar somente pacotes produzidos pela demo, sem mesclar com dados comerciais.
        if (backup?.version !== 1 || backup.mode !== 'sintetico' || backup.owner !== owner || !['chats','messages','events','files'].every(k => Array.isArray(backup[k]))) fail('Backup incompatível.');
        const candidate = clone(backup), chats = new Set(candidate.chats.map(c => c.id));
        for (const rows of [candidate.chats, candidate.messages, candidate.events, candidate.files]) if (new Set(rows.map(r => r.id)).size !== rows.length || rows.some(r => !id(r.id))) fail('IDs inválidos no backup.');
        if (candidate.chats.some(c => !Array.isArray(c.etiquetas) || !Array.isArray(c.readIds))) fail('Conversa inválida no backup.');
        for (const m of candidate.messages) if (!chats.has(m.chatId) || !['in','out'].includes(m.direction) || !Object.hasOwn(ranks, m.status) || typeof m.text !== 'string' || !Number.isFinite(Date.parse(m.at)) || (m.attachmentId && !candidate.files.some(f => f.id === m.attachmentId && f.chatId === m.chatId))) fail('Mensagem inválida no backup.');
        for (const f of candidate.files) {
            if (!chats.has(f.chatId) || f.path !== `${owner}/${f.chatId}/${f.id}.pdf` || !Array.isArray(f.bytes) || f.bytes.length !== f.size || f.size > 5 * 1024 * 1024 || f.bytes.some(b => !Number.isInteger(b) || b < 0 || b > 255)) fail('Arquivo inválido no backup.');
            const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(f.bytes))), x => x.toString(16).padStart(2,'0')).join('');
            if (digest !== f.sha256) fail('Arquivo ausente ou corrompido.');
        }
        state = candidate; // Só troca depois de validar todos os bytes; falha não apaga estado atual.
    }
    return { mode: 'sintetico', ingest, list, read, link, compose, dispatch, archive, restore,
        export: actor => { authorized(actor); return clone(state); },
        messages: (actor, cid) => { authorized(actor); chatFor(cid); return clone(state.messages.filter(m => m.chatId === cid).sort((a,b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))); },
        file: (actor, fid) => { authorized(actor); return clone(state.files.find(f => f.id === fid) || fail('Arquivo não encontrado.',404)); }
    };
}
