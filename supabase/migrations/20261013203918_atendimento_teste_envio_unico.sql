-- Reserva irrevogável para um único teste manual. Preparada; não aplicar neste piloto de entrada.
begin;

create table public.atendimento_teste_envio_unico (
  chave text primary key check (chave = 'piloto_texto_1'),
  user_id uuid not null references auth.users(id),
  instancia text not null check (length(instancia) between 1 and 160),
  estado text not null check (estado in ('reservado','aceito','incerto')),
  solicitado_em timestamptz not null default now(),
  respondido_em timestamptz,
  provedor_id text check (length(provedor_id) between 1 and 160),
  http_status integer check (http_status between 100 and 599)
);

alter table public.atendimento_teste_envio_unico enable row level security;
revoke all on public.atendimento_teste_envio_unico from public, anon, authenticated, service_role;
grant select, insert, update on public.atendimento_teste_envio_unico to service_role;

commit;
