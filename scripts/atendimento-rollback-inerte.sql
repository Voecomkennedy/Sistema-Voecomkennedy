-- Rollback MANUAL da instalação inerte, antes de qualquer uso real.
-- Testado apenas na restauração local isolada em 13/10/2026.
-- Não apaga o bucket: Supabase exige exclusão pela Storage API.
-- Não executa CASCADE nem toca Central, pos-venda ou dados_app.
begin;
do $$ begin
  if exists (select 1 from public.atendimento_conversas)
    or exists (select 1 from public.atendimento_identidades)
    or exists (select 1 from public.atendimento_mensagens)
    or exists (select 1 from public.atendimento_eventos)
    or exists (select 1 from public.atendimento_anexos)
    or exists (select 1 from public.atendimento_outbox)
    or exists (select 1 from public.atendimento_ingressos)
    or exists (select 1 from public.atendimento_encaminhamentos)
  then raise exception 'Atendimento possui linhas; interromper rollback'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'atendimento-arquivos')
  then raise exception 'Bucket de Atendimento possui objetos; interromper rollback'; end if;
end $$;
drop policy atendimento_arquivo_owner on storage.objects;
drop trigger atendimento_evento_imutavel on public.atendimento_eventos;
drop function public.atendimento_reivindicar_simulacao(uuid);
drop function public.atendimento_resultado_simulacao(uuid, uuid, uuid, text);
drop function public.atendimento_reservar_simulacao(uuid, uuid);
drop function public.atendimento_evento_imutavel();
drop table public.atendimento_ingressos;
drop table public.atendimento_encaminhamentos;
drop table public.atendimento_outbox;
drop table public.atendimento_eventos;
alter table public.atendimento_mensagens drop constraint atendimento_mensagem_anexo_fk;
drop table public.atendimento_anexos;
drop table public.atendimento_mensagens;
drop table public.atendimento_identidades;
drop table public.atendimento_conversas;
commit;
