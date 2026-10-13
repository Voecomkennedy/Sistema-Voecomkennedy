// Candidato exclusivamente sintético. Sem endpoint, segredo, conexão Z-API ou publicação.
import { createDurableFanout } from './durable-fanout.mjs';
const answer=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
// A Z-API documenta a URL HTTPS do callback, mas não uma assinatura de origem.
// Esta capacidade prova somente posse da URL; não prova que a Z-API a enviou.
// O valor real terá de ser gerado e guardado fora do código em uma etapa autorizada.
export function createCapabilityVerifier({capability,owner,instance='mock',pathPrefix='/functions/v1/atendimento-webhook'}){
    if(typeof capability!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(capability)||typeof owner!=='string'||!owner||typeof instance!=='string'||!instance||!pathPrefix.startsWith('/')||pathPrefix.endsWith('/'))throw new Error('Configuração de capacidade inválida.');
    const expected=pathPrefix+'/'+capability;
    return request=>{
        let url;try{url=new URL(request.url);}catch{return null;}
        if(url.protocol!=='https:'||url.search||url.hash)return null;
        // Comprimento fixo e comparação integral para não revelar o primeiro byte diferente.
        const actual=url.pathname;let different=actual.length^expected.length;
        for(let i=0;i<expected.length;i++)different|=(actual.charCodeAt(i)||0)^expected.charCodeAt(i);
        return different===0?{owner,instance}:null;
    };
}
async function readLimited(request,maxBytes){
    const reader=request.body?.getReader();if(!reader)throw Object.assign(new Error('Corpo ausente.'),{status:422});
    const chunks=[];let size=0;
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw Object.assign(new Error('Corpo excedido.'),{status:413});}chunks.push(value);}
    const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}return body;
}
export function createSyntheticWebhookIngress({enabled=false,verifyIngress,repositoryFor,connectedPhone,legacyEnabled=false,privateEnabled=false}){
    return async request=>{
        if(enabled!==true||legacyEnabled!==true&&privateEnabled!==true)return answer(503,{erro:'Ingresso desativado.'});
        if(request.method!=='POST')return answer(405,{erro:'Método inválido.'});
        let identity;try{identity=await verifyIngress(request);}catch{return answer(401,{erro:'Origem não autorizada.'});}
        if(!identity?.owner||identity.instance!=='mock')return answer(401,{erro:'Origem não autorizada.'});
        try{
            const bytes=await readLimited(request,200000);
            let payload;try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return answer(422,{erro:'Evento inválido.'});}
            if(!payload||Array.isArray(payload)||typeof payload!=='object'||payload.instanceId!==identity.instance)return answer(422,{erro:'Evento inválido.'});
            const key=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
            const repo=await repositoryFor(identity.owner);
            if(repo?.mode!=='sintetico'||repo.owner!==identity.owner)return answer(503,{erro:'Repositório indisponível.'});
            const fanout=createDurableFanout(repo,{legacyEnabled,privateEnabled,privateConfig:{instance:identity.instance,connectedPhone}});
            const result=await fanout.enqueue(identity.owner,{key,payload});
            return answer(200,{mode:'sintetico',consumers:result.consumers,duplicate:result.duplicate,ignored:result.consumers.length===0});
        }catch(error){return answer(error.status===413?413:error.status===409?409:503,{erro:'Ingresso não confirmado.'});}
    };
}
