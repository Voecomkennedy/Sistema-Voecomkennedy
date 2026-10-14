// Synthetic sizing only. No operational URLs or data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {withDatabase}=require('../tests/helpers/integrity-db.cjs');
const target=310213,A='11111111-1111-4111-8111-111111111111';
const result={scope:'temporary loopback PostgreSQL17; synthetic 310213-byte fixture',cases:[]};
function payload(entropy){
 const b={emissao_vendas:Array.from({length:88},(_,i)=>({id:'v'+i,clienteId:'p'+i,valorVenda:100,statusVenda:'emitida'})),emissao_pessoas:Array.from({length:181},(_,i)=>({id:'p'+i,tipo:'cliente',nome:'Pessoa sintética '+i})),emissao_pacotes:[],emissao_cotacoes:Array.from({length:21},(_,i)=>({id:'q'+i,clienteId:'p'+i,status:'aberta',observacao:'Base sintética'})),sizing_synthetic_padding:''};
 const remaining=target-Buffer.byteLength(JSON.stringify(b));
 b.sizing_synthetic_padding=entropy==='repetitive'?'A'.repeat(remaining):crypto.randomBytes(Math.ceil(remaining*3/4)+5).toString('base64').slice(0,remaining);
 assert.equal(Buffer.byteLength(JSON.stringify(b)),target);return b;
}
async function measure(admin){return(await admin.query("select (pg_total_relation_size('integridade_privado.baselines')+pg_total_relation_size('integridade_privado.operacoes'))::bigint as history_total,(pg_table_size('integridade_privado.baselines')+pg_table_size('integridade_privado.operacoes'))::bigint as history_table_toast,(pg_indexes_size('integridade_privado.baselines')+pg_indexes_size('integridade_privado.operacoes'))::bigint as history_indexes,pg_total_relation_size('public.dados_app')::bigint as source_total,pg_database_size(current_database())::bigint as database_total,pg_current_wal_insert_lsn() as wal_lsn")).rows[0];}
const numeric=s=>Object.fromEntries(Object.entries(s).map(([k,v])=>[k,k==='wal_lsn'?v:Number(v)]));
(async()=>{
 for(const entropy of['repetitive','random_base64'])for(const mode of['version_only','content_change'])await withDatabase(async({admin,connect,applyCompact})=>{
  applyCompact();await admin.query('insert into auth.users(id) values($1)',[A]);await admin.query('grant update(versao) on dados_app to service_role');
  const a=await connect('authenticated',A),service=await connect('service_role'),body=payload(entropy),empty=await measure(admin);
  await a.query('insert into dados_app(user_id,conteudo,versao) values($1,$2,1)',[A,body]);
  const samples=[{updates:0,...await measure(admin)}];
  for(let i=1;i<=100;i++){
   if(mode==='version_only')await service.query('update dados_app set versao=versao+1 where user_id=$1',[A]);
   else{body.emissao_cotacoes[0].observacao='Revisão sintética '+i;await a.query('update dados_app set conteudo=$1,versao=versao+1 where user_id=$2',[body,A]);}
   if([10,50,99,100].includes(i))samples.push({updates:i,...await measure(admin)});
  }
  const first=samples[0],last=samples.at(-1),n=(await admin.query('select count(*)::int as n from integridade_privado.operacoes')).rows[0].n;
  assert.equal(n,101);const baselines=(await admin.query('select count(*)::int as n from integridade_privado.baselines')).rows[0].n;assert.equal(baselines,mode==='version_only'?1:2);
  const latest=(await a.query('select operacao_id from integridade_privado.operacoes order by versao_depois desc limit 1')).rows[0];
  const start=performance.now(),read=(await a.query("select integridade_obter_estado($1,$2,'depois') as state",[A,latest.operacao_id])).rows[0].state;const reconstruction_ms=performance.now()-start;assert.deepEqual(read,body);
  const wal=Number((await admin.query('select pg_wal_lsn_diff($1,$2) as n',[last.wal_lsn,first.wal_lsn])).rows[0].n);
  const c={entropy,mode,serialized_bytes:target,operations:n,baselines,empty:numeric(empty),samples:samples.map(numeric),baseline_increment:Number(first.history_total)-Number(empty.history_total),history_bytes_per_update:(Number(last.history_total)-Number(first.history_total))/100,history_bytes_per_update_before_checkpoint:(Number(samples.at(-2).history_total)-Number(first.history_total))/99,checkpoint_increment:Number(last.history_total)-Number(samples.at(-2).history_total),source_bytes_per_update:(Number(last.source_total)-Number(first.source_total))/100,database_bytes_per_update:(Number(last.database_total)-Number(first.database_total))/100,wal_bytes_per_update:wal/100,reconstruction_ms};
  result.cases.push(c);console.log(JSON.stringify(c));
 });
 const out=process.argv[2];if(out)fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({passed:4,updates:400,production_requests:0}));
})().catch(e=>{console.error(e.stack);process.exitCode=1});
