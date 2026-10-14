-- LOCAL CANDIDATE. Apply only after separate approval. Preserve all legacy rows.
-- Business rejection must not use SQLSTATE 40001: PostgREST/Hasql retries
-- serialization failures, but a non-advancing account version cannot succeed
-- on retry. Keep the same CAS/identity rules and return explicit HTTP 409.
create or replace function public.integridade_identificar_operacao() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
    if tg_table_schema <> 'public' or tg_table_name <> 'dados_app' then
        raise exception 'Invalid integrity trigger target';
    end if;
    if tg_op = 'UPDATE' then
        if new.versao <= old.versao then raise exception 'Account version must advance' using errcode='PT409'; end if;
        if new.ultima_operacao_id is null or new.ultima_operacao_id = old.ultima_operacao_id then
            new.ultima_operacao_id := pg_catalog.gen_random_uuid();
        end if;
    elsif new.ultima_operacao_id is null then new.ultima_operacao_id := pg_catalog.gen_random_uuid();
    end if;
    return new;
end;
$$;

create schema integridade_privado;
revoke all on schema integridade_privado from public, anon;
grant usage on schema integridade_privado to authenticated, service_role;

create function integridade_privado.hash_documento(p_body jsonb) returns text
language sql immutable strict security invoker set search_path='' as $$
 select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_body::text,'UTF8')),'hex')
$$;
create table integridade_privado.baselines (
 user_id uuid not null references auth.users(id), versao bigint not null,
 conteudo jsonb not null, hash text not null,
 criado_em timestamptz not null default pg_catalog.clock_timestamp(),
 primary key(user_id,versao), check(hash=integridade_privado.hash_documento(conteudo))
);
create table integridade_privado.operacoes (
 user_id uuid not null references auth.users(id), operacao_id uuid not null,
 versao_antes bigint, versao_depois bigint not null, baseline_versao bigint not null,
 alteracoes jsonb not null, hash_antes text, hash_depois text not null,
 criado_em timestamptz not null default pg_catalog.clock_timestamp(),
 primary key(user_id,operacao_id), unique(user_id,versao_depois),
 foreign key(user_id,baseline_versao) references integridade_privado.baselines(user_id,versao),
 check(versao_antes is null or versao_depois>versao_antes),
 check(versao_depois>=baseline_versao), check(jsonb_typeof(alteracoes)='object'),
 check(hash_depois ~ '^[0-9a-f]{64}$'), check(hash_antes is null or hash_antes ~ '^[0-9a-f]{64}$')
);
alter table integridade_privado.baselines enable row level security;
alter table integridade_privado.operacoes enable row level security;
revoke all on integridade_privado.baselines,integridade_privado.operacoes from public,anon,authenticated,service_role;
grant select,insert on integridade_privado.baselines,integridade_privado.operacoes to authenticated,service_role;
create policy baseline_dono on integridade_privado.baselines for select to authenticated using((select auth.uid())=user_id);
create policy operacao_dono on integridade_privado.operacoes for select to authenticated using((select auth.uid())=user_id);
create policy baseline_captura on integridade_privado.baselines for insert to authenticated
 with check((select auth.uid())=user_id and pg_trigger_depth()>0 and exists(select 1 from public.dados_app d where d.user_id=baselines.user_id and d.versao>=baselines.versao));
create policy operacao_captura on integridade_privado.operacoes for insert to authenticated
 with check((select auth.uid())=user_id and pg_trigger_depth()>0 and exists(select 1 from public.dados_app d where d.user_id=operacoes.user_id and d.versao=operacoes.versao_depois and d.ultima_operacao_id=operacoes.operacao_id and integridade_privado.hash_documento(d.conteudo)=operacoes.hash_depois));

-- RLS alone does not restrict service_role. The nested-trigger guard also
-- denies direct INSERT by that role. No UPDATE/DELETE/TRUNCATE path exists.
create function integridade_privado.guardar_captura() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_schema<>'integridade_privado' or tg_table_name not in ('baselines','operacoes') or tg_op<>'INSERT' or pg_trigger_depth()<2 then
  raise exception 'History is writable only by the account capture trigger' using errcode='42501';
 end if;
 return new;
end $$;
create trigger baseline_captura before insert on integridade_privado.baselines for each row execute function integridade_privado.guardar_captura();
create trigger operacao_captura before insert on integridade_privado.operacoes for each row execute function integridade_privado.guardar_captura();
create trigger baseline_imutavel before update or delete or truncate on integridade_privado.baselines for each statement execute function integridade_privado.guardar_captura();
create trigger operacao_imutavel before update or delete or truncate on integridade_privado.operacoes for each statement execute function integridade_privado.guardar_captura();

create function integridade_privado.registros_validos(p_array jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
begin
 if p_array is null or jsonb_typeof(p_array)<>'array' then return false; end if;
 return not exists(select 1 from jsonb_array_elements(p_array) r where jsonb_typeof(r)<>'object' or jsonb_typeof(r->'id') not in ('number','string') or r->'id' is null)
 and (select count(*) from jsonb_array_elements(p_array))=(select count(distinct r->'id') from jsonb_array_elements(p_array) r);
end $$;
create function integridade_privado.diferenca(p_antes jsonb,p_depois jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare k text; v jsonb; a jsonb; b jsonb; ids_a jsonb; ids_b jsonb; ups jsonb; removidos jsonb;
 colecoes jsonb:='{}'; definir jsonb:='{}'; remover jsonb:='[]'; delta jsonb; resultado jsonb:='{}';
begin
 if p_antes is not distinct from p_depois then return resultado; end if;
 if jsonb_typeof(p_antes)<>'object' or jsonb_typeof(p_depois)<>'object' then return jsonb_build_object('documento',p_depois); end if;
 for k,v in select key,value from jsonb_each(p_depois) loop
  a:=p_antes->k; b:=v;
  if k=any(array['emissao_vendas','emissao_pessoas','emissao_pacotes','emissao_cotacoes']) and integridade_privado.registros_validos(a) and integridade_privado.registros_validos(b) then
   select coalesce(jsonb_agg(r->'id' order by n),'[]') into ids_a from jsonb_array_elements(a) with ordinality x(r,n);
   select coalesce(jsonb_agg(r->'id' order by n),'[]') into ids_b from jsonb_array_elements(b) with ordinality x(r,n);
   select coalesce(jsonb_agg(r order by n),'[]') into ups from jsonb_array_elements(b) with ordinality x(r,n)
    where not exists(select 1 from jsonb_array_elements(a) q where q->'id'=r->'id' and q=r);
   select coalesce(jsonb_agg(r->'id' order by n),'[]') into removidos from jsonb_array_elements(a) with ordinality x(r,n)
    where not exists(select 1 from jsonb_array_elements(b) q where q->'id'=r->'id');
   delta:='{}';
   if ups<>'[]' then delta:=delta||jsonb_build_object('registros',ups); end if;
   if removidos<>'[]' then delta:=delta||jsonb_build_object('removidos',removidos); end if;
   if ids_a is distinct from ids_b then delta:=delta||jsonb_build_object('ordem',ids_b); end if;
   if delta<>'{}' then colecoes:=colecoes||jsonb_build_object(k,delta); end if;
  elsif not(p_antes ? k) or a is distinct from b then definir:=definir||jsonb_build_object(k,b);
  end if;
 end loop;
 select coalesce(jsonb_agg(key order by key),'[]') into remover from jsonb_object_keys(p_antes) key where not(p_depois ? key);
 if colecoes<>'{}' then resultado:=resultado||jsonb_build_object('colecoes',colecoes); end if;
 if definir<>'{}' then resultado:=resultado||jsonb_build_object('definir',definir); end if;
 if remover<>'[]' then resultado:=resultado||jsonb_build_object('remover',remover); end if;
 return resultado;
end $$;
create function integridade_privado.aplicar(p_base jsonb,p_delta jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare resultado jsonb:=p_base; k text; v jsonb; r jsonb; id jsonb; itens jsonb; ordenados jsonb; indice integer;
begin
 if jsonb_typeof(p_delta)<>'object' or exists(select 1 from jsonb_object_keys(p_delta) key where key not in ('documento','colecoes','definir','remover')) then
  raise exception 'Unsupported history changes' using errcode='PT409';
 end if;
 if p_delta='{}' then return resultado; end if;
 if p_delta ? 'documento' then
  if (select count(*) from jsonb_object_keys(p_delta))<>1 then raise exception 'Invalid document checkpoint' using errcode='PT409'; end if;
  return p_delta->'documento';
 end if;
 for k in select jsonb_array_elements_text(coalesce(p_delta->'remover','[]')) loop resultado:=resultado-k; end loop;
 for k,v in select key,value from jsonb_each(coalesce(p_delta->'definir','{}')) loop resultado:=jsonb_set(resultado,array[k],v,true); end loop;
 for k,v in select key,value from jsonb_each(coalesce(p_delta->'colecoes','{}')) loop
  itens:=resultado->k;
  if not integridade_privado.registros_validos(itens) then raise exception 'Invalid collection base' using errcode='PT409'; end if;
  select coalesce(jsonb_agg(x.r order by x.n),'[]') into itens from jsonb_array_elements(itens) with ordinality x(r,n)
   where not exists(select 1 from jsonb_array_elements(coalesce(v->'removidos','[]')) d where d=x.r->'id');
  for r in select value from jsonb_array_elements(coalesce(v->'registros','[]')) loop
   indice:=null;
   select (n-1)::integer into indice from jsonb_array_elements(itens) with ordinality x(value,n) where value->'id'=r->'id';
   if indice is null then itens:=itens||jsonb_build_array(r); else itens:=jsonb_set(itens,array[indice::text],r,false); end if;
  end loop;
  if v ? 'ordem' then
   ordenados:='[]';
   for id in select value from jsonb_array_elements(v->'ordem') loop
    r:=null; select value into r from jsonb_array_elements(itens) where value->'id'=id;
    if r is null then raise exception 'Missing record in history order' using errcode='PT409'; end if;
    ordenados:=ordenados||jsonb_build_array(r);
   end loop;
   if jsonb_array_length(ordenados)<>jsonb_array_length(itens) or not integridade_privado.registros_validos(ordenados) then raise exception 'Invalid history order' using errcode='PT409'; end if;
   itens:=ordenados;
  end if;
  resultado:=jsonb_set(resultado,array[k],itens,true);
 end loop;
 return resultado;
end $$;

create or replace function public.integridade_capturar_historico() returns trigger
language plpgsql security invoker set search_path='' as $$
declare ultimo integridade_privado.operacoes%rowtype; base_ver bigint; hash_a text; hash_d text; delta jsonb;
begin
 if tg_table_schema<>'public' or tg_table_name<>'dados_app' then raise exception 'Invalid integrity trigger target'; end if;
 if exists(select 1 from public.dados_app_historico h where h.user_id=new.user_id and (h.operacao_id=new.ultima_operacao_id or h.versao_depois=new.versao)) then
  raise exception 'Operation/version already exists in legacy history' using errcode='23505';
 end if;
 hash_d:=integridade_privado.hash_documento(new.conteudo);
 if tg_op='INSERT' then
  base_ver:=new.versao; delta:='{}';
  insert into integridade_privado.baselines(user_id,versao,conteudo,hash) values(new.user_id,base_ver,new.conteudo,hash_d);
 else
  hash_a:=integridade_privado.hash_documento(old.conteudo);
  select * into ultimo from integridade_privado.operacoes where user_id=new.user_id order by versao_depois desc limit 1;
  if ultimo.operacao_id is null or ultimo.versao_depois<>old.versao or ultimo.hash_depois<>hash_a then
   base_ver:=old.versao;
   insert into integridade_privado.baselines(user_id,versao,conteudo,hash) values(new.user_id,base_ver,old.conteudo,hash_a);
  else select max(versao) into base_ver from integridade_privado.baselines where user_id=new.user_id and versao<=old.versao;
  end if;
  delta:=integridade_privado.diferenca(old.conteudo,new.conteudo);
  if integridade_privado.aplicar(old.conteudo,delta) is distinct from new.conteudo then raise exception 'History changes failed exact comparison' using errcode='PT409'; end if;
 end if;
 insert into integridade_privado.operacoes(user_id,operacao_id,versao_antes,versao_depois,baseline_versao,alteracoes,hash_antes,hash_depois)
 values(new.user_id,new.ultima_operacao_id,case when tg_op='UPDATE' then old.versao else null end,new.versao,base_ver,delta,hash_a,hash_d);
 -- Bound expensive content replay; version-only operations never duplicate a
 -- checkpoint. Checkpoints are additive and all earlier baselines stay intact.
 if delta<>'{}' and (select count(*) from integridade_privado.operacoes where user_id=new.user_id and baseline_versao=base_ver and alteracoes<>'{}')>=100 then
  insert into integridade_privado.baselines(user_id,versao,conteudo,hash) values(new.user_id,new.versao,new.conteudo,hash_d);
 end if;
 return new;
end $$;
-- Previous snapshots remain selectable but no new full snapshots are inserted.
revoke insert on public.dados_app_historico from authenticated,service_role;

create function public.integridade_listar_versoes(p_user_id uuid,p_offset integer default 0,p_limite integer default 50)
returns table(operacao_id uuid,versao_antes bigint,versao_depois bigint,criado_em timestamptz,formato integer)
language plpgsql stable security invoker set search_path='' as $$
begin
 if p_user_id is null or p_offset is null or p_limite is null or p_offset<0 or p_limite<1 or p_limite>50 then raise exception 'Invalid history page' using errcode='22023'; end if;
 return query select h.operacao_id,h.versao_antes,h.versao_depois,h.criado_em,h.formato from (
  select l.operacao_id,l.versao_antes,l.versao_depois,l.criado_em,1 as formato from public.dados_app_historico l where l.user_id=p_user_id
  union all
  select c.operacao_id,c.versao_antes,c.versao_depois,c.criado_em,2 as formato from integridade_privado.operacoes c where c.user_id=p_user_id
 ) h order by h.versao_depois desc limit p_limite offset p_offset;
end $$;
create function public.integridade_obter_estado(p_user_id uuid,p_operacao_id uuid,p_lado text)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare op integridade_privado.operacoes%rowtype; etapa integridade_privado.operacoes%rowtype;
 legado public.dados_app_historico%rowtype; estado jsonb; atual_ver bigint; alvo bigint; esperado text; estado_hash text;
begin
 if p_user_id is null or p_operacao_id is null or p_lado is null or p_lado not in ('antes','depois') then raise exception 'Invalid history reference' using errcode='22023'; end if;
 select * into legado from public.dados_app_historico where user_id=p_user_id and operacao_id=p_operacao_id;
 if legado.operacao_id is not null then return case when p_lado='antes' then legado.conteudo_antes else legado.conteudo_depois end; end if;
 select * into op from integridade_privado.operacoes where user_id=p_user_id and operacao_id=p_operacao_id;
 if op.operacao_id is null then raise exception 'History not available for this account' using errcode='PT404'; end if;
 if p_lado='antes' and op.versao_antes is null then return null; end if;
 alvo:=case when p_lado='antes' then op.versao_antes else op.versao_depois end;
 esperado:=case when p_lado='antes' then op.hash_antes else op.hash_depois end;
 select conteudo,versao into estado,atual_ver from integridade_privado.baselines where user_id=p_user_id and versao=op.baseline_versao;
 if atual_ver is null then raise exception 'History baseline missing' using errcode='PT409'; end if;
 estado_hash:=integridade_privado.hash_documento(estado);
 for etapa in select * from integridade_privado.operacoes where user_id=p_user_id and baseline_versao=op.baseline_versao and versao_depois<=alvo order by versao_depois loop
  if etapa.versao_antes is null then
   if etapa.versao_depois<>atual_ver or etapa.alteracoes<>'{}' or etapa.hash_depois<>estado_hash then raise exception 'Invalid initial history operation' using errcode='PT409'; end if;
  else
   if etapa.versao_antes<>atual_ver or etapa.hash_antes<>estado_hash then raise exception 'History chain incomplete or changed' using errcode='PT409'; end if;
   if etapa.alteracoes<>'{}' then estado:=integridade_privado.aplicar(estado,etapa.alteracoes); estado_hash:=integridade_privado.hash_documento(estado); end if;
   atual_ver:=etapa.versao_depois;
   if etapa.hash_depois<>estado_hash then raise exception 'History state hash mismatch' using errcode='PT409'; end if;
  end if;
 end loop;
 if atual_ver<>alvo or estado_hash<>esperado then raise exception 'History state is incomplete' using errcode='PT409'; end if;
 return estado;
end $$;
revoke all on function integridade_privado.guardar_captura() from public,anon,authenticated,service_role;
revoke all on function integridade_privado.hash_documento(jsonb),integridade_privado.registros_validos(jsonb),integridade_privado.diferenca(jsonb,jsonb),integridade_privado.aplicar(jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function integridade_privado.hash_documento(jsonb),integridade_privado.registros_validos(jsonb),integridade_privado.diferenca(jsonb,jsonb),integridade_privado.aplicar(jsonb,jsonb) to authenticated,service_role;
revoke all on function public.integridade_listar_versoes(uuid,integer,integer),public.integridade_obter_estado(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.integridade_listar_versoes(uuid,integer,integer),public.integridade_obter_estado(uuid,uuid,text) to authenticated,service_role;
-- Existing capture function EXECUTE remains revoked. Table ownership policies
-- on dados_app are unchanged. No cron, sender, physical DELETE or retention job.
notify pgrst,'reload schema';
