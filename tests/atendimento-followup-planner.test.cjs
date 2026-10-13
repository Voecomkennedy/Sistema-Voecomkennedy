const test=require('node:test'),assert=require('node:assert/strict');
const ready=import('../js/atendimento-followup-planner.mjs');
const policy={approved:true,delaysMinutes:[120,1440],maxAttempts:2,business:{days:[1,2,3,4,5],startMinute:9*60,endMinute:18*60}};
const state={stage:'aguardando',stageAt:'2026-10-13T19:00:00Z',lastIncomingAt:'2026-10-13T18:00:00Z',optout:false,saleId:null,attempts:[]};
test('sem regras aprovadas não produz candidato nem aciona transporte',async()=>{
  const {planQuoteFollowup}=await ready;assert.equal(planQuoteFollowup(state,{...policy,approved:false}).status,'disabled');
  assert.equal(planQuoteFollowup(state,undefined).status,'disabled');
});
test('janela BRT desloca retorno para horário comercial e limita tentativas',async()=>{
  const {planQuoteFollowup}=await ready;
  const first=planQuoteFollowup(state,policy);assert.equal(first.status,'candidate');assert.equal(first.dueAt,'2026-10-14T12:00:00.000Z');
  const second=planQuoteFollowup({...state,attempts:[{status:'sent',sentAt:first.dueAt}]},policy);
  assert.equal(second.status,'candidate');assert.equal(second.attempt,2);
  assert.equal(planQuoteFollowup({...state,attempts:[{status:'sent',sentAt:first.dueAt},{status:'sent',sentAt:second.dueAt}]},policy).status,'cancelled');
});
test('resposta, opt-out, emissão/fechamento, venda e pendência cancelam ou seguram follow-up',async()=>{
  const {planQuoteFollowup}=await ready;
  for(const variation of [{lastIncomingAt:state.stageAt},{optout:true},{stage:'emissao'},{stage:'encerrado'},{saleId:'v1'}])
    assert.equal(planQuoteFollowup({...state,...variation},policy).status,'cancelled');
  assert.equal(planQuoteFollowup({...state,attempts:[{status:'pending'}]},policy).status,'held');
  assert.equal(planQuoteFollowup({...state,attempts:[{status:'uncertain'}]},policy).status,'held');
});
