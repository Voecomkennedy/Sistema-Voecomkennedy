// Candidato testado por injeção. Nenhum entrypoint, credencial ou download real nesta etapa.
const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export async function copyProviderPdf({ owner, chatId, fileId, name, url }, { client, download, allowedHosts = [] }) {
    if (![owner,chatId,fileId].every(isUuid)) throw new Error('Identidade de arquivo inválida.');
    if (typeof name !== 'string' || !/\.pdf$/i.test(name) || name.length > 120 || /[/\\]/.test(name) || [...name].some(c=>c.charCodeAt(0)<32)) throw new Error('Nome inválido.');
    const source = new URL(url);
    if (source.protocol !== 'https:' || source.username || source.password || source.port || !allowedHosts.includes(source.hostname)) throw new Error('Origem de mídia não autorizada.');
    const bucketId = 'atendimento-arquivos';
    const bucket = await client.storage.getBucket(bucketId);
    if (bucket.error || bucket.data?.public !== false || bucket.data?.id !== bucketId) throw new Error('Bucket privado indisponível.');
    // Download injetado deve aplicar streaming limitado e rejeitar redirects; sem fetch genérico aqui.
    const result = await download(source.href,{ maxBytes:5242880, redirect:'error' });
    const bytes = result.bytes;
    if (!(bytes instanceof Uint8Array) || bytes.length < 5 || bytes.length > 5242880 || result.mime !== 'application/pdf' || new TextDecoder().decode(bytes.slice(0,5)) !== '%PDF-') throw new Error('Mídia inválida ou excede o limite.');
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
    const path = `${owner.toLowerCase()}/${chatId.toLowerCase()}/${fileId.toLowerCase()}.pdf`;
    const upload = await client.storage.from(bucketId).upload(path,bytes,{ contentType:'application/pdf',upsert:false });
    if (upload.error) throw new Error('Cópia não confirmada; não registrar anexo como arquivado.');
    return { id:fileId,owner,chatId,name,mime:'application/pdf',size:bytes.length,sha256,path };
}
