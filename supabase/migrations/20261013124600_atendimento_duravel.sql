-- Incremento 2: aditivo, sintético e sem publicação. Aplicar somente em teste/homologação autorizada.
begin;
alter table public.atendimento_eventos add column detalhes jsonb not null default '{}'::jsonb;
alter table public.atendimento_mensagens add column anexo_id uuid;
alter table public.atendimento_mensagens add column substituida_por uuid;
alter table public.atendimento_mensagens add constraint atendimento_mensagem_substituida_fk foreign key(user_id,substituida_por) references public.atendimento_mensagens(user_id,id);
alter table public.atendimento_anexos add column requisicao_id text;
alter table public.atendimento_anexos add column estado_arquivo text not null default 'arquivado' check (estado_arquivo in ('pendente','arquivado'));
alter table public.atendimento_anexos add constraint atendimento_anexo_requisicao_key unique(user_id,requisicao_id);
alter table public.atendimento_anexos add constraint atendimento_anexo_conversa_key unique(user_id,conversa_id,id);
alter table public.atendimento_mensagens add constraint atendimento_mensagem_anexo_fk foreign key(user_id,conversa_id,anexo_id) references public.atendimento_anexos(user_id,conversa_id,id);
alter table public.atendimento_outbox add column disponivel_em timestamptz not null default now();
alter table public.atendimento_outbox add column criado_em timestamptz not null default now();
alter table public.atendimento_outbox add column tentativa_em timestamptz;
create index atendimento_outbox_pendente on public.atendimento_outbox(user_id,disponivel_em,criado_em,id) where estado in ('pendente','falha_segura');
create table public.atendimento_ingressos(
    id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),instancia text not null,
    dedupe text not null,payload jsonb not null,
    estado text not null default 'pendente' check(estado in ('pendente','processado','revisao','falha')),
    tentativas integer not null default 0 check(tentativas between 0 and 5),
    criado_em timestamptz not null default now(),disponivel_em timestamptz not null default now(),
    modo text not null default 'sintetico' check(modo='sintetico'),unique(user_id,instancia,dedupe)
);
create table public.atendimento_encaminhamentos(
    id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),instancia text not null,
    dedupe text not null,consumidor text not null check(consumidor in ('legado','atendimento')),payload jsonb not null,
    estado text not null default 'pendente' check(estado in ('pendente','tentativa','concluido','incerto')),
    token uuid,tentativas integer not null default 0 check(tentativas between 0 and 3),
    modo text not null default 'sintetico' check(modo='sintetico'),criado_em timestamptz not null default now(),
    unique(user_id,instancia,dedupe,consumidor)
);
do $$ declare t text;begin
    foreach t in array array['atendimento_ingressos','atendimento_encaminhamentos'] loop
        execute format('alter table public.%I enable row level security',t);
        execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
        execute format('grant select on public.%I to authenticated',t);
        execute format('grant select,insert,update,delete on public.%I to service_role',t);
        execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid())=user_id)',t||'_owner',t);
    end loop;
end $$;
-- Uma reserva por vez. Resultado não confirmado nunca volta à fila por expiração.
create function public.atendimento_reivindicar_simulacao(p_owner uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare chosen uuid;job jsonb;
begin
    select id into chosen from public.atendimento_outbox where user_id=p_owner and estado in ('pendente','falha_segura') and tentativas<3 and disponivel_em<=clock_timestamp() order by criado_em,id for update skip locked limit 1;
    if not found then return null;end if;
    job:=public.atendimento_reservar_simulacao(p_owner,chosen);
    if job is not null then update public.atendimento_outbox set tentativa_em=clock_timestamp() where id=chosen;end if;
    return job;
end $$;
revoke all on function public.atendimento_reivindicar_simulacao(uuid) from public,anon,authenticated;
grant execute on function public.atendimento_reivindicar_simulacao(uuid) to service_role;
commit;
