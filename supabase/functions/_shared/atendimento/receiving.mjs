import { identity } from '../../../../js/atendimento-domain.mjs';
import { createCapabilityVerifier } from './ingress-candidate.mjs';

const BUCKET='atendimento-arquivos', LIMIT=200000, PDF_LIMIT=5242880;
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const digest=async bytes=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_:@.+-]{1,160}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const uuidFrom=async value=>{const b=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;const h=hex(b);return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};

async function readBounded(stream,limit){
  if(!stream)fail('Corpo ausente.');
  const reader=stream.getReader(),parts=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();fail('Tamanho excedido.',413);}parts.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}return bytes;
}

export function normalizePrivateReceived(payload,{instance,connectedPhone}){
  if(!payload||Array.isArray(payload)||typeof payload!=='object'||payload.instanceId!==instance||payload.connectedPhone!==connectedPhone)fail('Instância incompatível.');
  if(payload.isGroup===true||payload.isNewsletter===true||/@g\.us$/.test(payload.phone||'')||payload.broadcast===true)return null;
  if(payload.type!=='ReceivedCallback'||payload.fromMe===true||payload.waitingMessage===true||payload.isEdit===true)return null;
  if(payload.isGroup!==false||payload.fromMe!==false||!id(payload.messageId)||!Number.isSafeInteger(payload.momment))fail('Evento privado inválido.');
  const at=new Date(payload.momment);if(!Number.isFinite(at.getTime())||at.getTime()>Date.now()+86400000)fail('Timestamp inválido.');
  const address=identity({phone:payload.phone,lid:payload.senderLid});
  if(!address.phone)fail('Telefone ausente.');
  let kind='outro',text='[Mídia ou evento não suportado pelo Atendimento]',document=null;
  if(payload.document?.mimeType==='application/pdf'){
    const d=payload.document;
    if(typeof d.fileName!=='string'||!/^[^/\\]{1,116}\.pdf$/i.test(d.fileName)||[...d.fileName].some(c=>c.charCodeAt(0)<32)||typeof d.documentUrl!=='string')fail('PDF inválido.');
    kind='pdf';text='[PDF recebido]';document={name:d.fileName,url:d.documentUrl};
  }else if(typeof payload.text?.message==='string'){
    kind='texto';text=payload.text.message;
  }
  if(text.length>10000)fail('Texto excedido.',413);
  return {instance,messageId:payload.messageId,...address,at:at.toISOString(),kind,text,document,name:typeof payload.chatName==='string'?payload.chatName.slice(0,200):''};
}

export function validateMediaUrl(url,allowedHosts){
  let source;try{source=new URL(url);}catch{fail('Origem de mídia inválida.');}
  const host=source.hostname;
  if(source.protocol!=='https:'||source.username||source.password||source.port||source.hash||
     !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host)||/\.(?:local|localhost|internal|test|invalid)$/.test(host)||
     /^\d+(?:\.\d+){3}$/.test(host)||!allowedHosts.includes(host))fail('Origem de mídia não autorizada.');
  return source;
}
export async function downloadPdf(url,{allowedHosts,fetcher=fetch}){
  const source=validateMediaUrl(url,allowedHosts);
  const response=await fetcher(source.href,{redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok||!response.body)fail('Mídia indisponível.',503);
  const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(mime&&!['application/pdf','application/octet-stream','binary/octet-stream'].includes(mime))fail('Tipo de mídia inesperado.');
  const length=Number(response.headers.get('content-length'));
  if(Number.isFinite(length)&&length>PDF_LIMIT)fail('PDF excede o limite.',413);
  const bytes=await readBounded(response.body,PDF_LIMIT);
  if(bytes.length<5||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')fail('Arquivo não é PDF.');
  return bytes;
}

export async function copyReceivedPdf(event,{owner,db,allowedHosts,fetcher=fetch}){
  validateMediaUrl(event.document.url,allowedHosts);
  const bucket=await db.storage.getBucket(BUCKET);
  if(bucket.error||bucket.data?.id!==BUCKET||bucket.data?.public!==false)fail('Bucket privado indisponível.',503);
  const fileId=await uuidFrom(`${owner}:${event.instance}:${event.messageId}`);
  const path=`${owner}/recebidos/${fileId}.pdf`;
  // Uma falha de banco após upload deixa um órfão recuperável por esta chave estável.
  const prior=await db.storage.from(BUCKET).download(path);
  if(!prior.error&&prior.data){
    if(prior.data.size>PDF_LIMIT)fail('PDF preexistente excede o limite.',409);
    const saved=new Uint8Array(await prior.data.arrayBuffer());
    if(saved.length<5||saved.length>PDF_LIMIT||new TextDecoder().decode(saved.slice(0,5))!=='%PDF-')fail('PDF preexistente inválido.',409);
    return {id:fileId,path,sha256:await digest(saved),size:saved.length};
  }
  const bytes=await downloadPdf(event.document.url,{allowedHosts,fetcher});
  const sha256=await digest(bytes);
  const uploaded=await db.storage.from(BUCKET).upload(path,bytes,{contentType:'application/pdf',upsert:false});
  if(uploaded.error){
    // Retry após commit ambíguo: somente um objeto byte a byte idêntico é aceito.
    const saved=await db.storage.from(BUCKET).download(path);
    if(saved.error||!saved.data)fail('Cópia do PDF não confirmada.',503);
    if(saved.data.size>PDF_LIMIT)fail('PDF preexistente excede o limite.',409);
    const previous=new Uint8Array(await saved.data.arrayBuffer());
    if(previous.length!==bytes.length||await digest(previous)!==sha256)fail('PDF preexistente divergente.',409);
  }
  return {id:fileId,path,sha256,size:bytes.length};
}

export function createRealWebhookIngress({enabled=false,capability,owner,instance,connectedPhone,db,allowedHosts=/** @type {string[]} */([]),fetcher=fetch}){
  const ready=enabled===true&&uuid(owner)&&/^[A-Za-z0-9_-]{1,160}$/.test(instance||'')&&/^\d{10,15}$/.test(connectedPhone||'')&&db&&Array.isArray(allowedHosts);
  let verify=null;
  if(ready)try{verify=createCapabilityVerifier({capability,owner,instance,pathPrefix:'/functions/v1/atendimento-recebimento'});}catch{/* Configuração incompleta: fechado. */}
  return async request=>{
    if(!verify)return json(503,{erro:'Recebimento desativado.'});
    if(request.method!=='POST')return json(405,{erro:'Método inválido.'});
    // A capacidade é verificada ANTES de acessar request.body, inclusive com Content-Length falso.
    if(!verify(request))return json(401,{erro:'Não autorizado.'});
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return json(415,{erro:'Formato inválido.'});
    if(Number(request.headers.get('content-length'))>LIMIT)return json(413,{erro:'Tamanho excedido.'});
    try{
      const bytes=await readBounded(request.body,LIMIT);
      let payload;try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('JSON inválido.');}
      const event=normalizePrivateReceived(payload,{instance,connectedPhone});
      if(!event)return json(200,{ignored:true});
      let file=null;
      if(event.document){
        // Duplicata já commitada não depende de URL de mídia que pode ter expirado.
        const existing=await db.from('atendimento_recepcao_mensagens').select('id').eq('user_id',owner).eq('instancia',instance).eq('provedor_id',event.messageId).maybeSingle();
        if(existing.error)fail('Consulta indisponível.',503);
        if(!existing.data)file=await copyReceivedPdf(event,{owner,db,allowedHosts,fetcher});
      }
      const result=await db.rpc('atendimento_receber_privado',{
        p_owner:owner,p_instancia:instance,p_id:event.messageId,p_phone:event.phone,p_lid:event.lid,
        p_nome:event.name,p_tipo:event.kind,p_texto:event.text,p_nome_arquivo:event.document?.name||null,
        p_ocorrido:event.at,p_arquivo:file
      });
      if(result.error)fail('Gravação indisponível.',result.error.code==='23505'?409:503);
      return json(200,{accepted:true,duplicate:result.data?.duplicate===true});
    }catch(error){return json(error.status===413?413:error.status===409?409:error.status===422?422:503,{erro:'Recebimento não confirmado.'});}
  };
}
