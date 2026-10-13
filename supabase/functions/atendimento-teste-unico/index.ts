import { createClient } from 'npm:@supabase/supabase-js@2';
import { createOneShotTestHandler } from '../_shared/atendimento/one-shot-test.mjs';

const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',
  {auth:{persistSession:false,autoRefreshToken:false}});
const instance=Deno.env.get('ATENDIMENTO_RECEBIMENTO_INSTANCE_ID')||'';
const zapiInstance=Deno.env.get('ZAPI_INSTANCE_ID')||'';
const zapiToken=Deno.env.get('ZAPI_TOKEN')||'';
const clientToken=Deno.env.get('ZAPI_CLIENT_TOKEN')||'';
const handler=createOneShotTestHandler({
  enabled:Deno.env.get('ATENDIMENTO_TESTE_ENABLED')==='true'&&!!zapiToken&&!!clientToken,
  receivingEnabled:Deno.env.get('ATENDIMENTO_RECEBIMENTO_ENABLED')==='true',
  owner:Deno.env.get('ATENDIMENTO_RECEBIMENTO_OWNER_ID')||'',
  instance,transportInstance:zapiInstance,
  phone:Deno.env.get('ATENDIMENTO_TESTE_DESTINO')||'',db,
  authenticate:async(jwt:string)=>{const {data,error}=await db.auth.getUser(jwt);if(error)throw error;return data.user;},
  send:async({phone,message}:{phone:string;message:string})=>{
    const response=await fetch(`https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-text`,{
      method:'POST',headers:{'Content-Type':'application/json','Client-Token':clientToken},
      body:JSON.stringify({phone,message}),redirect:'error',signal:AbortSignal.timeout(12000)
    });
    let data:Record<string,unknown>={};try{data=await response.json();}catch{/* Sem ID: resultado incerto. */}
    return {ok:response.ok,status:response.status,messageId:data?.messageId||data?.zaapId||null};
  }
});
Deno.serve(handler);
