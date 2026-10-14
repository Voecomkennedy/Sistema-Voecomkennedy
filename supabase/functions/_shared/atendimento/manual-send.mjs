const origin='https://sistema.voecomkennedy.tur.br';
const headers={'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization,x-client-info,apikey,content-type','vary':'Origin'};
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
async function readBody(request){
  if(!request.body)throw Error('Corpo necessário');
  const reader=request.body.getReader();let timer;
  try{return await Promise.race([(async()=>{const chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)throw Error('Limite');chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));})(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Timeout')),2000);})]);}
  finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
export function createManualSendHandler({enabled=false,receivingEnabled=false,owner,instance,transportInstance,connectedPhone,db,authenticate,send,now=()=>new Date()}){
  const ready=enabled===true&&receivingEnabled===true&&uuid(owner)&&typeof instance==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(instance)&&instance===transportInstance&&/^55\d{10,11}$/.test(connectedPhone||'')&&db&&authenticate&&send;
  return async request=>{
    if(request.headers.get('origin')&&request.headers.get('origin')!==origin)return reply(403,{erro:'Origem inválida.'});
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(!ready)return reply(503,{erro:'Envio manual desligado ou configuração incompleta.'});
    if(request.method!=='POST')return reply(405,{erro:'Método inválido.'});
    const url=new URL(request.url);if(url.pathname!=='/atendimento-envio-manual'||url.search||url.hash)return reply(400,{erro:'Requisição inválida.'});
    const token=/^Bearer ([A-Za-z0-9._-]+)$/.exec(request.headers.get('authorization')||'');if(!token)return reply(401,{erro:'Sessão necessária.'});
    let actor;try{actor=await authenticate(token[1]);}catch{return reply(401,{erro:'Sessão inválida.'});}
    if(actor?.id!==owner)return reply(403,{erro:'Proprietário inválido.'});
    let body;try{body=await readBody(request);}catch{return reply(400,{erro:'Corpo inválido.'});}
    if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='chatId,expectedPhone,requestId,text'||!uuid(body.chatId)||!uuid(body.requestId)||typeof body.text!=='string'||!body.text.trim()||body.text.length>10000||typeof body.expectedPhone!=='string'||!/^55\d{10,11}$/.test(body.expectedPhone||'')||body.expectedPhone===connectedPhone)return reply(400,{erro:'Mensagem ou contato inválido.'});
    const text=body.text.trim();
    let reservation;try{reservation=await db.rpc('atendimento_reservar_envio_manual',{p_owner:owner,p_instance:instance,p_chat:body.chatId,p_request:body.requestId,p_phone:body.expectedPhone,p_text:text});}catch{return reply(503,{erro:'Reserva não confirmada; nenhum envio iniciado.'});}
    if(reservation.error)return reply(reservation.error.code==='42501'?403:reservation.error.code==='23505'?409:reservation.error.code==='22023'?400:503,{erro:'Reserva recusada; nenhum envio iniciado.'});
    const row=reservation.data?.message;if(!row?.id)return reply(503,{erro:'Reserva não confirmada; nenhum envio iniciado.'});
    if(reservation.data.created!==true)return reply(200,{message:row,repeated:true});
    let accepted=false,httpStatus=null,providerId=null;
    try{const r=await send({phone:row.telefone,message:row.texto});httpStatus=Number.isInteger(r?.status)?r.status:null;providerId=typeof r?.messageId==='string'&&/^[A-Za-z0-9_:@.+-]{1,160}$/.test(r.messageId)?r.messageId:null;accepted=r?.ok===true&&!!providerId;}catch{/* Pode ter enviado: nunca repetir. */}
    const patch={estado:accepted?'aceito':'incerto',respondido_em:now().toISOString(),provedor_id:providerId,http_status:httpStatus};
    try{const stored=await db.from('atendimento_recepcao_saidas').update(patch).eq('user_id',owner).eq('id',row.id).eq('estado','reservado').select().maybeSingle();if(stored.error||!stored.data)return reply(503,{erro:'Resultado não persistido. Mensagem reservada; não repetir.'});return reply(accepted?200:202,{message:stored.data});}catch{return reply(503,{erro:'Resultado não persistido. Mensagem reservada; não repetir.'});}
  };
}
