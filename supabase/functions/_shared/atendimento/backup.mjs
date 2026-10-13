import { Buffer } from 'node:buffer';
const tables={
    conversas:['id','user_id','instancia','nome','cliente_id','cotacao_id','venda_id','origem_contato','etiquetas','criado_em'],
    identidades:['user_id','conversa_id','instancia','tipo','valor','evidencia_evento'],
    anexos:['id','user_id','conversa_id','mensagem_id','nome','mime','tamanho','sha256','caminho','criado_em','requisicao_id','estado_arquivo'],
    mensagens:['id','user_id','conversa_id','instancia','provedor_id','requisicao_id','direcao','texto','estado','modo','ocorrido_em','lida_em','anexo_id','substituida_por'],
    eventos:['id','user_id','instancia','dedupe','tipo','mensagem_id','provedor_id','estado','ocorrido_em','recebido_em','detalhes'],
    outbox:['id','user_id','mensagem_id','modo','estado','tentativas','token','disponivel_em','criado_em','tentativa_em'],
    ingressos:['id','user_id','instancia','dedupe','payload','estado','tentativas','criado_em','disponivel_em','modo'],
    encaminhamentos:['id','user_id','instancia','dedupe','consumidor','payload','estado','token','tentativas','modo','criado_em']
};
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export function createDurableBackup(repo){
    const {owner,objectStore}=repo;
    const authorize=actor=>{if(actor!==owner)fail('Acesso negado.',403);};
    async function exportPackage(actor){
        authorize(actor);const data=await repo.tx(async c=>{
            const snapshot={};for(const [name,columns] of Object.entries(tables))snapshot[name]=(await c.query(`select ${columns.join(',')} from public.atendimento_${name} where user_id=$1 order by ${name==='identidades'?'instancia,tipo,valor':'id'}`,[owner])).rows;
            for(const job of [...snapshot.outbox,...snapshot.encaminhamentos])job.token=null;return JSON.parse(JSON.stringify(snapshot));
        },{snapshot:true});
        const files=[];
        for(const f of data.anexos){if(f.estado_arquivo!=='arquivado')fail('Há arquivo pendente; backup completo não confirmado.',409);const bytes=await objectStore.get(f.caminho);if(bytes.length!==Number(f.tamanho)||await objectStore.digest(bytes)!==f.sha256)fail('Arquivo ausente/corrompido; backup abortado.',409);files.push({id:f.id,path:f.caminho,sha256:f.sha256,size:bytes.length,base64:Buffer.from(bytes).toString('base64')});}
        return {version:2,mode:'sintetico',owner,id:crypto.randomUUID(),data,files};
    }
    async function validate(pack){
        if(pack?.version!==2||pack.mode!=='sintetico'||pack.owner!==owner||!uuid(pack.id)||!Array.isArray(pack.files)||!pack.data||Object.keys(pack.data).sort().join(',')!==Object.keys(tables).sort().join(','))fail('Pacote incompatível.');
        if(JSON.stringify(pack).length>50*1024*1024)fail('Pacote excede limite local de 50 MB.');
        for(const [name,columns] of Object.entries(tables)){
            const rows=pack.data[name];if(!Array.isArray(rows)||rows.length>10000)fail('Coleção inválida.');
            const keys=new Set();for(const r of rows){if(!r||r.user_id!==owner||Object.keys(r).some(k=>!columns.includes(k))||columns.some(k=>!Object.hasOwn(r,k))||('modo'in r&&r.modo!=='sintetico')||('instancia'in r&&r.instancia!=='mock')||('id'in r&&!uuid(r.id)))fail('Registro fora do contrato.');
                const primary=name==='identidades'?JSON.stringify([r.instancia,r.tipo,r.valor]):r.id;if(keys.has(primary))fail('Chave duplicada no backup.');keys.add(primary);
            }
        }
        const chats=new Map(pack.data.conversas.map(c=>[c.id,c])),messages=new Map(pack.data.mensagens.map(m=>[m.id,m])),files=new Map(pack.data.anexos.map(f=>[f.id,f]));
        for(const rows of [pack.data.identidades,pack.data.mensagens,pack.data.anexos])for(const r of rows)if(!chats.has(r.conversa_id))fail('Conversa ausente.');
        for(const m of messages.values())if((m.anexo_id&&files.get(m.anexo_id)?.conversa_id!==m.conversa_id)||(m.substituida_por&&messages.get(m.substituida_por)?.conversa_id!==m.conversa_id))fail('Referência cruzada.');
        for(const e of [...pack.data.eventos,...pack.data.outbox])if(e.mensagem_id&&!messages.has(e.mensagem_id))fail('Mensagem ausente.');
        for(const f of files.values())if(f.mensagem_id&&messages.get(f.mensagem_id)?.conversa_id!==f.conversa_id)fail('Anexo de outra conversa.');
        if(pack.files.length!==files.size||new Set(pack.files.map(f=>f.id)).size!==pack.files.length)fail('Objetos ausentes/duplicados.');
        const decoded=[];
        for(const object of pack.files){const metadata=files.get(object.id);if(!metadata||object.path!==`${owner}/${metadata.conversa_id}/${metadata.id}.pdf`||object.path!==metadata.caminho||object.sha256!==metadata.sha256||typeof object.base64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(object.base64))fail('Manifesto inválido.');
            const bytes=new Uint8Array(Buffer.from(object.base64,'base64'));if(bytes.length!==object.size||bytes.length!==Number(metadata.tamanho)||bytes.length>5242880||bytes.length<5||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-'||await objectStore.digest(bytes)!==object.sha256)fail('Objeto corrompido.');decoded.push({...object,bytes});
        }return decoded;
    }
    async function restorePackage(actor,pack){
        authorize(actor);const decoded=await validate(pack),fingerprint=await objectStore.digest(new TextEncoder().encode(JSON.stringify(pack)));
        return repo.tx(async c=>{
            await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[owner+':mock']);
            const previous=(await c.query("select detalhes from public.atendimento_eventos where user_id=$1 and dedupe=$2",[owner,'restore:'+pack.id])).rows[0];
            if(previous){if(previous.detalhes.sha256!==fingerprint)fail('ID de restauração reutilizado.',409);return {ok:true,reused:true};}
            for(const name of Object.keys(tables))if((await c.query(`select 1 from public.atendimento_${name} where user_id=$1 limit 1`,[owner])).rowCount)fail('Restauração exige destino vazio para este proprietário.',409);
            for(const file of decoded)await objectStore.put(file.path,file.bytes);
            for(const [name,columns] of Object.entries(tables))for(const original of pack.data[name]){
                const value={...original};if(name==='anexos')value.mensagem_id=null;if(name==='mensagens')value.substituida_por=null;
                if(name==='outbox'){value.token=null;if(['pendente','tentativa','falha_segura'].includes(value.estado))value.estado='incerto';}
                if(name==='encaminhamentos'){value.token=null;if(['pendente','tentativa'].includes(value.estado))value.estado='incerto';}
                await c.query(`insert into public.atendimento_${name}(${columns.join(',')}) values(${columns.map((_,i)=>'$'+(i+1)).join(',')})`,columns.map(k=>value[k]));
            }
            for(const m of pack.data.mensagens)if(m.substituida_por)await c.query('update public.atendimento_mensagens set substituida_por=$3 where user_id=$1 and id=$2',[owner,m.id,m.substituida_por]);
            for(const f of pack.data.anexos)if(f.mensagem_id)await c.query('update public.atendimento_anexos set mensagem_id=$3 where user_id=$1 and id=$2',[owner,f.id,f.mensagem_id]);
            await c.query("insert into public.atendimento_eventos(user_id,instancia,dedupe,tipo,ocorrido_em,detalhes) values($1,'mock',$2,'restore',clock_timestamp(),$3)",[owner,'restore:'+pack.id,{sha256:fingerprint,files:decoded.length}]);return {ok:true,reused:false,files:decoded.length};
        });
    }
    return {exportPackage,restorePackage};
}
