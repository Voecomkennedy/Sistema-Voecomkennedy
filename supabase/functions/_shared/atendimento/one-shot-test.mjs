// Um único envio de teste, separado do pós-venda e sem executor automático.
export const TEST_TEXT='Teste de conexão do CRM Voecomkennedy. Kennedy, pode responder TESTE RECEBIDO para conferirmos a chegada?';
const key='piloto_texto_1';
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);

export function createOneShotTestHandler({enabled=false,receivingEnabled=false,owner,instance,transportInstance,phone,db,authenticate,send,now=()=>new Date()}){
  const ready=enabled===true&&receivingEnabled===true&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner||'')&&
    validId(instance)&&instance===transportInstance&&/^55\d{10,11}$/.test(phone||'')&&db&&authenticate&&send;
  return async request=>{
    if(!ready)return reply(503,{erro:'Teste desativado ou configuração incompleta.'});
    if(request.method!=='POST')return reply(405,{erro:'Método inválido.'});
    const url=new URL(request.url);
    if(url.pathname!=='/functions/v1/atendimento-teste-unico'||url.search||url.hash||request.body)return reply(400,{erro:'Requisição inválida.'});
    const match=/^Bearer ([A-Za-z0-9._-]+)$/.exec(request.headers.get('authorization')||'');
    if(!match)return reply(401,{erro:'Sessão necessária.'});
    let actor;
    try{actor=await authenticate(match[1]);}catch{return reply(401,{erro:'Sessão inválida.'});}
    if(actor?.id!==owner)return reply(403,{erro:'Proprietário inválido.'});

    // A chave única é reservada ANTES de chamar o provedor. Reservado/incerto nunca é liberado.
    const requestedAt=now().toISOString();
    const reserved=await db.from('atendimento_teste_envio_unico').insert({chave:key,user_id:owner,instancia:instance,estado:'reservado',solicitado_em:requestedAt});
    if(reserved.error)return reply(reserved.error.code==='23505'?409:503,{erro:reserved.error.code==='23505'?'Teste já reservado; não repetir.':'Reserva não confirmada; não enviar.'});

    let providerId=null,httpStatus=null,accepted=false;
    try{
      const result=await send({instance,phone,message:TEST_TEXT});
      httpStatus=Number.isInteger(result?.status)?result.status:null;
      providerId=typeof result?.messageId==='string'&&/^[A-Za-z0-9_:@.+-]{1,160}$/.test(result.messageId)?result.messageId:null;
      accepted=result?.ok===true&&providerId!==null;
    }catch{/* Timeout ou falha após a tentativa: resultado incerto, sem retry. */}
    const respondedAt=now().toISOString();
    const stored=await db.from('atendimento_teste_envio_unico').update({estado:accepted?'aceito':'incerto',respondido_em:respondedAt,provedor_id:providerId,http_status:httpStatus}).eq('chave',key).eq('user_id',owner);
    if(stored.error)return reply(503,{erro:'Resultado não persistido. Teste reservado; não repetir.'});
    return reply(accepted?200:202,{estado:accepted?'aceito':'incerto',solicitado_em:requestedAt,respondido_em:respondedAt,provedor_id:providerId});
  };
}
