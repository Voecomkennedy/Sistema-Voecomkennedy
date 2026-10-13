import { identity } from './atendimento-domain.mjs';
const statuses = { PENDING: 'pendente', SENT: 'aceita', RECEIVED: 'entregue', READ: 'lida', PLAYED: 'lida' };
// Subconjunto documentado. Sem fetch, credenciais, configuração ou entrypoint de webhook.
export function normalizeZapi(payload, { instance, connectedPhone }) {
    if (!instance || payload.instanceId !== instance) throw new Error('Instância incompatível.');
    if (payload.isGroup === true || payload.isNewsletter === true || /@g\.us$/.test(payload.phone || '')) return [];
    if (payload.isGroup !== false || payload.broadcast || payload.isEdit || payload.waitingMessage) return [];
    if (!Number.isSafeInteger(payload.momment)) throw new Error('Timestamp inválido.');
    const at = new Date(payload.momment).toISOString();
    const status = statuses[payload.status];
    if (!status) return []; // READ_BY_ME não significa leitura pelo destinatário.
    if (payload.type === 'MessageStatusCallback') {
        if (!Array.isArray(payload.ids) || payload.ids.some(x => typeof x !== 'string')) throw new Error('IDs inválidos.');
        const address = identity({ phone: payload.phone });
        return payload.ids.map(messageId => ({ type: 'status', instance, messageId, ...address, status, at }));
    }
    if (payload.type !== 'ReceivedCallback' || payload.connectedPhone !== connectedPhone || typeof payload.fromMe !== 'boolean' || typeof payload.text?.message !== 'string') return [];
    // senderLid em callback próprio pode identificar o remetente (nós), não o destinatário.
    const address = identity({ phone: payload.phone, lid: payload.fromMe ? null : payload.senderLid });
    return [{ type: 'message', instance, messageId: payload.messageId, ...address, fromMe: payload.fromMe, text: payload.text.message, at, status }];
}
export function mockTransport({ outcome = 'success' } = {}) {
    return { mode: 'sintetico', send(message) {
        if (outcome === 'uncertain') throw new Error('Timeout sintético.');
        if (outcome === 'failure') return { definitelyNotSent: true };
        return { providerId: 'mock-' + message.requestId };
    } };
}
// Não implementa envio real. Mesmo habilitado, o frontend exige resultado sintético.
export function createAtendimentoApi(client) {
    return { async list() {
        const result = await client.functions.invoke('atendimento', { body: { acao: 'listar' } });
        if (result.error || result.data?.mode !== 'sintetico') throw new Error('Atendimento indisponível.');
        return result.data;
    } };
}
