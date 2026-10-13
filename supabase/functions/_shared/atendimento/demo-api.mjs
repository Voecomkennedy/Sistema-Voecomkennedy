// API demonstrativa: a identidade vem exclusivamente do Auth e o proprietário permitido da configuração do servidor.
export function createDemoHandler({ verifyUser, repositoryFor, allowedOrigin, ownerId }) {
    const response=(status,payload,origin)=>new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json','access-control-allow-origin':origin||'',vary:'Origin','cache-control':'no-store'}});
    return async request=>{
        const origin=request.headers.get('origin');
        if(!allowedOrigin||origin!==allowedOrigin)return response(403,{erro:'Origem inválida.'});
        if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization, content-type, apikey','vary':'Origin'}});
        if(request.method!=='POST')return response(405,{erro:'Método inválido.'},origin);
        if(!ownerId)return response(503,{erro:'Demonstração desativada.'},origin);
        try{
            const user=await verifyUser(request.headers.get('authorization'));
            if(!user?.id)return response(401,{erro:'Sessão inválida.'},origin);
            if(user.id!==ownerId)return response(403,{erro:'Acesso não autorizado.'},origin);
            const length=Number(request.headers.get('content-length')||0);
            if(length>7*1024*1024)return response(413,{erro:'Arquivo excede o limite.'},origin);
            const raw=await request.text();if(raw.length>7*1024*1024)return response(413,{erro:'Arquivo excede o limite.'},origin);
            let body;try{body=JSON.parse(raw);}catch{ return response(422,{erro:'JSON inválido.'},origin); }
            if(!body||Array.isArray(body)||typeof body!=='object')return response(422,{erro:'Requisição inválida.'},origin);
            const action=body.acao;
            const allowed={listar:['acao','search','unread','label'],mensagens:['acao','chatId'],lida:['acao','chatId'],vincular:['acao','chatId','clienteId','cotacaoId','vendaId','origemContato','etiquetas'],compor:['acao','chatId','text','attachmentId','requestId'],anexar:['acao','chatId','name','bytes','requestId'],arquivo:['acao','attachmentId']};
            if(!Object.hasOwn(allowed,action)||Object.keys(body).some(k=>!allowed[action].includes(k)))return response(422,{erro:'Ação inválida.'},origin);
            const repo=repositoryFor(user.id);
            const result=await repo[action](body);
            return response(200,{mode:'demo',result},origin);
        }catch(error){const status=Number(error?.status)||500;return response(status>=400&&status<500?status:500,{erro:status>=400&&status<500?error.message:'Falha ao atender a requisição.'},origin);}
    };
}
