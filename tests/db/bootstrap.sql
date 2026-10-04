-- Test harness only. Never apply to a Supabase project or operational database.
do $$ begin
  if current_database() <> 'vck_central_test' or inet_server_addr() <> inet '127.0.0.1' then
    raise exception 'This harness requires the dedicated local vck_central_test database';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create table if not exists public.dados_app(
  user_id uuid primary key references auth.users(id),
  conteudo jsonb not null default '{}'::jsonb,
  versao bigint not null default 0,
  atualizado_em timestamptz not null default now()
);
alter table public.dados_app enable row level security;
drop policy if exists dados_app_test_owner on public.dados_app;
create policy dados_app_test_owner on public.dados_app to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.dados_app to authenticated, service_role;
