-- INSTALADA INERTE EM 13/10/2026. MVP sintético; não modifica dados_app, Central, pos-venda ou cron.
begin;
create table public.atendimento_conversas (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id),
    instancia text not null check (length(instancia) between 1 and 160),
    nome text not null default '' check (length(nome) <= 200),
    cliente_id text, cotacao_id text, venda_id text,
    origem_contato text not null default '' check (length(origem_contato) <= 120),
    etiquetas text[] not null default '{}' check (cardinality(etiquetas) <= 10),
    criado_em timestamptz not null default now(),
    unique (user_id, id), unique (user_id,instancia,id)
);
create table public.atendimento_identidades (
    user_id uuid not null references auth.users(id), conversa_id uuid not null,
    instancia text not null, tipo text not null check (tipo in ('telefone','lid')),
    valor text not null check (length(valor) between 5 and 160),
    evidencia_evento text not null check (length(evidencia_evento) between 1 and 200),
    primary key (user_id, instancia, tipo, valor),
    foreign key (user_id,instancia,conversa_id) references public.atendimento_conversas(user_id,instancia,id)
);
create table public.atendimento_mensagens (
    id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), conversa_id uuid not null,
    instancia text not null, provedor_id text, requisicao_id text,
    direcao text not null check (direcao in ('entrada','saida')),
    texto text not null default '' check (length(texto) <= 10000),
    estado text not null default 'pendente' check (estado in ('pendente','aceita','entregue','lida')),
    modo text not null default 'sintetico' check (modo = 'sintetico'),
    ocorrido_em timestamptz not null, lida_em timestamptz,
    unique (user_id,id), unique (user_id,conversa_id,id), unique (user_id,instancia,provedor_id), unique (user_id,requisicao_id),
    foreign key (user_id,instancia,conversa_id) references public.atendimento_conversas(user_id,instancia,id)
);
create index atendimento_mensagens_timeline on public.atendimento_mensagens(user_id,conversa_id,ocorrido_em,id);
create table public.atendimento_eventos (
    id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
    instancia text not null, dedupe text not null, tipo text not null,
    mensagem_id uuid, provedor_id text, estado text, ocorrido_em timestamptz not null,
    recebido_em timestamptz not null default now(),
    unique (user_id,instancia,dedupe),
    foreign key (user_id,mensagem_id) references public.atendimento_mensagens(user_id,id)
);
create table public.atendimento_anexos (
    id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
    conversa_id uuid not null, mensagem_id uuid,
    nome text not null check (length(nome) between 1 and 120),
    mime text not null check (mime = 'application/pdf'),
    tamanho bigint not null check (tamanho between 5 and 5242880),
    sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
    caminho text not null, criado_em timestamptz not null default now(),
    unique (user_id,id), unique (caminho),
    check (caminho = user_id::text || '/' || conversa_id::text || '/' || id::text || '.pdf'),
    foreign key (user_id,conversa_id) references public.atendimento_conversas(user_id,id),
    foreign key (user_id,conversa_id,mensagem_id) references public.atendimento_mensagens(user_id,conversa_id,id)
);
create table public.atendimento_outbox (
    id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), mensagem_id uuid not null,
    modo text not null default 'sintetico' check (modo = 'sintetico'),
    estado text not null default 'pendente' check (estado in ('pendente','tentativa','falha_segura','simulada','incerto')),
    tentativas integer not null default 0 check (tentativas between 0 and 3), token uuid,
    unique (user_id,mensagem_id), foreign key (user_id,mensagem_id) references public.atendimento_mensagens(user_id,id)
);
-- Remove defaults amplos; navegador lê somente suas linhas. Escrita só por serviço no servidor.
do $$ declare t text; begin
    foreach t in array array['atendimento_conversas','atendimento_identidades','atendimento_mensagens','atendimento_eventos','atendimento_anexos','atendimento_outbox'] loop
        execute format('alter table public.%I enable row level security',t);
        execute format('revoke all on public.%I from public, anon, authenticated, service_role',t);
        execute format('grant select on public.%I to authenticated',t);
        execute format('grant select, insert, update, delete on public.%I to service_role',t);
        execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',t || '_owner',t);
    end loop;
end $$;
revoke update,delete on public.atendimento_eventos from service_role;
create function public.atendimento_evento_imutavel() returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Eventos de atendimento são imutáveis'; end $$;
revoke all on function public.atendimento_evento_imutavel() from public,anon,authenticated;
create trigger atendimento_evento_imutavel before update or delete on public.atendimento_eventos for each row execute function public.atendimento_evento_imutavel();
-- Reserva local demonstrável. Sem chamada externa, lease ou retomada automática de resultado incerto.
create function public.atendimento_reservar_simulacao(p_owner uuid,p_id uuid) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare job public.atendimento_outbox; msg public.atendimento_mensagens;
begin
    select * into job from public.atendimento_outbox where user_id=p_owner and id=p_id for update;
    if not found or job.estado not in ('pendente','falha_segura') or job.tentativas >= 3 then return null; end if;
    select * into msg from public.atendimento_mensagens where user_id=p_owner and id=job.mensagem_id;
    if not found or msg.direcao <> 'saida' or msg.requisicao_id is null then return null; end if;
    update public.atendimento_outbox set estado='tentativa',tentativas=tentativas+1,token=gen_random_uuid() where id=p_id returning * into job;
    insert into public.atendimento_eventos(user_id,instancia,dedupe,tipo,mensagem_id,ocorrido_em) values(p_owner,msg.instancia,'attempt:' || job.token::text,'tentativa',msg.id,clock_timestamp());
    return to_jsonb(job);
end $$;
create function public.atendimento_resultado_simulacao(p_owner uuid,p_id uuid,p_token uuid,p_resultado text) returns boolean language plpgsql security invoker set search_path = '' as $$
declare job public.atendimento_outbox; msg public.atendimento_mensagens;
begin
    if p_resultado not in ('falha_segura','simulada','incerto') then raise exception 'Resultado inválido'; end if;
    select * into job from public.atendimento_outbox where user_id=p_owner and id=p_id for update;
    if not found or job.estado <> 'tentativa' or job.token is distinct from p_token then return false; end if;
    select * into msg from public.atendimento_mensagens where user_id=p_owner and id=job.mensagem_id;
    update public.atendimento_outbox set estado=p_resultado where id=p_id;
    insert into public.atendimento_eventos(user_id,instancia,dedupe,tipo,mensagem_id,estado,ocorrido_em) values(p_owner,msg.instancia,'result:' || p_token::text,'resultado',msg.id,p_resultado,clock_timestamp());
    return true;
end $$;
revoke all on function public.atendimento_reservar_simulacao(uuid,uuid),public.atendimento_resultado_simulacao(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.atendimento_reservar_simulacao(uuid,uuid),public.atendimento_resultado_simulacao(uuid,uuid,uuid,text) to service_role;
-- Bucket NOVO privado. Bytes, não URL expirada do provedor. Nenhum bucket existente é alterado.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('atendimento-arquivos','atendimento-arquivos',false,5242880,array['application/pdf']);
create policy atendimento_arquivo_owner on storage.objects for select to authenticated
using (bucket_id='atendimento-arquivos' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
