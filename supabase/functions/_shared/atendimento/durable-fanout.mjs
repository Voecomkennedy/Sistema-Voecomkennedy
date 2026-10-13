// Filas locais, receptor NÃO ativado. O JSON preserva campos, não os bytes brutos do HTTP.
import { privateCallbackEvents } from '../../../../js/atendimento-adapters.mjs';
export function createDurableFanout(repo,{privateEnabled=false,privateConfig}={}){
    const authorize=actor=>{if(actor!==repo.owner)throw Object.assign(new Error('Acesso negado.'),{status:403});};
    return {
        async enqueue(actor,{key,instance='mock',payload}){
            authorize(actor);if(instance!=='mock'||typeof key!=='string'||!key||key.length>200||!payload||JSON.stringify(payload).length>200000)throw new Error('Envelope sintético inválido.');
            const envelope=structuredClone(payload);
            return await repo.tx(async c=>{
                await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[repo.owner+':'+instance]);
                const prior=(await c.query("select consumidor,payload=$4::jsonb as identical from public.atendimento_encaminhamentos where user_id=$1 and instancia=$2 and dedupe=$3 order by case consumidor when 'legado' then 0 else 1 end",[repo.owner,instance,key,envelope])).rows;
                if(prior.some(job=>!job.identical))throw Object.assign(new Error('Chave de encaminhamento reutilizada com outro envelope.'),{status:409});
                // Repetir um evento após mudar a flag não cria captura retroativa de conversas.
                if(prior.length)return {consumers:prior.map(job=>job.consumidor),duplicate:true};
                const consumers=['legado'];if(privateEnabled===true&&privateCallbackEvents(envelope,privateConfig).length>0)consumers.push('atendimento');
                for(const consumer of consumers)await c.query('insert into public.atendimento_encaminhamentos(user_id,instancia,dedupe,consumidor,payload) values($1,$2,$3,$4,$5) on conflict do nothing',[repo.owner,instance,key,consumer,envelope]);return {consumers,duplicate:false};
            });
        },
        async dispatch(actor,consumer,deliver){
            authorize(actor);if(!['legado','atendimento'].includes(consumer)||deliver?.mode!=='sintetico')throw new Error('Consumidor real desativado.');
            const job=await repo.tx(async c=>{
                const selected=(await c.query("select * from public.atendimento_encaminhamentos where user_id=$1 and consumidor=$2 and estado='pendente' and tentativas<3 and disponivel_em<=clock_timestamp() order by disponivel_em,criado_em,id for update skip locked limit 1",[repo.owner,consumer])).rows[0];if(!selected)return null;
                return (await c.query("update public.atendimento_encaminhamentos set estado='tentativa',token=gen_random_uuid(),tentativas=tentativas+1 where user_id=$1 and id=$2 returning *",[repo.owner,selected.id])).rows[0];
            });if(!job)return null;
            let result='incerto';try{const receipt=await deliver.send({idempotencyKey:job.dedupe,payload:job.payload});result=receipt?.durablyAccepted===true?'concluido':receipt?.definitelyNotAccepted===true?'pendente':'incerto';}catch{/* Resultado incerto não repete automaticamente. */}
            await repo.tx(c=>c.query("update public.atendimento_encaminhamentos set estado=$4,disponivel_em=case when $4='pendente' then clock_timestamp()+interval '5 seconds' else disponivel_em end where user_id=$1 and id=$2 and token=$3 and estado='tentativa'",[repo.owner,job.id,job.token,result]));return {consumer,result};
        }
    };
}
