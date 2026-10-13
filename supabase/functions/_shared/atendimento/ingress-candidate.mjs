// Candidato exclusivamente sintético. Sem endpoint, segredo, conexão Z-API ou publicação.
import { createDurableFanout } from './durable-fanout.mjs';
const answer=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
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
