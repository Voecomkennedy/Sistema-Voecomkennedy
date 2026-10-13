-- Metadados manuais do piloto de Atendimento; dados comerciais permanecem em dados_app.
begin;
create table public.atendimento_recepcao_gestao (
  user_id uuid not null references auth.users(id),
  instancia text not null,
  conversa_id uuid not null,
  etapa text not null default 'novo' check (etapa in ('novo','cotacao','aguardando','sem_resposta','emissao','encerrado')),
  etapa_em timestamptz not null default now(),
  nao_contatar boolean not null default false,
  etiquetas text[] not null default '{}' check (cardinality(etiquetas)<=8 and length(array_to_string(etiquetas,','))<=320),
  origem text not null default '' check (length(origem)<=200),
  anotacao text not null default '' check (length(anotacao)<=4000),
  proxima_acao text not null default '' check (length(proxima_acao)<=200),
  proxima_em timestamptz,
  cliente_id text check (length(cliente_id)<=120),
  cotacao_id text check (length(cotacao_id)<=120),
  venda_id text check (length(venda_id)<=120),
  visto_ate timestamptz,
  atualizado_em timestamptz not null default now(),
  primary key (user_id,instancia,conversa_id),
  foreign key (user_id,instancia,conversa_id)
    references public.atendimento_recepcao_conversas(user_id,instancia,id)
);
alter table public.atendimento_recepcao_gestao enable row level security;
revoke all on public.atendimento_recepcao_gestao from public,anon,authenticated,service_role;
grant select,insert,update on public.atendimento_recepcao_gestao to authenticated;
grant select,insert,update,delete on public.atendimento_recepcao_gestao to service_role;
create policy atendimento_recepcao_gestao_owner_select on public.atendimento_recepcao_gestao
  for select to authenticated using ((select auth.uid())=user_id);
create policy atendimento_recepcao_gestao_owner_insert on public.atendimento_recepcao_gestao
  for insert to authenticated with check ((select auth.uid())=user_id);
create policy atendimento_recepcao_gestao_owner_update on public.atendimento_recepcao_gestao
  for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
commit;
