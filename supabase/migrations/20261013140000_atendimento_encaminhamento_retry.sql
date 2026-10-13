-- PREPARADA, NÃO APLICADA REMOTAMENTE. Somente fila sintética do Atendimento.
begin;
alter table public.atendimento_encaminhamentos
    add column disponivel_em timestamptz not null default now();
create index atendimento_encaminhamento_pendente
    on public.atendimento_encaminhamentos(user_id,consumidor,disponivel_em,criado_em,id)
    where estado='pendente';
commit;
