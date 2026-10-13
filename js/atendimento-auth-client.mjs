// Usa a sessão Supabase existente; cada chamada é validada novamente no servidor.
export function createAtendimentoAuthClient({client=getSupabaseClient(),endpoint}={}){
    if(!client||!endpoint)throw new Error('Autenticação indisponível.');
    async function call(acao,fields={}){
        const {data:{session},error}=await client.auth.getSession();
        if(error||!session?.access_token)throw new Error('Sessão encerrada. Entre novamente no sistema.');
        const response=await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${session.access_token}`,'content-type':'application/json',apikey:SUPABASE_CONFIG.anonKey},body:JSON.stringify({acao,...fields}),cache:'no-store'});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(payload.erro||'Atendimento indisponível.');
        return payload.result;
    }
    const encode=bytes=>{let value='';for(let i=0;i<bytes.length;i+=32768)value+=String.fromCharCode(...bytes.slice(i,i+32768));return btoa(value);};
    return {list:filters=>call('listar',filters),messages:chatId=>call('mensagens',{chatId}),read:chatId=>call('lida',{chatId}),link:(chatId,data)=>call('vincular',{chatId,...data}),compose:(chatId,text,attachmentId,requestId)=>call('compor',{chatId,text,attachmentId,requestId}),archive:(chatId,name,bytes,requestId)=>call('anexar',{chatId,name,bytes:encode(bytes),requestId}),file:async attachmentId=>{const file=await call('arquivo',{attachmentId});return {...file,bytes:Uint8Array.from(atob(file.bytes),c=>c.charCodeAt(0))};}};
}
