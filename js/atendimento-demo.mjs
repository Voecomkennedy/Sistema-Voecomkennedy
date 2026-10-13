import { createSyntheticService } from './atendimento-domain.mjs';
export const DEMO_OWNER = 'demo-owner';
export const DEMO_SOURCE = {
    emissao_pessoas: [{ id: 'p-ana', tipo: 'cliente', nome: 'Ana Exemplo' }, { id: 'p-bruno', tipo: 'cliente', nome: 'Bruno Exemplo' }],
    emissao_cotacoes: [{ id: 'q-ana', clienteId: 'p-ana', origem: 'GYN', destino: 'GRU', status: 'enviada' }, { id: 'q-bruno', clienteId: 'p-bruno', origem: 'BSB', destino: 'REC', status: 'rascunho' }],
    emissao_vendas: [{ id: 'v-ana', clienteId: 'p-ana', origem: 'GYN', destino: 'GRU', valorVenda: 1500, valorRecebido: 1000, valorReembolsadoCliente: 100, statusPagamento: 'parcial', statusVenda: 'emitida' }]
};
export function demoPdf() {
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    const stream = 'BT /F1 20 Tf 50 770 Td (Proposta sintetica - sem valor comercial) Tj ET';
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i+1} 0 obj\n${object}\nendobj\n`; });
    const start = pdf.length;
    pdf += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n` + offsets.slice(1).map(n => String(n).padStart(10,'0') + ' 00000 n \n').join('');
    pdf += `trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
    return new TextEncoder().encode(pdf);
}
export function createDemo({ financialSummary, now } = {}) {
    const service = createSyntheticService({ owner: DEMO_OWNER, source: DEMO_SOURCE, financialSummary, now });
    for (const [messageId, phone, text, at] of [
        ['in-ana-1', '+5562999990001', 'Olá! Quero conferir minha proposta para São Paulo.', '2026-10-13T09:00:00Z'],
        ['in-bruno-1', '+5561999990002', 'Você pode cotar Recife para novembro?', '2026-10-13T08:30:00Z'],
        ['in-ana-2', '+5562999990001', 'Pode incluir a bagagem no PDF?', '2026-10-13T09:05:00Z']
    ]) service.ingest(DEMO_OWNER, { type: 'message', instance: 'mock', messageId, phone, fromMe: false, status: 'entregue', text, at });
    const chats = service.list(DEMO_OWNER);
    service.link(DEMO_OWNER, chats.find(c => c.phone.endsWith('0001')).id, { clienteId: 'p-ana', cotacaoId: 'q-ana', vendaId: 'v-ana', origemContato: 'Indicação informada pelo contato (exemplo)', etiquetas: ['Proposta', 'Bagagem'] });
    service.link(DEMO_OWNER, chats.find(c => c.phone.endsWith('0002')).id, { clienteId: 'p-bruno', cotacaoId: 'q-bruno', etiquetas: ['Novo contato'] });
    return service;
}
