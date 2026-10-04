-- Central isolada, exclusivamente em simulação. Sem cron, rede ou importação legada.
create schema if not exists mensagens_privado;
revoke all on schema mensagens_privado from public, anon, authenticated;
grant usage on schema mensagens_privado to service_role;

create table public.mensagens_preferencias (
    user_id uuid primary key references auth.users(id),
    versao bigint not null check (versao >= 1),
    config jsonb not null check (jsonb_typeof(config) = 'object'),
    modelos jsonb not null check (jsonb_typeof(modelos) = 'object'),
    viagens jsonb not null check (jsonb_typeof(viagens) = 'object'),
    atualizado_em timestamptz not null default clock_timestamp()
);

create table public.mensagens_tarefas (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id),
    venda_id text not null check (length(venda_id) between 1 and 200),
    tipo text not null check (tipo in ('48h','24h','dia','volta_checkin','volta')),
    modo text not null default 'simulacao' check (modo = 'simulacao'),
    estado text not null default 'pendente' check (estado in ('pendente','pausada','reservada','tentativa','simulada','incerto','falha','cancelada','expirada')),
    revision uuid not null default gen_random_uuid(),
    chave_conversa text not null check (length(chave_conversa) between 1 and 512),
    agendado_em timestamptz not null,
    expira_em timestamptz not null,
    embarque_em timestamptz not null,
    destinatario text not null check (destinatario ~ '^[1-9][0-9]{7,14}$'),
    texto text not null check (length(texto) between 1 and 4000),
    contexto jsonb not null check (jsonb_typeof(contexto) = 'object'),
    modelo_snapshot jsonb not null check (jsonb_typeof(modelo_snapshot) = 'object'),
    regra_snapshot jsonb not null check (jsonb_typeof(regra_snapshot) = 'object'),
    fuso_voo text not null,
    fuso_operador text not null,
    origem_versao bigint not null check (origem_versao >= 0),
    preferencias_versao bigint not null check (preferencias_versao >= 1),
    fonte_hash text not null,
    reserva_token uuid,
    tentativa_em timestamptz,
    pausa_manual boolean not null default false,
    cancelamento_manual boolean not null default false,
    criado_em timestamptz not null default clock_timestamp(),
    atualizado_em timestamptz not null default clock_timestamp(),
    unique (user_id, venda_id, tipo, modo),
    unique (id, user_id),
    check (expira_em > agendado_em),
    check (expira_em <= agendado_em + interval '60 minutes')
);
create index mensagens_tarefas_agenda on public.mensagens_tarefas(user_id, agendado_em);

create table public.mensagens_historico (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id),
    tarefa_id uuid not null,
    estado text not null,
    detalhe jsonb not null default '{}'::jsonb check (jsonb_typeof(detalhe) = 'object' and octet_length(detalhe::text) <= 32768),
    snapshot jsonb not null,
    criado_em timestamptz not null default clock_timestamp(),
    foreign key (tarefa_id, user_id) references public.mensagens_tarefas(id, user_id)
);
create index mensagens_historico_owner_data on public.mensagens_historico(user_id, criado_em desc);

create table mensagens_privado.conversas (
    user_id uuid not null references auth.users(id),
    chave_conversa text not null,
    tarefa_id uuid not null,
    reserva_token uuid not null,
    criado_em timestamptz not null default clock_timestamp(),
    primary key (user_id, chave_conversa),
    foreign key (tarefa_id, user_id) references public.mensagens_tarefas(id, user_id)
);

alter table public.mensagens_preferencias enable row level security;
alter table public.mensagens_tarefas enable row level security;
alter table public.mensagens_historico enable row level security;
alter table mensagens_privado.conversas enable row level security;
revoke all on public.mensagens_preferencias, public.mensagens_tarefas, public.mensagens_historico from public, anon, authenticated;
revoke all on mensagens_privado.conversas from public, anon, authenticated;
grant select on public.mensagens_preferencias, public.mensagens_tarefas, public.mensagens_historico to authenticated;
grant select, insert, update on public.mensagens_preferencias, public.mensagens_tarefas to service_role;
grant select, insert on public.mensagens_historico to service_role;
grant select, insert, delete on mensagens_privado.conversas to service_role;
-- SELECT FOR UPDATE da fonte necessita UPDATE, já concedido ao serviço no Supabase.
grant select, update on public.dados_app to service_role;
create policy mensagens_preferencias_owner on public.mensagens_preferencias for select to authenticated using ((select auth.uid()) = user_id);
create policy mensagens_tarefas_owner on public.mensagens_tarefas for select to authenticated using ((select auth.uid()) = user_id);
create policy mensagens_historico_owner on public.mensagens_historico for select to authenticated using ((select auth.uid()) = user_id);

create function mensagens_privado.fonte_bloqueada(p_user_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v jsonb;
begin
    if p_user_id is null then raise sqlstate 'PT422' using message = 'OWNER_REQUIRED'; end if;
    select to_jsonb(d) into v from public.dados_app d where d.user_id = p_user_id for update;
    if v is null then raise sqlstate 'PT409' using message = 'SOURCE_NOT_FOUND'; end if;
    return v;
end $$;

create function public.mensagens_fonte(p_user_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare fonte jsonb;
begin
    if p_user_id is null then raise sqlstate 'PT422' using message='OWNER_REQUIRED'; end if;
    -- Versão, conteúdo e fingerprint vêm da mesma leitura MVCC. O hash nunca é
    -- calculado pelo navegador nem aceito como substituto para a fonte atual.
    select jsonb_build_object('versao',d.versao,'conteudo',d.conteudo,'fingerprint',md5(d.conteudo::text))
      into fonte from public.dados_app d where d.user_id=p_user_id;
    return fonte;
end $$;

create function mensagens_privado.registrar(p_tarefa public.mensagens_tarefas, p_detalhe jsonb default '{}'::jsonb) returns void
language sql security invoker set search_path = '' as $$
    insert into public.mensagens_historico(user_id,tarefa_id,estado,detalhe,snapshot)
    values (p_tarefa.user_id,p_tarefa.id,p_tarefa.estado,p_detalhe,to_jsonb(p_tarefa));
$$;

create function mensagens_privado.historico_imutavel() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin raise sqlstate 'PT422' using message = 'HISTORY_IMMUTABLE'; end $$;
create trigger mensagens_historico_imutavel before update or delete on public.mensagens_historico
for each row execute function mensagens_privado.historico_imutavel();

create function mensagens_privado.validar_preferencias(p_config jsonb,p_modelos jsonb,p_viagens jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare tipo text; m jsonb; v jsonb; z text;
begin
    if jsonb_typeof(p_config) is distinct from 'object' or jsonb_typeof(p_modelos) is distinct from 'object' or jsonb_typeof(p_viagens) is distinct from 'object'
       or octet_length(p_config::text) > 4096 or octet_length(p_modelos::text) > 40000 or octet_length(p_viagens::text) > 1000000 then
        raise sqlstate 'PT422' using message = 'INVALID_PREFERENCES';
    end if;
    if jsonb_typeof(p_config->'pausado') is distinct from 'boolean'
       or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_config->>'fuso')
       or coalesce(p_config->>'silencioInicio','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or coalesce(p_config->>'silencioFim','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or p_config->>'silencioInicio' = p_config->>'silencioFim'
       or jsonb_typeof(p_config->'numeroTeste') is distinct from 'string'
       or (p_config->>'numeroTeste' <> '' and p_config->>'numeroTeste' !~ '^\+[1-9][0-9]{7,14}$') then
        raise sqlstate 'PT422' using message = 'INVALID_CONFIG';
    end if;
    foreach tipo in array array['48h','24h','dia','volta_checkin','volta'] loop
        m := p_modelos->tipo;
        if jsonb_typeof(m) is distinct from 'object' or jsonb_typeof(m->'ativo') is distinct from 'boolean'
           or jsonb_typeof(m->'texto') is distinct from 'string' or length(m->>'texto') not between 1 and 4000
           or jsonb_typeof(m->'nome') is distinct from 'string' or length(m->>'nome') not between 1 and 120
           or jsonb_typeof(m->'antecedenciaMinutos') is distinct from 'number'
           or coalesce(m->>'antecedenciaMinutos','') !~ '^[0-9]{1,5}$'
           or jsonb_typeof(m->'validadeMinutos') is distinct from 'number'
           or coalesce(m->>'validadeMinutos','') !~ '^[0-9]{1,2}$' then
            raise sqlstate 'PT422' using message = 'INVALID_TEMPLATE';
        end if;
        if (m->>'antecedenciaMinutos')::integer not between 0 and 10080 or (m->>'validadeMinutos')::integer not between 1 and 60 then
            raise sqlstate 'PT422' using message = 'INVALID_TEMPLATE_WINDOW';
        end if;
    end loop;
    for v in select value from jsonb_each(p_viagens) loop
        if jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'emissaoConfirmada') is distinct from 'boolean' then
            raise sqlstate 'PT422' using message = 'INVALID_TRIP';
        end if;
        foreach z in array array[v->>'fusoIda',v->>'fusoVolta'] loop
            if z is null or (z <> '' and not exists (select 1 from pg_catalog.pg_timezone_names where name = z)) then
                raise sqlstate 'PT422' using message = 'INVALID_TRIP_TIMEZONE';
            end if;
        end loop;
        if v ? 'fusoChegada' then
            if jsonb_typeof(v->'fusoChegada') is distinct from 'string' or ((v->>'fusoChegada')<>'' and not exists(select 1 from pg_catalog.pg_timezone_names where name=v->>'fusoChegada')) then
                raise sqlstate 'PT422' using message = 'INVALID_ARRIVAL_TIMEZONE';
            end if;
        end if;
        if jsonb_typeof(v->'chegadaFinal') is distinct from 'string' then raise sqlstate 'PT422' using message = 'INVALID_ARRIVAL'; end if;
        if v->>'chegadaFinal' <> '' then
            if v->>'chegadaFinal' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise sqlstate 'PT422' using message = 'INVALID_ARRIVAL'; end if;
            begin perform (v->>'chegadaFinal')::timestamptz;
            exception when others then raise sqlstate 'PT422' using message = 'INVALID_ARRIVAL'; end;
        end if;
    end loop;
end $$;

create function mensagens_privado.hash_fonte(p_fonte jsonb,p_venda_id text) returns text
language plpgsql security invoker set search_path = '' as $$
declare v jsonb; c jsonb; cotacoes jsonb; vinculadas jsonb; quantidade integer;
begin
    if jsonb_typeof(p_fonte->'conteudo'->'emissao_vendas') is distinct from 'array'
       or jsonb_typeof(p_fonte->'conteudo'->'emissao_pessoas') is distinct from 'array' then return null; end if;
    select count(*) into quantidade from jsonb_array_elements(p_fonte->'conteudo'->'emissao_vendas') x where x->>'id'=p_venda_id;
    if quantidade<>1 then return null; end if;
    select x into v from jsonb_array_elements(p_fonte->'conteudo'->'emissao_vendas') x where x->>'id'=p_venda_id;
    select count(*) into quantidade from jsonb_array_elements(p_fonte->'conteudo'->'emissao_pessoas') x where x->>'id'=v->>'clienteId';
    if quantidade<>1 then return null; end if;
    select x into c from jsonb_array_elements(p_fonte->'conteudo'->'emissao_pessoas') x where x->>'id'=v->>'clienteId';
    if (p_fonte->'conteudo') ? 'emissao_cotacoes' then
        cotacoes := p_fonte->'conteudo'->'emissao_cotacoes';
        if jsonb_typeof(cotacoes) is distinct from 'array' then return null; end if;
        if exists(select 1 from jsonb_array_elements(cotacoes) q where jsonb_typeof(q) is distinct from 'object') then return null; end if;
    else
        cotacoes := '[]'::jsonb;
    end if;
    -- O plano também depende das propostas vinculadas (ex.: multitrecho).
    -- Ordenar pelo JSONB canônico torna o hash independente da ordem da coleção.
    select coalesce(jsonb_agg(q order by q::text collate "C"),'[]'::jsonb)
      into vinculadas from jsonb_array_elements(cotacoes) q where q->>'vendaId'=p_venda_id;
    -- JSONB tem representação determinística. Não persistir outra cópia dos dados.
    return md5(jsonb_build_object('venda',v,'cliente',c,'cotacoes',vinculadas)::text);
end $$;

create function mensagens_privado.elegivel(p_t public.mensagens_tarefas,p_fonte jsonb,p_p public.mensagens_preferencias,p_agora timestamptz) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare hora time; inicio time; fim time; vendas jsonb; venda jsonb; quantidade integer;
begin
    if p_p.user_id is null or p_t.origem_versao <> (p_fonte->>'versao')::bigint or p_t.preferencias_versao <> p_p.versao
       or p_t.fonte_hash is distinct from mensagens_privado.hash_fonte(p_fonte,p_t.venda_id)
       or p_p.config->>'pausado' is distinct from 'false' or p_p.modelos->p_t.tipo->>'ativo' is distinct from 'true'
       or p_p.viagens->p_t.venda_id->>'emissaoConfirmada' is distinct from 'true'
       or p_t.pausa_manual or p_t.cancelamento_manual
       or p_agora < p_t.agendado_em or p_agora >= p_t.expira_em
       or (p_t.tipo <> 'volta' and p_agora >= p_t.embarque_em) then return false; end if;
    vendas := p_fonte->'conteudo'->'emissao_vendas';
    if jsonb_typeof(vendas) is distinct from 'array' then return false; end if;
    select count(*) into quantidade from jsonb_array_elements(vendas) v where v->>'id' = p_t.venda_id;
    if quantidade <> 1 then return false; end if;
    select v into venda from jsonb_array_elements(vendas) v where v->>'id' = p_t.venda_id;
    if venda->>'statusVenda' is distinct from 'emitida' or nullif(venda->>'excluidaEm','') is not null then return false; end if;
    hora := (p_agora at time zone (p_p.config->>'fuso'))::time;
    inicio := (p_p.config->>'silencioInicio')::time;
    fim := (p_p.config->>'silencioFim')::time;
    if inicio < fim and hora >= inicio and hora < fim then return false; end if;
    if inicio > fim and (hora >= inicio or hora < fim) then return false; end if;
    return true;
end $$;

create function public.mensagens_salvar_preferencias(p_user_id uuid,p_versao bigint,p_config jsonb,p_modelos jsonb,p_viagens jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare p public.mensagens_preferencias; t public.mensagens_tarefas;
begin
    perform mensagens_privado.fonte_bloqueada(p_user_id);
    perform mensagens_privado.validar_preferencias(p_config,p_modelos,p_viagens);
    select * into p from public.mensagens_preferencias where user_id=p_user_id for update;
    if p.user_id is null then
        if p_versao is distinct from 0 then raise sqlstate 'PT409' using message='PREFERENCES_VERSION_CONFLICT'; end if;
        insert into public.mensagens_preferencias(user_id,versao,config,modelos,viagens) values(p_user_id,1,p_config,p_modelos,p_viagens) returning * into p;
    else
        if p.versao is distinct from p_versao then raise sqlstate 'PT409' using message='PREFERENCES_VERSION_CONFLICT'; end if;
        update public.mensagens_preferencias set versao=versao+1,config=p_config,modelos=p_modelos,viagens=p_viagens,atualizado_em=clock_timestamp() where user_id=p_user_id returning * into p;
    end if;
    for t in select * from public.mensagens_tarefas where user_id=p_user_id and estado in ('pendente','reservada') and tentativa_em is null order by id for update loop
        update public.mensagens_tarefas set estado='cancelada',revision=gen_random_uuid(),reserva_token=null,atualizado_em=clock_timestamp() where id=t.id returning * into t;
        delete from mensagens_privado.conversas where user_id=p_user_id and tarefa_id=t.id;
        perform mensagens_privado.registrar(t,'{"motivo":"preferencias_alteradas"}'::jsonb);
    end loop;
    return to_jsonb(p);
end $$;

create function public.mensagens_preparar(p_user_id uuid,p_origem_versao bigint,p_preferencias_versao bigint,p_itens jsonb,p_fonte_hash text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare fonte jsonb; p public.mensagens_preferencias; item jsonb; novo public.mensagens_tarefas; t public.mensagens_tarefas; vistos text[] := '{}'; chave text; agora timestamptz := clock_timestamp();
begin
    fonte := mensagens_privado.fonte_bloqueada(p_user_id);
    select * into p from public.mensagens_preferencias where user_id=p_user_id for update;
    if p.user_id is null then raise sqlstate 'PT409' using message='PREFERENCES_NOT_SAVED'; end if;
    if (fonte->>'versao')::bigint is distinct from p_origem_versao or p.versao is distinct from p_preferencias_versao then raise sqlstate 'PT409' using message='SOURCE_VERSION_CONFLICT'; end if;
    if p_fonte_hash is null or p_fonte_hash !~ '^[0-9a-f]{32}$' or p_fonte_hash is distinct from md5((fonte->'conteudo')::text) then raise sqlstate 'PT409' using message='SOURCE_FINGERPRINT_CONFLICT'; end if;
    if jsonb_typeof(p_itens) is distinct from 'array' then raise sqlstate 'PT422' using message='INVALID_TASKS'; end if;
    if jsonb_typeof(fonte->'conteudo'->'emissao_vendas') is distinct from 'array' then raise sqlstate 'PT422' using message='INVALID_SOURCE'; end if;
    agora := clock_timestamp();
    if jsonb_array_length(p_itens)>5000 then raise sqlstate 'PT422' using message='TOO_MANY_TASKS'; end if;
    for item in select value from jsonb_array_elements(p_itens) loop
        if jsonb_typeof(item) is distinct from 'object' or item->>'modo' is distinct from 'simulacao'
           or (item ? 'user_id' and item->>'user_id' is distinct from p_user_id::text)
           or coalesce(item->>'tipo','') not in ('48h','24h','dia','volta_checkin','volta')
           or coalesce(item->>'venda_id','') = ''
           or coalesce(item->>'agendado_em','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
           or coalesce(item->>'expira_em','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
           or coalesce(item->>'embarque_em','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then raise sqlstate 'PT422' using message='INVALID_TASK'; end if;
        begin novo := jsonb_populate_record(null::public.mensagens_tarefas,item);
        exception when others then raise sqlstate 'PT422' using message='INVALID_TASK_FIELDS'; end;
        novo.fonte_hash := mensagens_privado.hash_fonte(fonte,novo.venda_id);
        if novo.origem_versao is distinct from p_origem_versao or novo.preferencias_versao is distinct from p_preferencias_versao
           or novo.agendado_em is null or novo.expira_em is null or novo.embarque_em is null
           or novo.expira_em <= novo.agendado_em or novo.expira_em > novo.agendado_em + interval '60 minutes'
           or jsonb_typeof(novo.contexto) is distinct from 'object' or octet_length(novo.contexto::text)>4096
           or jsonb_typeof(novo.modelo_snapshot) is distinct from 'object' or novo.modelo_snapshot->>'texto' is distinct from p.modelos->novo.tipo->>'texto'
           or jsonb_typeof(novo.regra_snapshot) is distinct from 'object'
           or novo.regra_snapshot->'antecedenciaMinutos' is distinct from p.modelos->novo.tipo->'antecedenciaMinutos'
           or novo.regra_snapshot->'validadeMinutos' is distinct from p.modelos->novo.tipo->'validadeMinutos'
           or novo.fuso_operador is distinct from p.config->>'fuso'
           or not exists (select 1 from pg_catalog.pg_timezone_names where name=novo.fuso_voo)
           or not exists (select 1 from jsonb_array_elements(fonte->'conteudo'->'emissao_vendas') v where v->>'id'=novo.venda_id and v->>'statusVenda'='emitida' and nullif(v->>'excluidaEm','') is null)
           or p.viagens->novo.venda_id->>'emissaoConfirmada' is distinct from 'true' then raise sqlstate 'PT422' using message='UNSAFE_TASK'; end if;
        if novo.fonte_hash is null then raise sqlstate 'PT422' using message='AMBIGUOUS_SOURCE'; end if;
        chave := novo.venda_id || ':' || novo.tipo;
        if chave=any(vistos) then raise sqlstate 'PT422' using message='DUPLICATE_TASK'; end if;
        vistos := array_append(vistos,chave);
        select * into t from public.mensagens_tarefas where user_id=p_user_id and venda_id=novo.venda_id and tipo=novo.tipo and modo='simulacao' for update;
        if t.id is not null and (t.tentativa_em is not null or t.cancelamento_manual or t.estado in ('tentativa','simulada','incerto','falha','expirada')) then continue; end if;
        if t.estado='reservada' and t.origem_versao=p_origem_versao and t.preferencias_versao=p_preferencias_versao and t.fonte_hash=novo.fonte_hash then continue; end if;
        if t.id is not null then delete from mensagens_privado.conversas where user_id=p_user_id and tarefa_id=t.id; end if;
        insert into public.mensagens_tarefas(id,user_id,venda_id,tipo,modo,estado,chave_conversa,agendado_em,expira_em,embarque_em,destinatario,texto,contexto,modelo_snapshot,regra_snapshot,fuso_voo,fuso_operador,origem_versao,preferencias_versao,fonte_hash,pausa_manual)
        values(coalesce(t.id,gen_random_uuid()),p_user_id,novo.venda_id,novo.tipo,'simulacao',case when agora>=novo.expira_em or (novo.tipo<>'volta' and agora>=novo.embarque_em) then 'expirada' when coalesce(t.pausa_manual,false) then 'pausada' else 'pendente' end,novo.chave_conversa,novo.agendado_em,novo.expira_em,novo.embarque_em,novo.destinatario,novo.texto,novo.contexto,novo.modelo_snapshot,novo.regra_snapshot,novo.fuso_voo,novo.fuso_operador,p_origem_versao,p_preferencias_versao,novo.fonte_hash,coalesce(t.pausa_manual,false))
        on conflict(id) do update set estado=excluded.estado,revision=gen_random_uuid(),chave_conversa=excluded.chave_conversa,agendado_em=excluded.agendado_em,expira_em=excluded.expira_em,embarque_em=excluded.embarque_em,destinatario=excluded.destinatario,texto=excluded.texto,contexto=excluded.contexto,modelo_snapshot=excluded.modelo_snapshot,regra_snapshot=excluded.regra_snapshot,fuso_voo=excluded.fuso_voo,fuso_operador=excluded.fuso_operador,origem_versao=excluded.origem_versao,preferencias_versao=excluded.preferencias_versao,fonte_hash=excluded.fonte_hash,reserva_token=null,atualizado_em=clock_timestamp() returning * into t;
        perform mensagens_privado.registrar(t,'{"motivo":"agenda_preparada"}'::jsonb);
    end loop;
    for t in select * from public.mensagens_tarefas where user_id=p_user_id and not ((venda_id||':'||tipo)=any(vistos)) and estado in ('pendente','reservada') and tentativa_em is null order by id for update loop
        update public.mensagens_tarefas set estado='cancelada',revision=gen_random_uuid(),reserva_token=null,atualizado_em=clock_timestamp() where id=t.id returning * into t;
        delete from mensagens_privado.conversas where user_id=p_user_id and tarefa_id=t.id;
        perform mensagens_privado.registrar(t,'{"motivo":"fora_da_agenda"}'::jsonb);
    end loop;
    return coalesce((select jsonb_agg(to_jsonb(q) order by q.agendado_em,q.id) from public.mensagens_tarefas q where q.user_id=p_user_id),'[]'::jsonb);
end $$;

create function public.mensagens_controlar(p_user_id uuid,p_id uuid,p_comando text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t public.mensagens_tarefas;
begin
    perform mensagens_privado.fonte_bloqueada(p_user_id);
    perform 1 from public.mensagens_preferencias where user_id=p_user_id for update;
    select * into t from public.mensagens_tarefas where id=p_id and user_id=p_user_id for update;
    if t.id is null then raise sqlstate 'PT404' using message='TASK_NOT_FOUND'; end if;
    if p_comando not in ('pausar','retomar','cancelar') or p_comando is null then raise sqlstate 'PT422' using message='INVALID_COMMAND'; end if;
    if t.estado='expirada' then return to_jsonb(t); end if;
    if t.tentativa_em is not null or t.estado not in ('pendente','pausada','reservada') then raise sqlstate 'PT409' using message='TASK_NOT_CONTROLLABLE'; end if;
    update public.mensagens_tarefas set
        estado=case when clock_timestamp()>=expira_em or (tipo<>'volta' and clock_timestamp()>=embarque_em) then 'expirada' when p_comando='cancelar' then 'cancelada' when p_comando='pausar' then 'pausada' else 'pendente' end,
        pausa_manual=(p_comando='pausar'),cancelamento_manual=(p_comando='cancelar'),revision=gen_random_uuid(),reserva_token=null,atualizado_em=clock_timestamp()
        where id=t.id returning * into t;
    delete from mensagens_privado.conversas where user_id=p_user_id and tarefa_id=t.id;
    perform mensagens_privado.registrar(t,jsonb_build_object('comando',p_comando));
    return to_jsonb(t);
end $$;

create function public.mensagens_reservar(p_user_id uuid,p_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare fonte jsonb; p public.mensagens_preferencias; t public.mensagens_tarefas; token uuid := gen_random_uuid(); obtido uuid;
begin
    fonte := mensagens_privado.fonte_bloqueada(p_user_id);
    select * into p from public.mensagens_preferencias where user_id=p_user_id for update;
    select * into t from public.mensagens_tarefas where id=p_id and user_id=p_user_id for update;
    if t.id is null or t.estado<>'pendente' or t.tentativa_em is not null then return null; end if;
    if not mensagens_privado.elegivel(t,fonte,p,clock_timestamp()) then return null; end if;
    insert into mensagens_privado.conversas(user_id,chave_conversa,tarefa_id,reserva_token) values(p_user_id,t.chave_conversa,t.id,token)
        on conflict(user_id,chave_conversa) do nothing returning reserva_token into obtido;
    if obtido is null then return null; end if;
    update public.mensagens_tarefas set estado='reservada',reserva_token=token,atualizado_em=clock_timestamp() where id=t.id returning * into t;
    perform mensagens_privado.registrar(t);
    return to_jsonb(t);
end $$;

create function public.mensagens_iniciar(p_user_id uuid,p_id uuid,p_token uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare fonte jsonb; p public.mensagens_preferencias; t public.mensagens_tarefas;
begin
    fonte := mensagens_privado.fonte_bloqueada(p_user_id);
    select * into p from public.mensagens_preferencias where user_id=p_user_id for update;
    select * into t from public.mensagens_tarefas where id=p_id and user_id=p_user_id for update;
    if t.id is null or t.estado<>'reservada' or t.tentativa_em is not null or p_token is null or t.reserva_token is distinct from p_token then return null; end if;
    if not mensagens_privado.elegivel(t,fonte,p,clock_timestamp()) then return null; end if;
    if not exists(select 1 from mensagens_privado.conversas where user_id=p_user_id and chave_conversa=t.chave_conversa and tarefa_id=t.id and reserva_token=p_token) then return null; end if;
    update public.mensagens_tarefas set estado='tentativa',tentativa_em=clock_timestamp(),atualizado_em=clock_timestamp() where id=t.id returning * into t;
    perform mensagens_privado.registrar(t);
    return to_jsonb(t);
end $$;

create function public.mensagens_concluir(p_user_id uuid,p_id uuid,p_token uuid,p_estado text,p_detalhe jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare t public.mensagens_tarefas;
begin
    perform mensagens_privado.fonte_bloqueada(p_user_id);
    perform 1 from public.mensagens_preferencias where user_id=p_user_id for update;
    select * into t from public.mensagens_tarefas where id=p_id and user_id=p_user_id for update;
    if t.id is null or t.estado<>'tentativa' or t.tentativa_em is null or p_token is null or t.reserva_token is distinct from p_token then return null; end if;
    if p_estado not in ('simulada','incerto','falha') or p_estado is null or jsonb_typeof(p_detalhe) is distinct from 'object' or octet_length(p_detalhe::text)>32768 then raise sqlstate 'PT422' using message='INVALID_COMPLETION'; end if;
    if exists(select 1 from jsonb_object_keys(p_detalhe) k where k not in ('id_simulado','motivo','texto','contexto','simulado_em','modo')) then raise sqlstate 'PT422' using message='INVALID_COMPLETION_DETAIL'; end if;
    if (p_detalhe ? 'modo' and p_detalhe->>'modo' is distinct from 'simulacao')
       or (p_estado='simulada' and (p_detalhe->>'modo' is distinct from 'simulacao' or coalesce(p_detalhe->>'id_simulado','') !~ '^sim-[A-Za-z0-9-]{1,200}$'))
       or (p_detalhe ? 'texto' and (jsonb_typeof(p_detalhe->'texto') is distinct from 'string' or length(p_detalhe->>'texto') not between 1 and 4000))
       or (p_detalhe ? 'motivo' and (jsonb_typeof(p_detalhe->'motivo') is distinct from 'string' or length(p_detalhe->>'motivo')>500)) then raise sqlstate 'PT422' using message='INVALID_SIMULATION_DETAIL'; end if;
    if p_detalhe ? 'contexto' then
        if jsonb_typeof(p_detalhe->'contexto') is distinct from 'object' then raise sqlstate 'PT422' using message='INVALID_CONTEXT'; end if;
        if exists(select 1 from jsonb_each(p_detalhe->'contexto') x where x.key not in ('primeiro_nome','origem','destino','data_voo','hora_voo','quando') or jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>200) then raise sqlstate 'PT422' using message='INVALID_CONTEXT'; end if;
    end if;
    update public.mensagens_tarefas set estado=p_estado,atualizado_em=clock_timestamp() where id=t.id returning * into t;
    -- Tombstone de conversa após qualquer tentativa: não há liberação automática,
    -- nem por sucesso simulado nem por falha/incerteza. Reconciliação é outra etapa.
    perform mensagens_privado.registrar(t,p_detalhe);
    return to_jsonb(t);
end $$;

-- Nenhuma função de escrita ou helper pode ser executada pelo navegador.
revoke all on all functions in schema mensagens_privado from public, anon, authenticated;
grant execute on all functions in schema mensagens_privado to service_role;
revoke all on function public.mensagens_fonte(uuid),public.mensagens_salvar_preferencias(uuid,bigint,jsonb,jsonb,jsonb),public.mensagens_preparar(uuid,bigint,bigint,jsonb,text),public.mensagens_controlar(uuid,uuid,text),public.mensagens_reservar(uuid,uuid),public.mensagens_iniciar(uuid,uuid,uuid),public.mensagens_concluir(uuid,uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.mensagens_fonte(uuid),public.mensagens_salvar_preferencias(uuid,bigint,jsonb,jsonb,jsonb),public.mensagens_preparar(uuid,bigint,bigint,jsonb,text),public.mensagens_controlar(uuid,uuid,text),public.mensagens_reservar(uuid,uuid),public.mensagens_iniciar(uuid,uuid,uuid),public.mensagens_concluir(uuid,uuid,uuid,text,jsonb) to service_role;
