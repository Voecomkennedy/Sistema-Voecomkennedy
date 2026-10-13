const test=require('node:test');
const assert=require('node:assert/strict');
const ready=import('../supabase/functions/_shared/atendimento/one-shot-test.mjs');
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const url='https://example.invalid/functions/v1/atendimento-teste-unico';
const req=(token='user-jwt',extra={})=>new Request(url,{method:'POST',headers:{authorization:`Bearer ${token}`},...extra});
function fixture(extra={}){
  const rows=new Map(),sent=[];
  const db={from(name){assert.equal(name,'atendimento_teste_envio_unico');return{
    insert:async row=>{if(rows.has(row.chave))return{error:{code:'23505'}};rows.set(row.chave,{...row});return{error:null};},
    update:row=>({eq:()=>({eq:async()=>{Object.assign(rows.get('piloto_texto_1'),row);return{error:null};}})})
  };}};
  const cfg={enabled:true,receivingEnabled:true,owner,instance:'INSTANCE_TEST',transportInstance:'INSTANCE_TEST',
    phone:'5562999997399',db,authenticate:async token=>token==='user-jwt'?{id:owner}:null,
    send:async payload=>{sent.push(payload);return{ok:true,status:200,messageId:'provider-1'};},
    now:()=>new Date('2026-10-13T20:00:00.000Z'),...extra};
  return{cfg,rows,sent};
}
test('desligado, recepção inativa e destino inválido não reservam nem enviam',async()=>{
  const{createOneShotTestHandler}=await ready;
  for(const extra of[{enabled:false},{receivingEnabled:false},{phone:'5562999990000@g.us'},{transportInstance:'OUTRA'}]){
    const f=fixture(extra);
    assert.equal((await createOneShotTestHandler(f.cfg)(req())).status,503);
    assert.equal(f.rows.size,0);assert.equal(f.sent.length,0);
  }
});
test('só POST exato e JWT do proprietário autorizam reserva',async()=>{
  const{createOneShotTestHandler}=await ready;const f=fixture();const h=createOneShotTestHandler(f.cfg);
  assert.equal((await h(new Request(url,{method:'GET'}))).status,405);
  assert.equal((await h(new Request(url+'?x=1',{method:'POST'}))).status,400);
  assert.equal((await h(req('wrong'))).status,403);
  assert.equal((await h(new Request(url,{method:'POST'}))).status,401);
  assert.equal(f.rows.size,0);assert.equal(f.sent.length,0);
});
test('reserva atômica precede um único envio e impede repetição',async()=>{
  const{createOneShotTestHandler,TEST_TEXT}=await ready;const f=fixture();const h=createOneShotTestHandler(f.cfg);
  const first=await h(req());assert.equal(first.status,200);
  const body=await first.json();assert.equal(body.estado,'aceito');assert.equal(body.provedor_id,'provider-1');
  assert.equal((await h(req())).status,409);assert.equal(f.sent.length,1);
  assert.equal(f.sent[0].message,TEST_TEXT);assert.equal(f.sent[0].phone,f.cfg.phone);
  assert.equal(f.rows.get('piloto_texto_1').estado,'aceito');
});
test('duas chamadas simultâneas não provocam segundo envio',async()=>{
  const{createOneShotTestHandler}=await ready;const f=fixture();const h=createOneShotTestHandler(f.cfg);
  const responses=await Promise.all([h(req()),h(req())]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  assert.equal(f.sent.length,1);
});
test('timeout ou resposta sem ID permanecem incertos e nunca repetem',async()=>{
  const{createOneShotTestHandler}=await ready;
  for(const send of[async()=>{throw Error('timeout');},async()=>({ok:true,status:200})]){
    const f=fixture({send});const h=createOneShotTestHandler(f.cfg);
    const result=await h(req());assert.equal(result.status,202);
    assert.equal((await result.json()).estado,'incerto');
    assert.equal(f.rows.get('piloto_texto_1').estado,'incerto');
    assert.equal((await h(req())).status,409);
  }
});
