import { createClient } from 'npm:@supabase/supabase-js@2';
import { createManualSendHandler } from '../_shared/atendimento/manual-send.mjs';
const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
const instance=Deno.env.get('ATENDIMENTO_RECEBIMENTO_INSTANCE_ID')||'',transportInstance=Deno.env.get('ZAPI_INSTANCE_ID')||'';
const token=Deno.env.get('ZAPI_TOKEN')||'',clientToken=Deno.env.get('ZAPI_CLIENT_TOKEN')||'';
Deno.serve(createManualSendHandler({enabled:Deno.env.get('ATENDIMENTO_ENVIO_MANUAL_ENABLED')==='true'&&!!token&&!!clientToken,receivingEnabled:Deno.env.get('ATENDIMENTO_RECEBIMENTO_ENABLED')==='true',owner:Deno.env.get('ATENDIMENTO_RECEBIMENTO_OWNER_ID')||'',connectedPhone:Deno.env.get('ATENDIMENTO_ENVIO_MANUAL_CONNECTED_PHONE')||Deno.env.get('ATENDIMENTO_RECEBIMENTO_CONNECTED_PHONE')||'',instance,transportInstance,db,
  authenticate:async(jwt:string)=>{const {data,error}=await db.auth.getUser(jwt);if(error)throw error;return data.user;},
  send:async({phone,message}:{phone:string;message:string})=>{const response=await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/send-text`,{method:'POST',headers:{'Content-Type':'application/json','Client-Token':clientToken},body:JSON.stringify({phone,message}),redirect:'error',signal:AbortSignal.timeout(12000)});let data:Record<string,unknown>={};try{data=await response.json();}catch{/* Resultado sem ID: incerto. */}return{ok:response.ok,status:response.status,messageId:data.messageId||data.zaapId||null};}
}));
