-- Recebimento privado: isolado da demo, da Central e de dados_app. Nenhum callback é ativado.
begin;

create table public.atendimento_recepcao_conversas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  instancia text not null check (length(instancia) between 1 and 160),
  nome text not null default '' check (length(nome) <= 200),
  criado_em timestamptz not null default now(),
  unique (user_id, instancia, id)
);
create table public.atendimento_recepcao_identidades (
  user_id uuid not null references auth.users(id),
  instancia text not null,
  conversa_id uuid not null,
  tipo text not null check (tipo in ('telefone','lid')),
  valor text not null check (length(valor) between 5 and 160),
  evidencia_evento text not null check (length(evidencia_evento) between 1 and 160),
  primary key (user_id, instancia, tipo, valor),
  foreign key (user_id, instancia, conversa_id)
    references public.atendimento_recepcao_conversas(user_id, instancia, id)
);
create table public.atendimento_recepcao_mensagens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  instancia text not null,
  conversa_id uuid not null,
  provedor_id text not null check (length(provedor_id) between 1 and 160),
  tipo text not null check (tipo in ('texto','pdf','outro')),
  texto text not null default '' check (length(texto) <= 10000),
  nome_arquivo text,
  ocorrido_em timestamptz not null,
  lida_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (user_id, instancia, provedor_id),
  unique (user_id, id),
  unique (user_id, conversa_id, id),
  foreign key (user_id, instancia, conversa_id)
    references public.atendimento_recepcao_conversas(user_id, instancia, id)
);
create index atendimento_recepcao_timeline on public.atendimento_recepcao_mensagens(user_id,conversa_id,ocorrido_em,id);
create table public.atendimento_recepcao_arquivos (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  conversa_id uuid not null,
  mensagem_id uuid not null,
  nome text not null check (length(nome) between 1 and 120),
  mime text not null check (mime='application/pdf'),
  tamanho bigint not null check (tamanho between 5 and 5242880),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  caminho text not null unique,
  criado_em timestamptz not null default now(),
  check (caminho = user_id::text || '/recebidos/' || id::text || '.pdf'),
  foreign key (user_id,conversa_id,mensagem_id)
    references public.atendimento_recepcao_mensagens(user_id,conversa_id,id)
);
create table public.atendimento_recepcao_eventos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  instancia text not null,
  provedor_id text not null,
  mensagem_id uuid not null,
  recebido_em timestamptz not null default now(),
  unique (user_id,instancia,provedor_id),
  foreign key (user_id,mensagem_id) references public.atendimento_recepcao_mensagens(user_id,id)
);

do $$ declare t text; begin
  foreach t in array array['conversas','identidades','mensagens','arquivos','eventos'] loop
    execute format('alter table public.%I enable row level security','atendimento_recepcao_'||t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role','atendimento_recepcao_'||t);
    execute format('grant select on public.%I to authenticated','atendimento_recepcao_'||t);
    execute format('grant select,insert,update,delete on public.%I to service_role','atendimento_recepcao_'||t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid())=user_id)','atendimento_recepcao_'||t||'_owner','atendimento_recepcao_'||t);
  end loop;
end $$;
revoke update,delete on public.atendimento_recepcao_eventos from service_role;

-- Uma chamada RPC é a unidade de ACK. Mesmo ID nunca cria outra mensagem.
create function public.atendimento_receber_privado(
  p_owner uuid,p_instancia text,p_id text,p_phone text,p_lid text,p_nome text,
  p_tipo text,p_texto text,p_nome_arquivo text,p_ocorrido timestamptz,p_arquivo jsonb default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c_id uuid; phone_id uuid; lid_id uuid; prior public.atendimento_recepcao_mensagens;
        msg_id uuid; file_id uuid; file_path text; file_sha text; file_size bigint;
begin
  if p_owner is null or p_instancia !~ '^[A-Za-z0-9_-]{1,160}$'
     or p_id !~ '^[A-Za-z0-9_:@.+-]{1,160}$'
     or p_phone !~ '^[0-9]{10,15}$' or (p_lid is not null and p_lid !~ '^[0-9]{5,30}@lid$')
     or p_tipo not in ('texto','pdf','outro') or p_texto is null or length(p_texto)>10000
     or p_ocorrido is null or p_ocorrido > now()+interval '1 day'
     or (p_tipo='pdf' and (p_nome_arquivo is null or p_nome_arquivo !~* '^[^/\\]{1,116}\.pdf$'))
     or (p_tipo<>'pdf' and (p_nome_arquivo is not null or p_arquivo is not null)) then
    raise exception 'Evento privado inválido' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text||':'||p_instancia,0));
  select * into prior from public.atendimento_recepcao_mensagens
    where user_id=p_owner and instancia=p_instancia and provedor_id=p_id;
  if found then
    if prior.tipo<>p_tipo or prior.texto<>p_texto or prior.nome_arquivo is distinct from p_nome_arquivo
       or prior.ocorrido_em<>p_ocorrido or not exists (
         select 1 from public.atendimento_recepcao_identidades i
         where i.user_id=p_owner and i.instancia=p_instancia and i.conversa_id=prior.conversa_id
           and i.tipo='telefone' and i.valor=p_phone)
       or (p_lid is not null and not exists (
         select 1 from public.atendimento_recepcao_identidades i
         where i.user_id=p_owner and i.instancia=p_instancia and i.conversa_id=prior.conversa_id
           and i.tipo='lid' and i.valor=p_lid)) then
      raise exception 'ID de mensagem conflitante' using errcode='23505';
    end if;
    return pg_catalog.jsonb_build_object('duplicate',true,'chatId',prior.conversa_id,'messageId',prior.id);
  end if;
  select conversa_id into phone_id from public.atendimento_recepcao_identidades
    where user_id=p_owner and instancia=p_instancia and tipo='telefone' and valor=p_phone;
  if p_lid is not null then
    select conversa_id into lid_id from public.atendimento_recepcao_identidades
      where user_id=p_owner and instancia=p_instancia and tipo='lid' and valor=p_lid;
  end if;
  if phone_id is not null and lid_id is not null and phone_id<>lid_id then
    raise exception 'Telefone e LID conflitantes' using errcode='23505';
  end if;
  c_id:=coalesce(phone_id,lid_id);
  if c_id is not null and exists (
      select 1 from public.atendimento_recepcao_identidades
      where user_id=p_owner and instancia=p_instancia and conversa_id=c_id
        and ((tipo='telefone' and valor<>p_phone) or (tipo='lid' and p_lid is not null and valor<>p_lid))) then
    raise exception 'Identidade conflitante' using errcode='23505';
  end if;
  if c_id is null then
    insert into public.atendimento_recepcao_conversas(user_id,instancia,nome)
      values(p_owner,p_instancia,pg_catalog.left(coalesce(nullif(p_nome,''),'+'||p_phone),200)) returning id into c_id;
  end if;
  insert into public.atendimento_recepcao_identidades(user_id,instancia,conversa_id,tipo,valor,evidencia_evento)
    values(p_owner,p_instancia,c_id,'telefone',p_phone,p_id) on conflict do nothing;
  if p_lid is not null then
    insert into public.atendimento_recepcao_identidades(user_id,instancia,conversa_id,tipo,valor,evidencia_evento)
      values(p_owner,p_instancia,c_id,'lid',p_lid,p_id) on conflict do nothing;
  end if;
  if p_tipo='pdf' then
    if p_arquivo is null or p_arquivo->>'id' is null or p_arquivo->>'path' is null
       or p_arquivo->>'sha256' !~ '^[0-9a-f]{64}$' then
      raise exception 'PDF sem cópia confirmada' using errcode='22023';
    end if;
    file_id:=(p_arquivo->>'id')::uuid; file_path:=p_arquivo->>'path';
    file_sha:=p_arquivo->>'sha256';file_size:=(p_arquivo->>'size')::bigint;
    if file_path<>p_owner::text||'/recebidos/'||file_id::text||'.pdf'
       or file_size not between 5 and 5242880 then
      raise exception 'Caminho de PDF inválido' using errcode='22023';
    end if;
  end if;
  insert into public.atendimento_recepcao_mensagens(user_id,instancia,conversa_id,provedor_id,tipo,texto,nome_arquivo,ocorrido_em)
    values(p_owner,p_instancia,c_id,p_id,p_tipo,p_texto,p_nome_arquivo,p_ocorrido) returning id into msg_id;
  if p_tipo='pdf' then
    insert into public.atendimento_recepcao_arquivos(id,user_id,conversa_id,mensagem_id,nome,mime,tamanho,sha256,caminho)
      values(file_id,p_owner,c_id,msg_id,p_nome_arquivo,'application/pdf',file_size,file_sha,file_path);
  end if;
  insert into public.atendimento_recepcao_eventos(user_id,instancia,provedor_id,mensagem_id)
    values(p_owner,p_instancia,p_id,msg_id);
  return pg_catalog.jsonb_build_object('duplicate',false,'chatId',c_id,'messageId',msg_id);
end $$;
revoke all on function public.atendimento_receber_privado(uuid,text,text,text,text,text,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.atendimento_receber_privado(uuid,text,text,text,text,text,text,text,text,timestamptz,jsonb) to service_role;
commit;
