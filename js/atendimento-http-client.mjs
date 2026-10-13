// Cliente da demo local; nunca recebe credenciais Supabase/Z-API.
export function createAtendimentoHttpClient({baseUrl=globalThis.location?.origin,fetchImpl=globalThis.fetch}={}){
    const url=new URL('/atendimento-api',baseUrl);
    if(url.hostname!=='127.0.0.1'||!['http:'].includes(url.protocol))throw new Error('API sintética aceita somente 127.0.0.1 em HTTP local.');
    async function request(acao,fields={}){
        const response=await fetchImpl(url,{method:'POST',headers:{'content-type':'application/json',authorization:'Synthetic local'},body:JSON.stringify({acao,...fields})});
        const result=await response.json();
        if(!response.ok)throw new Error(`${result.erro||'Operação indisponível.'} (HTTP ${response.status})`);
        return result.data;
    }
    return {
        list:filters=>request('listar',filters),messages:chatId=>request('mensagens',{chatId}),read:chatId=>request('lida',{chatId}),
        link:(chatId,link)=>request('vincular',{chatId,link}),compose:(chatId,text,attachmentId,requestId)=>request('compor',{chatId,text,attachmentId,requestId}),
        archive:(chatId,name,bytes,requestId)=>request('anexar',{chatId,name,bytes:Array.from(bytes),requestId}),file:fileId=>request('arquivo',{fileId}),
        ingest:async event=>{const result=await request('ingressar_sintetico',{event});if(!result.ignored)await request('processar_sintetico');return result;},
        dispatch:outcome=>request('simular_envio',{outcome}),export:()=>request('exportar'),restore:pack=>request('restaurar',{package:pack})
    };
}
