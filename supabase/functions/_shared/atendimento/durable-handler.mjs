// Sem entrypoint. Envelope HTTP real nos testes locais; Auth/transportes injetados.
const rules={listar:['search','unread','label'],mensagens:['chatId'],lida:['chatId'],vincular:['chatId','link'],compor:['chatId','text','attachmentId','requestId'],anexar:['chatId','name','bytes','requestId'],arquivo:['fileId'],ingressar_sintetico:['event'],processar_sintetico:[],simular_envio:['outcome'],exportar:[],restaurar:['package']};
export function createDurableHandler({enabled=false,verifyUser,repositoryFor,backupFor,allowedOrigin,transport}){
    return async request=>{
        const response=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
        if(enabled!==true)return response(503,{erro:'Atendimento desativado.'});
        if(request.headers.get('origin')!==allowedOrigin)return response(403,{erro:'Origem não autorizada.'});
        if(request.method!=='POST')return response(405,{erro:'Método inválido.'});
        let user;try{user=await verifyUser(request.headers.get('authorization'));}catch{return response(401,{erro:'Sessão inválida.'});}
        if(!user?.id)return response(401,{erro:'Sessão inválida.'});
        try{
            const text=await request.text();if(text.length>20*1024*1024)return response(413,{erro:'Requisição excede o limite.'});
            const body=JSON.parse(text),fields=rules[body?.acao];
            if(!fields||Object.keys(body).some(k=>k!=='acao'&&!fields.includes(k)))return response(422,{erro:'Operação inválida.'});
            const repo=await repositoryFor(user.id);if(repo.mode!=='sintetico'||repo.owner!==user.id)return response(503,{erro:'Repositório indisponível.'});
            let data;
            switch(body.acao){
                case 'listar':data=await repo.list(user.id,{search:body.search||'',unread:body.unread||false,label:body.label||''});break;
                case 'mensagens':data=await repo.messages(user.id,body.chatId);break;
                case 'lida':data=await repo.read(user.id,body.chatId);break;
                case 'vincular':data=await repo.link(user.id,body.chatId,body.link);break;
                case 'compor':data=await repo.compose(user.id,body.chatId,{text:body.text,attachmentId:body.attachmentId,requestId:body.requestId});break;
                case 'anexar':if(!Array.isArray(body.bytes)||body.bytes.some(b=>!Number.isInteger(b)||b<0||b>255))return response(422,{erro:'Bytes inválidos.'});data=await repo.archive(user.id,body.chatId,{name:body.name,bytes:new Uint8Array(body.bytes),requestId:body.requestId});break;
                case 'arquivo':data=await repo.file(user.id,body.fileId);break;
                case 'ingressar_sintetico':data=await repo.enqueue(user.id,body.event);break;
                case 'processar_sintetico':data=await repo.processNext(user.id);break;
                case 'simular_envio':if(body.outcome!==undefined&&!['success','failure','uncertain'].includes(body.outcome))return response(422,{erro:'Resultado sintético inválido.'});data=await repo.dispatchNext(user.id,{mode:'sintetico',send:payload=>transport.send(payload,{outcome:body.outcome||'success'})});break;
                case 'exportar':data=await backupFor(repo).exportPackage(user.id);break;
                case 'restaurar':data=await backupFor(repo).restorePackage(user.id,body.package);break;
            }
            return response(200,{mode:'sintetico',data});
        }catch(error){const status=error.status||({'22P02':422,'23503':422,'23505':409,'23514':422}[error.code])||500;return response(status,{erro:status===500?'Operação indisponível; tente novamente.':status===403?'Acesso negado.':status===404?'Registro indisponível.':status===409?'Conflito; revisão necessária.':'Dados inválidos.'});}
    };
}
