// Repositório PostgreSQL real por injeção; esta versão aceita somente transporte/arquivos sintéticos.
import { identity, commercialContext } from '../../../../js/atendimento-domain.mjs';
const validUuid = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
const ranks={pendente:0,aceita:1,entregue:2,lida:3};
const textId=value=>typeof value==='string' && /^[\w:@.+-]{1,160}$/.test(value);
const row=result=>result.rows[0];
const cleanMessage=m=>({id:m.id,chatId:m.conversa_id,text:m.texto,at:m.ocorrido_em,direction:m.direcao,status:m.estado,attachmentId:m.anexo_id,providerId:m.provedor_id});
export function canonicalEvent(input, instance='mock') {
    if(input?.isGroup || input?.isNewsletter) return null;
    if(input?.instance!==instance || !textId(input.messageId) || !['message','status'].includes(input.type) || !Object.hasOwn(ranks,input.status)) fail('Evento sintético inválido.');
    const address=identity(input), at=new Date(input.at);
    if(!Number.isFinite(at.getTime())) fail('Timestamp inválido.');
    if(input.type==='message' && (typeof input.fromMe!=='boolean' || typeof input.text!=='string' || input.text.length>10000)) fail('Conteúdo inválido.');
    return {type:input.type,instance,messageId:input.messageId,...address,at:at.toISOString(),status:input.status,...(input.type==='message'?{fromMe:input.fromMe,text:input.text}: {})};
}
export function createPgRepository({pool,owner,objectStore,instance='mock',financialSummary=()=>({receitaRealizada:null})}) {
    if(!validUuid(owner) || instance!=='mock' || objectStore?.mode!=='sintetico') fail('Repositório limitado ao teste sintético.',403);
    const authorized=actor=>{if(actor!==owner) fail('Acesso negado.',403);};
    async function tx(fn,{snapshot=false}={}) {
        const c=await pool.connect();
        try{await c.query(snapshot?'begin isolation level repeatable read':'begin');await c.query('set local role service_role');const result=await fn(c);await c.query('commit');return result;}
        catch(error){await c.query('rollback');throw error;}finally{c.release();}
    }
    const ownerLock=c=>c.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[owner+':'+instance]);
    const chatFor=async(c,cid)=>row(await c.query('select * from public.atendimento_conversas where user_id=$1 and id=$2',[owner,cid])) || fail('Conversa não encontrada.',404);
    const event=(c,type,dedupe,mid=null,details={})=>c.query("insert into public.atendimento_eventos(user_id,instancia,dedupe,tipo,mensagem_id,ocorrido_em,detalhes) values($1,$2,$3,$4,$5,clock_timestamp(),$6)",[owner,instance,dedupe,type,mid,details]);
    async function source(c){return row(await c.query('select conteudo from public.dados_app where user_id=$1',[owner]))?.conteudo || {};}
    async function resolve(c,address,evidence){
        const aliases=(await c.query("select * from public.atendimento_identidades where user_id=$1 and instancia=$2 and ((tipo='telefone' and valor=$3) or (tipo='lid' and valor=$4))",[owner,instance,address.phone,address.lid])).rows;
        const ids=[...new Set(aliases.map(a=>a.conversa_id))];if(ids.length>1) fail('Telefone/LID conflitantes: revisão manual.',409);
        let cid=ids[0];
        if(!cid){cid=crypto.randomUUID();await c.query('insert into public.atendimento_conversas(id,user_id,instancia,nome) values($1,$2,$3,$4)',[cid,owner,instance,address.phone?'+'+address.phone:address.lid]);}
        const existing=(await c.query('select * from public.atendimento_identidades where user_id=$1 and conversa_id=$2',[owner,cid])).rows;
        for(const [kind,value] of [['telefone',address.phone],['lid',address.lid]]) {
            if(!value) continue;if(existing.some(a=>a.tipo===kind && a.valor!==value)) fail('Alias conflitante: revisão manual.',409);
            await c.query('insert into public.atendimento_identidades(user_id,conversa_id,instancia,tipo,valor,evidencia_evento) values($1,$2,$3,$4,$5,$6) on conflict do nothing',[owner,cid,instance,kind,value,evidence]);
        }return cid;
    }
    async function addressMatches(c,cid,address){
        const aliases=(await c.query('select tipo,valor from public.atendimento_identidades where user_id=$1 and conversa_id=$2',[owner,cid])).rows;
        return (!address.phone || aliases.some(a=>a.tipo==='telefone'&&a.valor===address.phone)) && (!address.lid || aliases.some(a=>a.tipo==='lid'&&a.valor===address.lid));
    }
    async function enqueue(actor,input){
        authorized(actor);const payload=canonicalEvent(input,instance);if(!payload) return {ignored:true};
        const dedupe=JSON.stringify([payload.type,payload.messageId,payload.type==='status'?payload.status:'conteudo']);
        return await tx(async c=>{
            const created=row(await c.query('insert into public.atendimento_ingressos(user_id,instancia,dedupe,payload) values($1,$2,$3,$4) on conflict(user_id,instancia,dedupe) do nothing returning id',[owner,instance,dedupe,payload]));
            if(created)return {id:created.id,duplicate:false};
            const previous=row(await c.query('select id,payload=$4::jsonb as identical from public.atendimento_ingressos where user_id=$1 and instancia=$2 and dedupe=$3',[owner,instance,dedupe,payload]));
            if(!previous?.identical)fail('ID do evento reutilizado com outro conteúdo.',409);
            return {id:previous.id,duplicate:true};
        });
    }
    async function processNext(actor){
        authorized(actor);let job;
        try{return await tx(async c=>{
            job=row(await c.query("select * from public.atendimento_ingressos where user_id=$1 and estado in ('pendente','falha') and tentativas<5 and disponivel_em<=clock_timestamp() order by criado_em,id for update skip locked limit 1",[owner]));
            if(!job) return null;await ownerLock(c);const p=job.payload;
            const seen=row(await c.query('select id from public.atendimento_eventos where user_id=$1 and instancia=$2 and dedupe=$3',[owner,instance,job.dedupe]));
            if(!seen){
                let m=row(await c.query('select * from public.atendimento_mensagens where user_id=$1 and instancia=$2 and provedor_id=$3',[owner,instance,p.messageId]));
                if(p.type==='status'){
                    if(m && !await addressMatches(c,m.conversa_id,p)) fail('Status de outro contato.',409);
                    await c.query('insert into public.atendimento_eventos(user_id,instancia,dedupe,tipo,mensagem_id,provedor_id,estado,ocorrido_em,detalhes) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[owner,instance,job.dedupe,'status',m?.id || null,p.messageId,p.status,p.at,{phone:p.phone,lid:p.lid}]);
                    if(m?.direcao==='saida' && ranks[p.status]>ranks[m.estado]) await c.query('update public.atendimento_mensagens set estado=$3 where user_id=$1 and id=$2',[owner,m.id,p.status]);
                }else{
                    if(m && (m.direcao!==(p.fromMe?'saida':'entrada') || !await addressMatches(c,m.conversa_id,p))) fail('Conteúdo/identidade conflitantes.',409);
                    const pending=(await c.query("select estado,detalhes from public.atendimento_eventos where user_id=$1 and instancia=$2 and provedor_id=$3 and tipo='status'",[owner,instance,p.messageId])).rows;
                    if(pending.some(e=>(e.detalhes.phone&&p.phone&&e.detalhes.phone!==p.phone)||(e.detalhes.lid&&p.lid&&e.detalhes.lid!==p.lid))) fail('Status pendente conflitante.',409);
                    const cid=m?.conversa_id || await resolve(c,p,job.dedupe);
                    let status=p.status;if(p.fromMe)for(const e of pending)if(ranks[e.estado]>ranks[status])status=e.estado;
                    if(!m)m=row(await c.query('insert into public.atendimento_mensagens(user_id,conversa_id,instancia,provedor_id,direcao,texto,estado,ocorrido_em) values($1,$2,$3,$4,$5,$6,$7,$8) returning *',[owner,cid,instance,p.messageId,p.fromMe?'saida':'entrada',p.text,status,p.at]));
                    await c.query('insert into public.atendimento_eventos(user_id,instancia,dedupe,tipo,mensagem_id,provedor_id,ocorrido_em,detalhes) values($1,$2,$3,$4,$5,$6,$7,$8)',[owner,instance,job.dedupe,'message',m.id,p.messageId,p.at,{phone:p.phone,lid:p.lid}]);
                }
            }
            await c.query("update public.atendimento_ingressos set estado='processado',tentativas=tentativas+1 where user_id=$1 and id=$2",[owner,job.id]);return {id:job.id,state:'processado'};
        });}catch(error){
            if(!job)throw error;
            await tx(c=>c.query("update public.atendimento_ingressos set estado=$3,tentativas=least(tentativas+1,5),disponivel_em=clock_timestamp()+interval '5 seconds' where user_id=$1 and id=$2 and estado<>'processado'",[owner,job.id,error.status===409?'revisao':'falha']));
            return {id:job.id,state:error.status===409?'revisao':'falha'};
        }
    }
    async function messages(actor,cid){authorized(actor);return await tx(async c=>{await chatFor(c,cid);return (await c.query('select * from public.atendimento_mensagens where user_id=$1 and conversa_id=$2 and substituida_por is null order by ocorrido_em,id',[owner,cid])).rows.map(cleanMessage);});}
    async function list(actor,{search='',unread=false,label=''}={}){
        authorized(actor);return await tx(async c=>{
            const chats=(await c.query('select * from public.atendimento_conversas where user_id=$1 order by criado_em,id',[owner])).rows;
            const commercial=await source(c),result=[];
            for(const chat of chats){
                const ms=(await c.query('select * from public.atendimento_mensagens where user_id=$1 and conversa_id=$2 and substituida_por is null order by ocorrido_em,id',[owner,chat.id])).rows;
                const ids=(await c.query('select tipo,valor from public.atendimento_identidades where user_id=$1 and conversa_id=$2',[owner,chat.id])).rows;
                const view={id:chat.id,nome:chat.nome,phone:ids.find(a=>a.tipo==='telefone')?.valor || null,lid:ids.find(a=>a.tipo==='lid')?.valor || null,clienteId:chat.cliente_id,cotacaoId:chat.cotacao_id,vendaId:chat.venda_id,origemContato:chat.origem_contato,etiquetas:chat.etiquetas,unread:ms.filter(m=>m.direcao==='entrada'&&!m.lida_em).length,last:ms.at(-1)?cleanMessage(ms.at(-1)):null};
                view.context=commercialContext(commercial,view,financialSummary);
                if((!unread||view.unread)&&(!label||view.etiquetas.includes(label))&&(!search||[view.nome,view.phone,view.lid,view.context.cliente?.nome,...view.etiquetas,...ms.map(m=>m.texto)].join(' ').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))))result.push(view);
            }return result.sort((a,b)=>new Date(b.last?.at||0)-new Date(a.last?.at||0));
        },{snapshot:true});
    }
    async function read(actor,cid){authorized(actor);return await tx(async c=>{await ownerLock(c);await chatFor(c,cid);await c.query("update public.atendimento_mensagens set lida_em=clock_timestamp() where user_id=$1 and conversa_id=$2 and direcao='entrada' and lida_em is null",[owner,cid]);return {ok:true};});}
    async function link(actor,cid,{clienteId=null,cotacaoId=null,vendaId=null,origemContato='',etiquetas=[]}){
        authorized(actor);if(typeof origemContato!=='string'||origemContato.length>120||!Array.isArray(etiquetas)||etiquetas.length>10||etiquetas.some(t=>typeof t!=='string'||!t.trim()||t.length>40))fail('Origem/etiquetas inválidas.');
        return await tx(async c=>{await ownerLock(c);await chatFor(c,cid);const data=await source(c);
            if(clienteId && !(data.emissao_pessoas||[]).some(p=>String(p.id)===clienteId&&p.tipo==='cliente'))fail('Cliente não pertence à fonte autorizada.');
            for(const [rid,rows] of [[cotacaoId,data.emissao_cotacoes],[vendaId,data.emissao_vendas]])if(rid&&!(rows||[]).some(r=>String(r.id)===rid&&String(r.clienteId)===clienteId))fail('Vínculo comercial incompatível.');
            await c.query('update public.atendimento_conversas set cliente_id=$3,cotacao_id=$4,venda_id=$5,origem_contato=$6,etiquetas=$7 where user_id=$1 and id=$2',[owner,cid,clienteId,cotacaoId,vendaId,origemContato.trim(),[...new Set(etiquetas.map(t=>t.trim()))]]);
            await event(c,'link','link:'+crypto.randomUUID(),null,{chatId:cid,clienteId,cotacaoId,vendaId,origemContato});return {ok:true};
        });
    }
    async function compose(actor,cid,{text='',attachmentId=null,requestId}){
        authorized(actor);if(!textId(requestId)||typeof text!=='string'||text.length>10000||(!text.trim()&&!attachmentId))fail('Mensagem inválida.');
        return await tx(async c=>{await ownerLock(c);await chatFor(c,cid);
            const phone=row(await c.query("select valor from public.atendimento_identidades where user_id=$1 and conversa_id=$2 and tipo='telefone'",[owner,cid]));if(!phone)fail('LID sem telefone comprovado.');
            if(attachmentId && !row(await c.query("select id from public.atendimento_anexos where user_id=$1 and conversa_id=$2 and id=$3 and estado_arquivo='arquivado'",[owner,cid,attachmentId])))fail('Anexo indisponível ou de outra conversa.');
            const prior=row(await c.query('select * from public.atendimento_mensagens where user_id=$1 and requisicao_id=$2',[owner,requestId]));
            if(prior){if(prior.conversa_id!==cid||prior.texto!==text.trim()||prior.anexo_id!==attachmentId)fail('Chave idempotente reutilizada com outro conteúdo.',409);return cleanMessage(prior);}
            const m=row(await c.query("insert into public.atendimento_mensagens(user_id,conversa_id,instancia,requisicao_id,direcao,texto,ocorrido_em,anexo_id) values($1,$2,$3,$4,'saida',$5,clock_timestamp(),$6) returning *",[owner,cid,instance,requestId,text.trim(),attachmentId]));
            await c.query('insert into public.atendimento_outbox(user_id,mensagem_id) values($1,$2)',[owner,m.id]);await event(c,'compose','compose:'+requestId,m.id);return cleanMessage(m);
        });
    }
    async function claim(actor){authorized(actor);return await tx(async c=>row(await c.query('select public.atendimento_reivindicar_simulacao($1) job',[owner])).job);}
    async function finish(actor,job,outcome){
        authorized(actor);return await tx(async c=>{await ownerLock(c);
            const current=row(await c.query('select * from public.atendimento_outbox where user_id=$1 and id=$2 for update',[owner,job.id]));
            if(!current||current.estado!=='tentativa'||current.token!==job.token)return {ok:false};
            const m=row(await c.query('select * from public.atendimento_mensagens where user_id=$1 and id=$2',[owner,current.mensagem_id]));
            let result=outcome?.definitelyNotSent===true&&!outcome.providerId?'falha_segura':textId(outcome?.providerId)?'simulada':'incerto';
            if(result==='simulada'){
                const echo=row(await c.query('select * from public.atendimento_mensagens where user_id=$1 and instancia=$2 and provedor_id=$3 and id<>$4',[owner,instance,outcome.providerId,m.id]));
                if(echo && (echo.conversa_id!==m.conversa_id||echo.direcao!=='saida'||echo.requisicao_id))result='incerto';
                else {
                    let status='aceita';const pending=(await c.query("select estado,detalhes from public.atendimento_eventos where user_id=$1 and instancia=$2 and provedor_id=$3 and tipo='status'",[owner,instance,outcome.providerId])).rows;
                    for(const e of pending){if(!await addressMatches(c,m.conversa_id,e.detalhes)){result='incerto';break;}if(ranks[e.estado]>ranks[status])status=e.estado;}
                    if(result==='simulada'){
                        if(echo){if(ranks[echo.estado]>ranks[status])status=echo.estado;await c.query('update public.atendimento_mensagens set provedor_id=null,substituida_por=$3 where user_id=$1 and id=$2',[owner,echo.id,m.id]);await event(c,'echo','echo:'+crypto.randomUUID(),m.id,{echoId:echo.id});}
                        await c.query('update public.atendimento_mensagens set provedor_id=$3,estado=$4 where user_id=$1 and id=$2',[owner,m.id,outcome.providerId,status]);
                    }
                }
            }
            const ok=row(await c.query('select public.atendimento_resultado_simulacao($1,$2,$3,$4) ok',[owner,job.id,job.token,result])).ok;
            if(ok&&result==='falha_segura')await c.query("update public.atendimento_outbox set disponivel_em=clock_timestamp()+make_interval(secs=>5*power(2,tentativas-1)::int) where user_id=$1 and id=$2",[owner,job.id]);return {ok,result};
        });
    }
    async function dispatchNext(actor,transport){
        authorized(actor);if(transport?.mode!=='sintetico')fail('Transporte real desativado.',403);
        const job=await claim(actor);if(!job)return null;
        const payload=await tx(async c=>{const m=row(await c.query('select * from public.atendimento_mensagens where user_id=$1 and id=$2',[owner,job.mensagem_id]));const phone=row(await c.query("select valor from public.atendimento_identidades where user_id=$1 and conversa_id=$2 and tipo='telefone'",[owner,m.conversa_id])).valor;return {...cleanMessage(m),requestId:m.requisicao_id,phone,mode:'sintetico'};});
        let outcome;try{outcome=await transport.send(payload);}catch{outcome=null;}return {...await finish(actor,job,outcome),messageId:job.mensagem_id};
    }
    async function recoverUncertain(actor,olderThanSeconds=60){
        authorized(actor);if(!Number.isInteger(olderThanSeconds)||olderThanSeconds<0||olderThanSeconds>86400)fail('Prazo inválido.');
        return await tx(async c=>{await ownerLock(c);const jobs=(await c.query("select * from public.atendimento_outbox where user_id=$1 and estado='tentativa' and tentativa_em<clock_timestamp()-make_interval(secs=>$2) for update",[owner,olderThanSeconds])).rows;
            for(const job of jobs)await c.query("select public.atendimento_resultado_simulacao($1,$2,$3,'incerto')",[owner,job.id,job.token]);return {uncertain:jobs.length};
        });
    }
    // Arquivo reservado antes do I/O; retry usa a mesma chave/path e valida bytes existentes.
    async function archive(actor,cid,{name,bytes,requestId}){
        authorized(actor);const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
        if(!textId(requestId)||typeof name!=='string'||!/\.pdf$/i.test(name)||name.length>120||/[/\\]/.test(name)||[...name].some(c=>c.charCodeAt(0)<32)||data.length<5||data.length>5242880||new TextDecoder().decode(data.slice(0,5))!=='%PDF-')fail('PDF inválido.');
        const sha=await objectStore.digest(data);
        const file=await tx(async c=>{await ownerLock(c);await chatFor(c,cid);const prior=row(await c.query('select * from public.atendimento_anexos where user_id=$1 and requisicao_id=$2',[owner,requestId]));
            if(prior){if(prior.conversa_id!==cid||prior.sha256!==sha||prior.nome!==name)fail('Chave de arquivo reutilizada.',409);return prior;}
            const fid=crypto.randomUUID(),path=`${owner}/${cid}/${fid}.pdf`;
            return row(await c.query("insert into public.atendimento_anexos(id,user_id,conversa_id,nome,mime,tamanho,sha256,caminho,requisicao_id,estado_arquivo) values($1,$2,$3,$4,'application/pdf',$5,$6,$7,$8,'pendente') returning *",[fid,owner,cid,name,data.length,sha,path,requestId]));
        });
        await objectStore.put(file.caminho,data); // Falha não finge que o objeto foi arquivado.
        return tx(async c=>{await ownerLock(c);const stored=row(await c.query('select * from public.atendimento_anexos where user_id=$1 and id=$2 for update',[owner,file.id]));
            if(stored.estado_arquivo==='pendente'){await c.query("update public.atendimento_anexos set estado_arquivo='arquivado' where user_id=$1 and id=$2",[owner,file.id]);await event(c,'archive','archive:'+requestId,null,{fileId:file.id,chatId:cid});}return {id:file.id,chatId:cid,name,sha256:sha,size:data.length};
        });
    }
    async function file(actor,fid){authorized(actor);const f=await tx(async c=>row(await c.query("select * from public.atendimento_anexos where user_id=$1 and id=$2 and estado_arquivo='arquivado'",[owner,fid]))||fail('Arquivo indisponível.',404));const bytes=await objectStore.get(f.caminho);if(await objectStore.digest(bytes)!==f.sha256)fail('Arquivo corrompido.',409);return {id:f.id,chatId:f.conversa_id,name:f.nome,mime:f.mime,bytes:Array.from(bytes),sha256:f.sha256};}
    return {mode:'sintetico',owner,instance,tx,enqueue,processNext,list,messages,read,link,compose,claim,finish,dispatchNext,recoverUncertain,archive,file,objectStore};
}
