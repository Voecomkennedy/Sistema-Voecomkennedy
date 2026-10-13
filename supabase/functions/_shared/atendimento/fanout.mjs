// Somente candidato. Integrar a filas duráveis após mapear o receptor antigo; não é webhook.
export async function fanoutCandidate(payload, { enqueueLegacy, enqueuePrivate }) {
    // Consumidor antigo recebe todos os eventos intactos, incluindo grupos.
    const jobs = [Promise.resolve().then(()=>enqueueLegacy(structuredClone(payload)))];
    const isPrivate = payload.isGroup === false && !payload.isNewsletter && !/@g\.us$/.test(payload.phone || '');
    if (isPrivate) jobs.push(Promise.resolve().then(()=>enqueuePrivate(structuredClone(payload))));
    const results = await Promise.allSettled(jobs);
    return { legacy:results[0].status, atendimento:isPrivate ? results[1].status : 'ignorado', retryLegacy:results[0].status === 'rejected', retryAtendimento:isPrivate && results[1].status === 'rejected' };
}
