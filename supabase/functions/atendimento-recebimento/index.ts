import { createClient } from 'npm:@supabase/supabase-js@2';
import { createRealWebhookIngress } from '../_shared/atendimento/receiving.mjs';

const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const allowedHosts=(Deno.env.get('ATENDIMENTO_RECEBIMENTO_MEDIA_HOSTS')||'').split(',').map(x=>x.trim()).filter(Boolean);
Deno.serve(createRealWebhookIngress({
  enabled:Deno.env.get('ATENDIMENTO_RECEBIMENTO_ENABLED')==='true',
  capability:Deno.env.get('ATENDIMENTO_RECEBIMENTO_CAPABILITY')||'',
  owner:Deno.env.get('ATENDIMENTO_RECEBIMENTO_OWNER_ID')||'',
  instance:Deno.env.get('ATENDIMENTO_RECEBIMENTO_INSTANCE_ID')||'',
  connectedPhone:Deno.env.get('ATENDIMENTO_RECEBIMENTO_CONNECTED_PHONE')||'',
  db,allowedHosts,archivePdf:Deno.env.get('ATENDIMENTO_RECEBIMENTO_ARCHIVE_PDF')==='true'
}));
