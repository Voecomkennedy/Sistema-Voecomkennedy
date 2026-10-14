-- LOCAL CANDIDATE ONLY. No production application is part of this branch.
-- Additive snapshot history for INSERT/UPDATE, including legacy clients/jobs.
alter table public.dados_app add column if not exists ultima_operacao_id uuid;

create table public.dados_app_historico (
    user_id uuid not null references auth.users(id),
    operacao_id uuid not null,
    versao_antes bigint,
    versao_depois bigint not null,
    conteudo_antes jsonb,
    conteudo_depois jsonb not null,
    criado_em timestamptz not null default pg_catalog.clock_timestamp(),
    primary key (user_id, operacao_id),
    unique (user_id, versao_depois)
);
alter table public.dados_app_historico enable row level security;
revoke all on public.dados_app_historico from public, anon, authenticated, service_role;
grant select, insert on public.dados_app_historico to authenticated, service_role;
create policy historico_select_proprio on public.dados_app_historico for select to authenticated
    using ((select auth.uid()) = user_id);
-- An inserted snapshot must match the real committed account row. Existing
-- operation/version uniqueness prevents forged replacement of captured history.
create policy historico_insert_estado on public.dados_app_historico for insert to authenticated
    with check ((select auth.uid()) = user_id and exists (
        select 1 from public.dados_app d where d.user_id = dados_app_historico.user_id
            and d.ultima_operacao_id = dados_app_historico.operacao_id
            and d.versao = dados_app_historico.versao_depois
            and d.conteudo = dados_app_historico.conteudo_depois
    ));

create function public.integridade_identificar_operacao() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
    if tg_table_schema <> 'public' or tg_table_name <> 'dados_app' then
        raise exception 'Invalid integrity trigger target';
    end if;
    if tg_op = 'UPDATE' then
        if new.versao <= old.versao then raise exception 'Account version must advance' using errcode='40001'; end if;
        if new.ultima_operacao_id is null or new.ultima_operacao_id = old.ultima_operacao_id then
            new.ultima_operacao_id := pg_catalog.gen_random_uuid();
        end if;
    elsif new.ultima_operacao_id is null then new.ultima_operacao_id := pg_catalog.gen_random_uuid();
    end if;
    return new;
end;
$$;

create function public.integridade_capturar_historico() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
    if tg_table_schema <> 'public' or tg_table_name <> 'dados_app' then
        raise exception 'Invalid integrity trigger target';
    end if;
    insert into public.dados_app_historico(user_id,operacao_id,versao_antes,versao_depois,conteudo_antes,conteudo_depois)
    values(new.user_id,new.ultima_operacao_id,
        case when tg_op='UPDATE' then old.versao else null end,new.versao,
        case when tg_op='UPDATE' then old.conteudo else null end,new.conteudo);
    return new;
end;
$$;
revoke all on function public.integridade_identificar_operacao() from public, anon, authenticated, service_role;
revoke all on function public.integridade_capturar_historico() from public, anon, authenticated, service_role;

create trigger integridade_identificar before insert or update on public.dados_app
    for each row execute function public.integridade_identificar_operacao();
create trigger integridade_historico after insert or update on public.dados_app
    for each row execute function public.integridade_capturar_historico();

-- Physical DELETE is intentionally not intercepted. Existing ownership policies
-- are untouched. A deletion/retention policy requires a separate approved rollout.
