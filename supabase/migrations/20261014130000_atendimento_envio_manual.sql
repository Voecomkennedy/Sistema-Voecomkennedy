-- Requer a recepção privada já existente. Nenhum callback, flag ou envio é ativado.
begin;
create table public.atendimento_recepcao_saidas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  instancia text not null,
  conversa_id uuid not null,
  requisicao_id uuid not null,
  telefone text not null check (telefone ~ '^55[0-9]{10,11}$'),
  texto text not null check (length(texto) between 1 and 10000 and btrim(texto)<>''),
  estado text not null default 'reservado' check (estado in ('reservado','aceito','incerto')),
  criado_em timestamptz not null default now(),
  respondido_em timestamptz,
  provedor_id text check (length(provedor_id) between 1 and 160),
  http_status integer,
  unique(user_id,requisicao_id),
  foreign key(user_id,instancia,conversa_id) references public.atendimento_recepcao_conversas(user_id,instancia,id)
);
create index atendimento_recepcao_saidas_timeline on public.atendimento_recepcao_saidas(user_id,conversa_id,criado_em,id);
-- Uma conversa com resultado pendente/incerto não admite outro envio, inclusive em outra aba.
create unique index atendimento_recepcao_saidas_pendente on public.atendimento_recepcao_saidas(user_id,instancia,conversa_id) where estado in ('reservado','incerto');
alter table public.atendimento_recepcao_saidas enable row level security;
revoke all on public.atendimento_recepcao_saidas from public,anon,authenticated,service_role;
grant select on public.atendimento_recepcao_saidas to authenticated;
grant select,insert,update on public.atendimento_recepcao_saidas to service_role;
create policy atendimento_recepcao_saidas_owner on public.atendimento_recepcao_saidas for select to authenticated using ((select auth.uid())=user_id);
create function public.atendimento_reservar_envio_manual(p_owner uuid,p_instance text,p_chat uuid,p_request uuid,p_phone text,p_text text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.atendimento_recepcao_saidas; inserted boolean; phones integer;
begin
  if p_owner is null or p_chat is null or p_request is null or p_instance is null or p_instance !~ '^[A-Za-z0-9_-]{1,160}$'
    or p_phone is null or p_phone !~ '^55[0-9]{10,11}$' or p_text is null or length(p_text) not between 1 and 10000 or btrim(p_text)='' then
    raise exception 'Requisição inválida' using errcode='22023';
  end if;
  select count(*) into phones from public.atendimento_recepcao_identidades where user_id=p_owner and instancia=p_instance and conversa_id=p_chat and tipo='telefone';
  if phones<>1 or not exists(select 1 from public.atendimento_recepcao_identidades where user_id=p_owner and instancia=p_instance and conversa_id=p_chat and tipo='telefone' and valor=p_phone) then
    raise exception 'Contato não confirmado' using errcode='42501';
  end if;
  insert into public.atendimento_recepcao_saidas(user_id,instancia,conversa_id,requisicao_id,telefone,texto)
    values(p_owner,p_instance,p_chat,p_request,p_phone,p_text) on conflict(user_id,requisicao_id) do nothing returning * into r;
  inserted:=found;
  if not inserted then
    select * into strict r from public.atendimento_recepcao_saidas where user_id=p_owner and requisicao_id=p_request;
    if r.instancia<>p_instance or r.conversa_id<>p_chat or r.telefone<>p_phone or r.texto<>p_text then
      raise exception 'Chave reutilizada com outro conteúdo' using errcode='23505';
    end if;
  end if;
  return pg_catalog.jsonb_build_object('created',inserted,'message',pg_catalog.to_jsonb(r));
end $$;
revoke all on function public.atendimento_reservar_envio_manual(uuid,text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.atendimento_reservar_envio_manual(uuid,text,uuid,uuid,text,text) to service_role;
commit;
