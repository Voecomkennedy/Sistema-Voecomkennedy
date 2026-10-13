// Somente candidato. Integrar ao receptor identificado antes de habilitar; não é webhook.
import { privateCallbackEvents } from '../../../../js/atendimento-adapters.mjs';
export async function fanoutCandidate(payload, { enqueueLegacy, enqueuePrivate, privateEnabled=false, privateConfig }) {
    // Consumidor antigo recebe todos os eventos intactos, incluindo grupos.
    const envelope=structuredClone(payload);
    const isPrivate = privateEnabled===true && privateCallbackEvents(envelope,privateConfig).length>0;
    const jobs = [Promise.resolve().then(()=>enqueueLegacy(structuredClone(envelope)))];
    if (isPrivate) jobs.push(Promise.resolve().then(()=>enqueuePrivate(structuredClone(envelope))));
    const results = await Promise.allSettled(jobs);
    return { legacy:results[0].status, atendimento:isPrivate ? results[1].status : 'ignorado', retryLegacy:results[0].status === 'rejected', retryAtendimento:isPrivate && results[1].status === 'rejected' };
}
