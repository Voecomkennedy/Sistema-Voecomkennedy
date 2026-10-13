const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ready = Promise.all([import('../js/atendimento-domain.mjs'),import('../js/atendimento-adapters.mjs'),import('../js/atendimento-demo.mjs'),import('../supabase/functions/_shared/atendimento/handler.mjs')]);
const base = { type:'message',instance:'mock',messageId:'m1',phone:'+5562999990001',lid:'1234567@lid',fromMe:false,text:'Olá',at:'2026-10-13T09:00:00Z',status:'entregue' };
async function fixture() { const [d,a,demo,h] = await ready; return { d,a,demo,h,s:d.createSyntheticService({ owner:'owner-a' }) }; }

test('gate fechado por padrão e demo exige loopback e query explícita',async()=>{
    const {d}=await fixture(); assert.equal(d.CONFIG.enabled,false);
    for(const hostname of ['sistema.voecomkennedy.tur.br','127.0.0.1.evil','evil.localhost']) assert.equal(d.demoAllowed({hostname,search:'?demo=1'}),false);
    assert.equal(d.demoAllowed({hostname:'localhost',search:''}),false); assert.equal(d.demoAllowed({hostname:'127.0.0.1',search:'?demo=1'}),true);
});
test('eventos repetidos não duplicam mensagens ou não lidas; ordenação não depende da chegada',async()=>{
    const {s}=await fixture(); const first=s.ingest('owner-a',base); assert.equal(s.ingest('owner-a',base).duplicate,true);
    s.ingest('owner-a',{...base,messageId:'old',at:'2026-10-13T08:00:00Z'});
    assert.equal(s.list('owner-a')[0].unread,2); assert.equal(s.list('owner-a')[0].last.providerId,'m1');
    s.read('owner-a',first.chatId); assert.equal(s.list('owner-a',{unread:true}).length,0);
    s.ingest('owner-a',{...base,messageId:'late',at:'2026-10-13T07:00:00Z'}); assert.equal(s.list('owner-a')[0].unread,1);
});
test('status antes do conteúdo e estados atrasados não regridem entrega/leitura',async()=>{
    const {s}=await fixture(); s.ingest('owner-a',{...base,type:'status',status:'lida'});
    s.ingest('owner-a',{...base,fromMe:true,status:'aceita'});
    s.ingest('owner-a',{...base,type:'status',status:'entregue'});
    assert.equal(s.messages('owner-a',s.list('owner-a')[0].id)[0].status,'lida');
    assert.equal(s.list('owner-a')[0].unread,0);
});
test('grupos não entram no módulo novo e mensagem própria não cria outbox/reenvio',async()=>{
    const {s}=await fixture(); assert.ok(s.ingest('owner-a',{...base,isGroup:true}).ignored);
    assert.equal(s.list('owner-a').length,0); s.ingest('owner-a',{...base,fromMe:true});
    const m=s.messages('owner-a',s.list('owner-a')[0].id)[0]; assert.equal(m.requestId,undefined);
    await assert.rejects(s.dispatch('owner-a',m.id,{mode:'sintetico',send(){throw new Error('não deve chamar');}}),{status:409});
});
test('isolamento de proprietário em leitura, entrada, composição, vínculo e arquivos',async()=>{
    const {s}=await fixture(); s.ingest('owner-a',base); const cid=s.list('owner-a')[0].id;
    for(const operation of [()=>s.list('owner-b'),()=>s.ingest('owner-b',base),()=>s.read('owner-b',cid),()=>s.compose('owner-b',cid,{text:'x',requestId:'r'}),()=>s.link('owner-b',cid,{})]) assert.throws(operation,{status:403});
    await assert.rejects(s.archive('owner-b',cid,{name:'x.pdf',bytes:new TextEncoder().encode('%PDF-')}),{status:403});
});
test('telefone/LID é associado com evidência conjunta; conflitos e LID numérico não viram telefone',async()=>{
    const {s}=await fixture(); const lid=s.ingest('owner-a',{...base,phone:null});
    assert.throws(()=>s.compose('owner-a',lid.chatId,{text:'x',requestId:'r'}),/sem telefone/);
    s.ingest('owner-a',{...base,messageId:'pair'}); assert.equal(s.list('owner-a').length,1);
    s.ingest('owner-a',{...base,messageId:'other',phone:'+5561999990002',lid:'7654321@lid'});
    assert.throws(()=>s.ingest('owner-a',{...base,messageId:'conflict',phone:'+5561999990002'}),{status:409});
    assert.equal(s.list('owner-a').length,2);
});
test('duplo clique, falha segura/retry, concorrência e resultado incerto',async()=>{
    const {s,a}=await fixture(); const cid=s.ingest('owner-a',base).chatId;
    const m=s.compose('owner-a',cid,{text:'Resposta',requestId:'req1'});
    assert.equal(s.compose('owner-a',cid,{text:'Resposta',requestId:'req1'}).id,m.id);
    assert.throws(()=>s.compose('owner-a',cid,{text:'Outro',requestId:'req1'}),{status:409});
    await assert.rejects(s.dispatch('owner-a',m.id,{mode:'real',send(){}}),{status:403});
    assert.equal((await s.dispatch('owner-a',m.id,a.mockTransport({outcome:'failure'}))).result,'falha_segura');
    const results=await Promise.allSettled([s.dispatch('owner-a',m.id,a.mockTransport()),s.dispatch('owner-a',m.id,a.mockTransport())]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const uncertain=s.compose('owner-a',cid,{text:'Incerta',requestId:'req2'});
    assert.equal((await s.dispatch('owner-a',uncertain.id,a.mockTransport({outcome:'uncertain'}))).result,'incerto');
    await assert.rejects(s.dispatch('owner-a',uncertain.id,a.mockTransport()),{status:409});
});
test('limite de tentativas e eco do provedor mantém uma mensagem',async()=>{
    const {s,a}=await fixture(); const cid=s.ingest('owner-a',base).chatId;
    const m=s.compose('owner-a',cid,{text:'Resposta',requestId:'req1'});
    await s.dispatch('owner-a',m.id,a.mockTransport());
    s.ingest('owner-a',{...base,messageId:'mock-req1',fromMe:true,status:'aceita',text:'Resposta'});
    assert.equal(s.messages('owner-a',cid).length,2);
    const retry=s.compose('owner-a',cid,{text:'x',requestId:'req2'});
    for(let i=0;i<3;i++) await s.dispatch('owner-a',retry.id,a.mockTransport({outcome:'failure'}));
    await assert.rejects(s.dispatch('owner-a',retry.id,a.mockTransport()),{status:409});
});
test('vínculos respeitam a fonte comercial e recebido líquido reutiliza StorageManager',async()=>{
    const {d,demo}=await fixture(); const context={window:{},localStorage:{getItem(){throw new Error('não ler cache');}}}; vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve('../js/storage.js'),'utf8')+';globalThis.manager=StorageManager;',context);
    const source=structuredClone(demo.DEMO_SOURCE), before=JSON.stringify(source);
    const s=d.createSyntheticService({owner:'owner-a',source,financialSummary:s=>context.manager.obterResumoFinanceiroVenda(s)});
    const cid=s.ingest('owner-a',base).chatId;
    assert.throws(()=>s.link('owner-a',cid,{clienteId:'p-bruno',vendaId:'v-ana'}),/incompatível/);
    s.link('owner-a',cid,{clienteId:'p-ana',vendaId:'v-ana',etiquetas:['Proposta']});
    assert.equal(s.list('owner-a')[0].context.vendas[0].recebidoLiquido,900);
    assert.equal(s.list('owner-a')[0].context.origemContato,'Não informada'); assert.equal(s.list('owner-a',{label:'Proposta',search:'Olá'}).length,1);
    assert.equal(JSON.stringify(source),before);
});
test('exportação/restauração inclui bytes; corrupção, ausência, outra conta e anexo cruzado são bloqueados',async()=>{
    const {s,d,demo}=await fixture(); const cid=s.ingest('owner-a',base).chatId;
    const file=await s.archive('owner-a',cid,{name:'proposta.pdf',bytes:demo.demoPdf()});
    s.compose('owner-a',cid,{attachmentId:file.id,requestId:'pdf1'});
    const backup=s.export('owner-a'), restored=d.createSyntheticService({owner:'owner-a'}); await restored.restore('owner-a',backup);
    assert.deepEqual(restored.file('owner-a',file.id).bytes,file.bytes);
    const corrupted=structuredClone(backup); corrupted.files[0].bytes[10]^=1;
    await assert.rejects(restored.restore('owner-a',corrupted),/corrompido/); assert.deepEqual(restored.export('owner-a'),backup);
    const missing=structuredClone(backup); missing.files=[]; await assert.rejects(restored.restore('owner-a',missing),/Mensagem inválida/);
    await assert.rejects(d.createSyntheticService({owner:'owner-b'}).restore('owner-b',backup),/incompatível/);
    const other=s.ingest('owner-a',{...base,messageId:'other',phone:'+5561999990002',lid:null}).chatId;
    assert.throws(()=>s.compose('owner-a',other,{attachmentId:file.id,requestId:'pdf2'}),/outra conversa/);
    await assert.rejects(s.archive('owner-a',cid,{name:'../x.pdf',bytes:demo.demoPdf()}));
});
test('adaptador Z-API rejeita instância e formatos ambíguos; LID próprio não associa destinatário',async()=>{
    const {a}=await fixture(); const p={instanceId:'instance-demo',type:'ReceivedCallback',connectedPhone:'5562999990999',isGroup:false,phone:'5562999990001',senderLid:'1234567@lid',messageId:'provider1',fromMe:false,momment:Date.parse(base.at),status:'RECEIVED',text:{message:'Olá'}};
    const config={instance:'instance-demo',connectedPhone:p.connectedPhone}; assert.equal(a.normalizeZapi(p,config)[0].lid,p.senderLid);
    assert.equal(a.normalizeZapi({...p,fromMe:true},config)[0].lid,null);
    assert.equal(a.normalizeZapi({...p,isGroup:true},config).length,0);
    assert.equal(a.normalizeZapi({...p,isGroup:undefined},config).length,0);
    assert.equal(a.normalizeZapi({...p,type:'MessageStatusCallback',ids:['provider1'],status:'READ_BY_ME'},config).length,0);
    assert.throws(()=>a.normalizeZapi({...p,instanceId:'foreign'},config),/Instância/);
});
test('handler fechado não lê fonte; Auth decide dono, corpo não pode forjá-lo',async()=>{
    const {h,s}=await fixture(); let calls=0;
    const request=body=>new Request('http://localhost/atendimento',{method:'POST',headers:{origin:'http://localhost',authorization:'Bearer fixture'},body:JSON.stringify(body)});
    const config={allowedOrigin:'http://localhost',verifyUser:async()=>({id:'owner-a'}),serviceFor:async owner=>{assert.equal(owner,'owner-a');calls++;return s;}};
    assert.equal((await h.createHandler(config)(request({acao:'listar'}))).status,503); assert.equal(calls,0);
    assert.equal((await h.createHandler({...config,enabled:true})(request({acao:'listar',owner:'owner-b'}))).status,422); assert.equal(calls,0);
    assert.equal((await h.createHandler({...config,enabled:true})(request({acao:'listar'}))).status,200);
    assert.equal((await h.createHandler({...config,enabled:true,verifyUser:async()=>null})(request({acao:'listar'}))).status,401);
    assert.equal((await h.createHandler({...config,enabled:true,serviceFor:async()=>({mode:'real',list(){throw new Error('não pode ler');}})})(request({acao:'listar'}))).status,503);
});

test('cópia de PDF valida origem, bytes e bucket privado; falha não produz metadados falsos',async()=>{
    const {copyProviderPdf}=await import('../supabase/functions/_shared/atendimento/media.mjs'),{demo}=await fixture();
    const args={owner:crypto.randomUUID(),chatId:crypto.randomUUID(),fileId:crypto.randomUUID(),name:'proposta.pdf',url:'https://media.exemplo.invalid/file.pdf'};
    let calls=0,options;
    const deps={allowedHosts:['media.exemplo.invalid'],download:async(url,opts)=>{options=opts;return{bytes:demo.demoPdf(),mime:'application/pdf'};},client:{storage:{getBucket:()=>({data:{id:'atendimento-arquivos',public:false}}),from:()=>({upload:(path,bytes,opts)=>{calls++;assert.equal(opts.upsert,false);assert.ok(bytes.length>5);return{data:{path}};}})}}};
    const archived=await copyProviderPdf(args,deps);assert.match(archived.path,new RegExp('^'+args.owner+'/'));assert.equal(archived.url,undefined);assert.equal(archived.sha256.length,64);assert.equal(options.redirect,'error');assert.equal(calls,1);
    await assert.rejects(copyProviderPdf({...args,url:'http://127.0.0.1/private'},deps),/não autorizada/);assert.equal(calls,1);
    await assert.rejects(copyProviderPdf(args,{...deps,download:async()=>({bytes:new Uint8Array([1,2,3]),mime:'application/pdf'})}),/Mídia inválida/);
    await assert.rejects(copyProviderPdf(args,{...deps,client:{storage:{getBucket:()=>({data:{id:'atendimento-arquivos',public:true}})}}}),/Bucket privado/);
    await assert.rejects(copyProviderPdf(args,{...deps,client:{storage:{...deps.client.storage,from:()=>({upload:()=>({error:true})})}}}),/não confirmada/);
});
test('encaminhamento candidato preserva consumidor antigo; grupos são filtrados só no novo e falhas são independentes',async()=>{
    const {fanoutCandidate}=await import('../supabase/functions/_shared/atendimento/fanout.mjs');let legacy=[],fresh=[];
    const privateConfig={instance:'mock',connectedPhone:'5562999990999'};
    const consumers={enqueueLegacy:p=>legacy.push(p),enqueuePrivate:p=>fresh.push(p),privateConfig};
    const payload={instanceId:'mock',connectedPhone:privateConfig.connectedPhone,type:'ReceivedCallback',isGroup:true,phone:'test@g.us',messageId:'group1',fromMe:false,momment:Date.now(),status:'RECEIVED',text:{message:'Grupo fictício'},unknownField:{keep:'intact'}};
    const first=await fanoutCandidate(payload,{...consumers,privateEnabled:true});assert.equal(first.atendimento,'ignorado');assert.deepEqual(legacy[0],payload);assert.equal(fresh.length,0);
    const privatePayload={...payload,isGroup:false,phone:'5562999990001',messageId:'private1'};
    const off=await fanoutCandidate(privatePayload,consumers);assert.equal(off.atendimento,'ignorado');assert.equal(fresh.length,0);
    const result=await fanoutCandidate(privatePayload,{...consumers,enqueuePrivate:()=>{throw new Error('falha do novo consumidor');}});
    assert.equal(result.atendimento,'ignorado');
    const enabled=await fanoutCandidate(privatePayload,{...consumers,privateEnabled:true,enqueuePrivate:()=>{throw new Error('falha do novo consumidor');}});
    assert.equal(enabled.legacy,'fulfilled');assert.equal(enabled.retryAtendimento,true);assert.equal(enabled.retryLegacy,false);assert.deepEqual(legacy.at(-1),privatePayload);
    const unknown=await fanoutCandidate({...privatePayload,type:'UnknownCallback'},{...consumers,privateEnabled:true});assert.equal(unknown.atendimento,'ignorado');assert.deepEqual(legacy.at(-1).type,'UnknownCallback');
    const failed=await fanoutCandidate(privatePayload,{...consumers,privateEnabled:true,enqueueLegacy:()=>{throw new Error('falha legado');}});assert.equal(failed.legacy,'rejected');assert.equal(failed.retryLegacy,true);
    const {privateCallbackEvents}=await import('../js/atendimento-adapters.mjs');const own={...privatePayload,fromMe:true,senderLid:'123456789@lid'};
    assert.equal(privateCallbackEvents(own,privateConfig)[0].lid,null);
    assert.equal(privateCallbackEvents({...own,isGroup:undefined},privateConfig).length,0);
});

test('validador reutiliza getUser com token existente; ignora owner e user_metadata',async()=>{
    const {h}=await fixture();let calls=0;
    const verify=h.verifyWithExistingAuth({auth:{getUser:token=>{calls++;assert.equal(token,'synthetic-token');return{data:{user:{id:'owner-a',user_metadata:{owner:'owner-b'}}}};}}});
    assert.equal(await verify(null),null);assert.equal(await verify('Bearer a b'),null);assert.equal(calls,0);
    assert.deepEqual(await verify('Bearer synthetic-token'),{id:'owner-a'});
    const denied=h.verifyWithExistingAuth({auth:{getUser:()=>({error:true,data:{user:{id:'owner-a'}}})}});assert.equal(await denied('Bearer synthetic-token'),null);
});
test('status conflitante e direção adulterada não criam aliases ou conversas parciais',async()=>{
    const {s}=await fixture();s.ingest('owner-a',{...base,type:'status',status:'lida'});const before=s.export('owner-a');
    assert.throws(()=>s.ingest('owner-a',{...base,phone:'+5561999990002',lid:'7654321@lid'}),{status:409});assert.deepEqual(s.export('owner-a'),before);
    s.ingest('owner-a',base);const after=s.export('owner-a');
    // Mesmo ID já deduplicado não altera direção nem conteúdo.
    assert.equal(s.ingest('owner-a',{...base,fromMe:true}).duplicate,true);assert.deepEqual(s.export('owner-a'),after);
});
