-- Executar somente no banco de teste local; todos os dados são sintéticos e revertidos.
begin;
do $$ begin
    if current_database()<>'vck_central_test' or inet_server_addr()<>inet '127.0.0.1' then raise exception 'Dedicated local test database required'; end if;
end $$;

create function pg_temp.exigir(p_ok boolean,p_msg text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'TEST FAILED: %',p_msg; end if; end $$;

create function pg_temp.item(p_venda text,p_conversa text,p_tipo text default '24h') returns jsonb language sql as $$
    select jsonb_build_object('venda_id',p_venda,'tipo',p_tipo,'modo','simulacao','chave_conversa',p_conversa,
        'agendado_em',clock_timestamp()-interval '1 minute','expira_em',clock_timestamp()+interval '10 minutes',
        'embarque_em',case when p_tipo='volta' then clock_timestamp()-interval '1 day' else clock_timestamp()+interval '2 hours' end,
        'destinatario','5562999991234','texto','Oi Sintético','contexto',jsonb_build_object('primeiro_nome','Sintético','origem','GYN','destino','GRU','quando','hoje','data_voo','04/10/2026','hora_voo','12:00'),
        'modelo_snapshot',jsonb_build_object('texto','Oi {{primeiro_nome}}'),'regra_snapshot',jsonb_build_object('antecedenciaMinutos',10,'validadeMinutos',15),
        'fuso_voo','UTC','fuso_operador','UTC','origem_versao',1,'preferencias_versao',1);
$$;

insert into auth.users(id) values ('aaaaaaaa-0000-0000-0000-000000000001'),('aaaaaaaa-0000-0000-0000-000000000002');
insert into public.dados_app(user_id,versao,conteudo)
select id,1,jsonb_build_object('emissao_vendas',(select jsonb_agg(jsonb_build_object('id','v'||n,'clienteId','c1','statusVenda','emitida','origem','GYN','destino','GRU')) from generate_series(1,9) n),
    'emissao_pessoas',jsonb_build_array(jsonb_build_object('id','c1','nome','Pessoa Sintética','telefone','5562999991234')))
from auth.users where id in ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002');

set local role service_role;
-- A migration deve reduzir ALL herdado por default ACL nas tabelas novas, mas
-- ampliar a fonte apenas com UPDATE(versao), suficiente para seus row locks.
do $$
declare alvo record; privilegio text;
begin
    for alvo in select * from (values
        ('public.mensagens_preferencias',array['SELECT','INSERT','UPDATE']),
        ('public.mensagens_tarefas',array['SELECT','INSERT','UPDATE']),
        ('public.mensagens_historico',array['SELECT','INSERT']),
        ('mensagens_privado.conversas',array['SELECT','INSERT','DELETE'])
    ) as a(tabela,permitidos) loop
        foreach privilegio in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
            perform pg_temp.exigir(has_table_privilege(current_user,alvo.tabela,privilegio)=(privilegio=any(alvo.permitidos)), 'least privilege '||alvo.tabela||' '||privilegio);
        end loop;
    end loop;
    perform pg_temp.exigir(has_column_privilege(current_user,'public.dados_app','versao','UPDATE'),'source version column allows row locking');
    perform pg_temp.exigir(not has_table_privilege(current_user,'public.dados_app','UPDATE'),'no table-wide source UPDATE grant');
    perform pg_temp.exigir(not has_column_privilege(current_user,'public.dados_app','conteudo','UPDATE'),'source content UPDATE remains forbidden');
    perform 1 from public.dados_app where user_id='aaaaaaaa-0000-0000-0000-000000000001' for update;
    begin
        update public.dados_app set conteudo=conteudo;
        raise exception 'service source content UPDATE allowed';
    exception when insufficient_privilege then null; end;
    begin
        truncate public.mensagens_historico;
        raise exception 'service history TRUNCATE allowed';
    exception when insufficient_privilege then null; end;
end $$;
do $$
declare c jsonb; m jsonb; v jsonb; p jsonb;
begin
    c:=jsonb_build_object('pausado',false,'fuso','UTC','silencioInicio',to_char(clock_timestamp() at time zone 'UTC'+interval '2 hours','HH24:MI'),'silencioFim',to_char(clock_timestamp() at time zone 'UTC'+interval '3 hours','HH24:MI'),'numeroTeste','+5562999991234');
    select jsonb_object_agg(tipo,jsonb_build_object('nome',tipo,'texto','Oi {{primeiro_nome}}','ativo',true,'antecedenciaMinutos',10,'validadeMinutos',15)) into m from unnest(array['48h','24h','dia','volta_checkin','volta']) tipo;
    select jsonb_object_agg('v'||n,jsonb_build_object('emissaoConfirmada',true,'fusoIda','UTC','fusoVolta','UTC','chegadaFinal','2026-11-01T10:00:00Z')) into v from generate_series(1,9) n;
    p:=public.mensagens_salvar_preferencias('aaaaaaaa-0000-0000-0000-000000000001',0,c,m,v);
    perform pg_temp.exigir((p->>'versao')::int=1,'initial preference version');
    perform public.mensagens_salvar_preferencias('aaaaaaaa-0000-0000-0000-000000000002',0,c,m,v);
    begin
        perform public.mensagens_salvar_preferencias('aaaaaaaa-0000-0000-0000-000000000001',0,c,m,v);
        raise exception 'stale preference write accepted';
    exception when sqlstate 'PT409' then null; end;
    begin
        perform public.mensagens_salvar_preferencias('aaaaaaaa-0000-0000-0000-000000000001',1,c||jsonb_build_object('silencioFim',c->>'silencioInicio'),m,v);
        raise exception 'equal quiet hours accepted';
    exception when sqlstate 'PT422' then null; end;
end $$;

-- ACL real: owner SELECT, outro owner invisível, navegador não escreve nem executa RPC.
reset role;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$ begin
    perform pg_temp.exigir((select count(*) from public.mensagens_preferencias)=1,'owner-select RLS');
    begin insert into public.mensagens_preferencias(user_id,versao,config,modelos,viagens) values('aaaaaaaa-0000-0000-0000-000000000001',2,'{}','{}','{}'); raise exception 'frontend INSERT allowed'; exception when insufficient_privilege then null; end;
    begin update public.mensagens_preferencias set versao=99; raise exception 'frontend UPDATE allowed'; exception when insufficient_privilege then null; end;
    begin delete from public.mensagens_preferencias; raise exception 'frontend DELETE allowed'; exception when insufficient_privilege then null; end;
    begin perform public.mensagens_preparar('aaaaaaaa-0000-0000-0000-000000000001',1,1,'[]',repeat('0',32)); raise exception 'frontend RPC allowed'; exception when insufficient_privilege then null; end;
    begin perform public.mensagens_fonte('aaaaaaaa-0000-0000-0000-000000000002'); raise exception 'frontend source RPC allowed'; exception when insufficient_privilege then null; end;
    begin perform 1 from mensagens_privado.conversas; raise exception 'frontend private locks allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
    begin perform 1 from public.mensagens_preferencias; raise exception 'anonymous SELECT allowed'; exception when insufficient_privilege then null; end;
    begin perform public.mensagens_reservar('aaaaaaaa-0000-0000-0000-000000000001',gen_random_uuid()); raise exception 'anonymous RPC allowed'; exception when insufficient_privilege then null; end;
    begin perform public.mensagens_fonte('aaaaaaaa-0000-0000-0000-000000000001'); raise exception 'anonymous source RPC allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;

do $$
declare owner uuid:='aaaaaaaa-0000-0000-0000-000000000001'; items jsonb; t jsonb; claimed jsonb; begun jsonb; completed jsonb; id1 uuid; id2 uuid; p public.mensagens_preferencias; history_count int; source_read jsonb; quote_hash text;
begin
    items:=jsonb_build_array(pg_temp.item('v1','duplicate-conversation'),pg_temp.item('v2','duplicate-conversation'),pg_temp.item('v3','paused-conversation'),pg_temp.item('v4','cancelled-conversation'),pg_temp.item('v5','changed-source'),pg_temp.item('v6','changed-phone'),pg_temp.item('v7','post-trip','volta'));
    source_read:=public.mensagens_fonte(owner);
    perform pg_temp.exigir(source_read->>'fingerprint'=md5((source_read->'conteudo')::text),'source fingerprint matches the returned snapshot');
    perform pg_temp.exigir(public.mensagens_fonte('aaaaaaaa-0000-0000-0000-000000000099') is null,'missing source returns null');
    begin perform public.mensagens_preparar(owner,1,1,items,null); raise exception 'null fingerprint accepted'; exception when sqlstate 'PT409' then null; end;
    begin perform public.mensagens_preparar(owner,1,1,items,'bad'); raise exception 'malformed fingerprint accepted'; exception when sqlstate 'PT409' then null; end;
    set local role authenticated;
    update public.dados_app set conteudo=jsonb_set(conteudo,'{emissao_pessoas,0,telefone}','"5562999999876"') where user_id=owner;
    set local role service_role;
    begin perform public.mensagens_preparar(owner,1,1,items,source_read->>'fingerprint'); raise exception 'stale fingerprint accepted without version increment'; exception when sqlstate 'PT409' then null; end;
    perform pg_temp.exigir(not exists(select 1 from public.mensagens_tarefas where user_id=owner),'stale preparation changed no task');
    set local role authenticated;
    update public.dados_app set conteudo=source_read->'conteudo' where user_id=owner;
    set local role service_role;
    perform public.mensagens_preparar(owner,1,1,items,source_read->>'fingerprint');
    select id into id1 from public.mensagens_tarefas where user_id=owner and venda_id='v1';
    select id into id2 from public.mensagens_tarefas where user_id=owner and venda_id='v2';
    claimed:=public.mensagens_reservar(owner,id1);
    perform pg_temp.exigir(claimed->>'estado'='reservada','reservation writes state');
    perform pg_temp.exigir(public.mensagens_reservar(owner,id1) is null,'no duplicate reservation');
    perform pg_temp.exigir(public.mensagens_reservar(owner,id2) is null,'conversation atomic uniqueness');
    perform pg_temp.exigir(public.mensagens_iniciar(owner,id1,gen_random_uuid()) is null,'wrong reservation token rejected');
    begun:=public.mensagens_iniciar(owner,id1,(claimed->>'reserva_token')::uuid);
    perform pg_temp.exigir(begun->>'estado'='tentativa' and begun->>'tentativa_em' is not null,'attempt persisted before provider');
    perform pg_temp.exigir(public.mensagens_iniciar(owner,id1,(claimed->>'reserva_token')::uuid) is null,'attempt cannot start twice');
    completed:=public.mensagens_concluir(owner,id1,(claimed->>'reserva_token')::uuid,'simulada',jsonb_build_object('modo','simulacao','motivo','simulacao_concluida','id_simulado','sim-test','texto','Oi Sintético'));
    perform pg_temp.exigir(completed->>'estado'='simulada','explicit simulation terminal state');
    perform pg_temp.exigir(public.mensagens_reservar(owner,id2) is null,'conversation tombstone survives completion');
    perform pg_temp.exigir(public.mensagens_reservar('aaaaaaaa-0000-0000-0000-000000000002',id1) is null,'owner cannot reserve another owner task');

    select id into id1 from public.mensagens_tarefas where user_id=owner and venda_id='v3';
    perform public.mensagens_controlar(owner,id1,'pausar');
    select id into id2 from public.mensagens_tarefas where user_id=owner and venda_id='v4';
    perform public.mensagens_controlar(owner,id2,'cancelar');
    perform public.mensagens_preparar(owner,1,1,items,source_read->>'fingerprint');
    perform pg_temp.exigir((select estado='pausada' from public.mensagens_tarefas where id=id1),'prepare preserves manual pause');
    perform pg_temp.exigir((select estado='cancelada' and cancelamento_manual from public.mensagens_tarefas where id=id2),'prepare cannot resurrect cancellation');
    perform pg_temp.exigir(public.mensagens_reservar(owner,id2) is null,'cancelled never reserved');
    perform public.mensagens_controlar(owner,id1,'retomar');
    claimed:=public.mensagens_reservar(owner,id1);
    perform public.mensagens_iniciar(owner,id1,(claimed->>'reserva_token')::uuid);
    begin perform public.mensagens_concluir(owner,id1,(claimed->>'reserva_token')::uuid,'enviada','{}'); raise exception 'real send status accepted'; exception when sqlstate 'PT422' then null; end;
    begin perform public.mensagens_concluir(owner,id1,(claimed->>'reserva_token')::uuid,'simulada','{"modo":"real","id_simulado":"sim-local"}'); raise exception 'real transport marker accepted'; exception when sqlstate 'PT422' then null; end;
    perform public.mensagens_concluir(owner,id1,(claimed->>'reserva_token')::uuid,'falha','{"modo":"simulacao","motivo":"falha_sintetica"}');
    perform pg_temp.exigir(public.mensagens_reservar(owner,id1) is null,'failed attempt cannot retry');

    select id into id1 from public.mensagens_tarefas where user_id=owner and venda_id='v5';
    claimed:=public.mensagens_reservar(owner,id1);
    update public.dados_app set versao=2 where user_id=owner;
    perform pg_temp.exigir(public.mensagens_iniciar(owner,id1,(claimed->>'reserva_token')::uuid) is null,'source CAS changed between claim and begin');
    begin perform public.mensagens_preparar(owner,1,1,items,source_read->>'fingerprint'); raise exception 'stale prepare accepted'; exception when sqlstate 'PT409' then null; end;
    update public.dados_app set versao=1 where user_id=owner;

    select id into id1 from public.mensagens_tarefas where user_id=owner and venda_id='v6';
    claimed:=public.mensagens_reservar(owner,id1);
    set local role authenticated;
    update public.dados_app set conteudo=jsonb_set(conteudo,'{emissao_pessoas,0,telefone}','"5562999994321"') where user_id=owner;
    set local role service_role;
    perform pg_temp.exigir(public.mensagens_iniciar(owner,id1,(claimed->>'reserva_token')::uuid) is null,'phone changed without source version is rejected');
    set local role authenticated;
    update public.dados_app set conteudo=jsonb_set(conteudo,'{emissao_pessoas,0,telefone}','"5562999991234"') where user_id=owner;
    set local role service_role;

    select id into id1 from public.mensagens_tarefas where user_id=owner and venda_id='v5';
    select to_jsonb(q) into claimed from public.mensagens_tarefas q where q.id=id1;
    perform pg_temp.exigir(claimed->>'fonte_hash'=mensagens_privado.hash_fonte(public.mensagens_fonte(owner),'v5'),'unchanged reservation source still matches');
    set local role authenticated;
    update public.dados_app set conteudo=jsonb_set(conteudo,'{emissao_cotacoes}','[{"id":"quote-linked","vendaId":"v5","propostaCompleta":{"multitrecho":true}},{"id":"quote-other-linked","vendaId":"v5","propostaCompleta":{"multitrecho":false}}]') where user_id=owner;
    set local role service_role;
    perform pg_temp.exigir(public.mensagens_iniciar(owner,id1,(claimed->>'reserva_token')::uuid) is null,'linked quote changed without source version prevents begin');
    quote_hash:=mensagens_privado.hash_fonte(public.mensagens_fonte(owner),'v5');
    set local role authenticated;
    update public.dados_app set conteudo=jsonb_set(conteudo,'{emissao_cotacoes}','[{"id":"quote-other-linked","vendaId":"v5","propostaCompleta":{"multitrecho":false}},{"id":"quote-linked","vendaId":"v5","propostaCompleta":{"multitrecho":true}}]') where user_id=owner;
    set local role service_role;
    perform pg_temp.exigir(quote_hash=mensagens_privado.hash_fonte(public.mensagens_fonte(owner),'v5'),'linked quote ordering does not alter canonical hash');
    set local role authenticated;
    update public.dados_app set conteudo=jsonb_set(conteudo,'{emissao_cotacoes}','{}') where user_id=owner;
    set local role service_role;
    perform pg_temp.exigir(mensagens_privado.hash_fonte(public.mensagens_fonte(owner),'v5') is null,'malformed quote collection invalidates source');
    set local role authenticated;
    update public.dados_app set conteudo=jsonb_set(conteudo,'{emissao_cotacoes}','[null]') where user_id=owner;
    set local role service_role;
    perform pg_temp.exigir(mensagens_privado.hash_fonte(public.mensagens_fonte(owner),'v5') is null,'malformed quote item invalidates source');
    set local role authenticated;
    update public.dados_app set conteudo=conteudo-'emissao_cotacoes' where user_id=owner;
    set local role service_role;
    perform pg_temp.exigir(claimed->>'fonte_hash'=mensagens_privado.hash_fonte(public.mensagens_fonte(owner),'v5'),'absent quote collection is an empty collection');

    select id into id1 from public.mensagens_tarefas where user_id=owner and venda_id='v7';
    claimed:=public.mensagens_reservar(owner,id1);
    perform pg_temp.exigir(claimed is not null,'post-trip may occur after confirmed arrival');
    select * into p from public.mensagens_preferencias where user_id=owner;
    perform public.mensagens_salvar_preferencias(owner,1,p.config||'{"pausado":true}',p.modelos,p.viagens);
    perform pg_temp.exigir(public.mensagens_iniciar(owner,id1,(claimed->>'reserva_token')::uuid) is null,'preference update invalidates unattempted reservation');
    perform pg_temp.exigir((select estado='cancelada' from public.mensagens_tarefas where id=id1),'reservation cancelled on config change');
    perform pg_temp.exigir((select count(*) from mensagens_privado.conversas where user_id=owner)=2,'only post-attempt tombstones remain, including failure');
    select count(*) into history_count from public.mensagens_historico where user_id=owner;
    perform pg_temp.exigir(history_count>=10,'state history persisted');
end $$;

-- Silêncio e expiração usam o relógio do DB, nunca um timestamp do chamador.
do $$
declare owner uuid:='aaaaaaaa-0000-0000-0000-000000000002'; p public.mensagens_preferencias; it jsonb; t jsonb; id1 uuid;
begin
    it:=pg_temp.item('v8','expired')||jsonb_build_object('agendado_em',clock_timestamp()-interval '20 minutes','expira_em',clock_timestamp()-interval '5 minutes');
    perform public.mensagens_preparar(owner,1,1,jsonb_build_array(it),public.mensagens_fonte(owner)->>'fingerprint');
    select id into id1 from public.mensagens_tarefas where user_id=owner and venda_id='v8';
    perform pg_temp.exigir((public.mensagens_controlar(owner,id1,'retomar')->>'estado')='expirada','expired task cannot resume');
    perform pg_temp.exigir(public.mensagens_reservar(owner,id1) is null,'expired cannot reserve');
    select * into p from public.mensagens_preferencias where user_id=owner;
    perform public.mensagens_salvar_preferencias(owner,1,p.config||jsonb_build_object('silencioInicio',to_char(clock_timestamp() at time zone 'UTC'-interval '1 hour','HH24:MI'),'silencioFim',to_char(clock_timestamp() at time zone 'UTC'+interval '1 hour','HH24:MI')),p.modelos,p.viagens);
    it:=pg_temp.item('v9','quiet')||'{"preferencias_versao":2}';
    perform public.mensagens_preparar(owner,1,2,jsonb_build_array(it),public.mensagens_fonte(owner)->>'fingerprint');
    select id into id1 from public.mensagens_tarefas where user_id=owner and venda_id='v9';
    perform pg_temp.exigir(public.mensagens_reservar(owner,id1) is null,'actual quiet time blocks claim');
end $$;
reset role;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000002',true);
set local role authenticated;
do $$ begin
    perform pg_temp.exigir((select count(*) from public.mensagens_tarefas)=2,'tasks RLS isolates owner');
    perform pg_temp.exigir(not exists(select 1 from public.mensagens_historico where user_id<>'aaaaaaaa-0000-0000-0000-000000000002'),'history RLS isolates owner');
    begin update public.mensagens_tarefas set estado='simulada'; raise exception 'frontend task UPDATE allowed'; exception when insufficient_privilege then null; end;
    begin delete from public.mensagens_tarefas; raise exception 'frontend task DELETE allowed'; exception when insufficient_privilege then null; end;
    begin insert into public.mensagens_historico(user_id,tarefa_id,estado,snapshot) values('aaaaaaaa-0000-0000-0000-000000000002',gen_random_uuid(),'simulada','{}'); raise exception 'frontend history forge allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
    begin update public.mensagens_historico set detalhe='{}'; raise exception 'history rewrite accepted'; exception when sqlstate 'PT422' then null; end;
    begin delete from public.mensagens_historico; raise exception 'history deletion accepted'; exception when sqlstate 'PT422' then null; end;
end $$;

select 'Central de Mensagens: SQL assertions passed (simulation, ACL/RLS, CAS, claims, source hash, history, quiet hours, expiry)' as resultado;
rollback;
