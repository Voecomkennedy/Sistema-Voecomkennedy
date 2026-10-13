const test=require('node:test'),assert=require('node:assert/strict');
const ready=import('../supabase/functions/_shared/atendimento/receiving.mjs');
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',instance='INSTANCE_SYNTHETIC',connectedPhone='5562999990999';
const capability='A'.repeat(43),base=`https://example.invalid/functions/v1/atendimento-recebimento/${capability}`;
const payload={instanceId:instance,connectedPhone,type:'ReceivedCallback',isGroup:false,isNewsletter:false,
  phone:'5562999990001',senderLid:'123456789@lid',messageId:'sample-1',fromMe:false,
  momment:Date.now()-1000,status:'RECEIVED',chatName:'Ana Exemplo',text:{message:'Olá'}};
const request=(body=payload,url=base)=>new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const config=(db,extra={})=>({enabled:true,capability,owner,instance,connectedPhone,db,allowedHosts:['media.example.invalid'],...extra});

test('capacidade e flag são exigidas antes de acessar o corpo, inclusive URL com query',async()=>{
  const {createRealWebhookIngress}=await ready;
  const unread={method:'POST',url:base.replace(capability,'B'.repeat(43)),headers:new Headers({'content-type':'application/json'}),get body(){throw Error('corpo lido');}};
  const db={rpc(){throw Error('não deveria gravar');}};
  assert.equal((await createRealWebhookIngress(config(db))(unread)).status,401);
  assert.equal((await createRealWebhookIngress(config(db,{enabled:false}))(unread)).status,503);
  assert.equal((await createRealWebhookIngress(config(db,{capability:''}))(unread)).status,503);
  assert.equal((await createRealWebhookIngress(config(db))({method:'POST',url:base+'?leak=1',headers:unread.headers,get body(){throw Error('corpo lido');}})).status,401);
});
test('texto privado é normalizado, dono vem do servidor, duplicata e falha não recebem ACK',async()=>{
  const {createRealWebhookIngress}=await ready;let calls=[];
  const db={rpc:async(name,args)=>{calls.push({name,args});return{data:{duplicate:calls.length>1},error:null};}};
  const handler=createRealWebhookIngress(config(db));
  const result=await handler(request({...payload,owner:'forjado'}));assert.equal(result.status,200);
  assert.equal((await result.json()).duplicate,false);
  assert.equal(calls[0].args.p_owner,owner);assert.equal(calls[0].args.p_phone,'5562999990001');
  assert.equal((await handler(request(payload))).status,200);assert.equal(calls.length,2);
  assert.equal((await handler(request({...payload,isGroup:true,phone:'123@g.us'}))).status,200);assert.equal(calls.length,2);
  assert.equal((await handler(request({...payload,fromMe:true}))).status,200);assert.equal(calls.length,2);
  assert.equal((await handler(request({...payload,instanceId:'OUTRA'}))).status,422);
  assert.equal((await createRealWebhookIngress(config({rpc:async()=>({error:{code:'08006'}})}))(request())).status,503);
  assert.equal((await handler(new Request(base,{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(200001)}))).status,413);
});
test('PDF é copiado para bucket privado antes do RPC; host, tamanho, hash e retry são verificados',async()=>{
  const {createRealWebhookIngress}=await ready;const bytes=new TextEncoder().encode('%PDF-fixture');
  let upload=0,rpc=0;const stored=new Map();
  const db={storage:{getBucket:async()=>({data:{id:'atendimento-arquivos',public:false}}),from:()=>({
    upload:async(path,data)=>{upload++;stored.set(path,data);return{error:null};},download:async path=>stored.has(path)?({error:null,data:new Blob([stored.get(path)])}):({error:{message:'missing'}})
  })},from:()=>({select:()=>({eq(){return this;},maybeSingle:async()=>({data:null,error:null})})}),rpc:async(_,args)=>{rpc++;assert.equal(args.p_arquivo.sha256.length,64);assert.equal(args.p_arquivo.size,bytes.length);return{data:{duplicate:false}};}};
  const doc={...payload,text:undefined,document:{mimeType:'application/pdf',fileName:'teste.pdf',documentUrl:'https://media.example.invalid/file'}};
  const fetcher=async()=>new Response(bytes,{headers:{'content-length':String(bytes.length)}});
  assert.equal((await createRealWebhookIngress(config(db,{fetcher}))(request(doc))).status,200);assert.equal(upload,1);assert.equal(rpc,1);
  assert.equal((await createRealWebhookIngress(config(db,{fetcher}))(request({...doc,messageId:'bad-host',document:{...doc.document,documentUrl:'https://127.0.0.1/x'}}))).status,422);assert.equal(rpc,1);
  assert.equal((await createRealWebhookIngress(config(db,{fetcher:async()=>new Response(bytes,{headers:{'content-length':'9999999'}})}))(request({...doc,messageId:'huge'}))).status,413);assert.equal(rpc,1);
  const failed={...db,storage:{...db.storage,from:()=>({upload:async()=>({error:{message:'fail'}}),download:async()=>({error:{message:'fail'}})})}};
  assert.equal((await createRealWebhookIngress(config(failed,{fetcher}))(request({...doc,messageId:'failed'}))).status,503);assert.equal(rpc,1);
});
test('backup e restauração copiam bytes privados e rejeitam arquivo ausente ou alterado',async()=>{
  const {exportReceivedMedia,restoreReceivedMedia}=await import('../supabase/functions/_shared/atendimento/received-media-backup.mjs');
  const bytes=new TextEncoder().encode('%PDF-fixture'),id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const path=`${owner}/recebidos/${id}.pdf`,rows=[{id,caminho:path,tamanho:bytes.length,sha256}];
  const source=new Map([[path,bytes]]),target=new Map();
  const pack=await exportReceivedMedia({owner,rows,get:p=>source.get(p)});
  assert.equal((await restoreReceivedMedia({pack,owner,rows,get:p=>target.get(p),put:(p,b)=>target.set(p,b)})).verified,true);
  assert.deepEqual(target.get(path),bytes);
  const bad=structuredClone(pack);bad.files[0].base64=btoa('%PDF-corrupt');
  await assert.rejects(restoreReceivedMedia({pack:bad,owner,rows,get:p=>target.get(p),put:()=>{throw Error('não gravar');}}));
  await assert.rejects(exportReceivedMedia({owner,rows,get:()=>null}));
});
test('página de leitura mostra só dados do proprietário e escapa texto recebido',async()=>{
  const {JSDOM}=require('../cotador/node_modules/jsdom');
  const fs=require('node:fs'),path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'../atendimento-recebidos.html'),'utf8');
  const dom=new JSDOM(html,{url:'https://example.invalid/atendimento-recebidos.html'});
  const module=await import('../js/atendimento-recebidos.mjs');
  global.document=dom.window.document;
  const cid='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const rows={atendimento_recepcao_conversas:[{id:cid,nome:'Ana Exemplo'}],
    atendimento_recepcao_identidades:[{conversa_id:cid,tipo:'telefone',valor:'5562999990001'}],
    atendimento_recepcao_mensagens:[{id:'m1',conversa_id:cid,texto:'<script>não executar</script>',tipo:'texto',ocorrido_em:'2026-10-13T09:00:00Z'}],
    atendimento_recepcao_arquivos:[]};
  const scopes=[];
  const client={from:table=>({select(){return this;},eq(key,value){scopes.push([table,key,value]);return this;},order(){return this;},then(resolve){resolve({data:rows[table],error:null});}}),auth:{onAuthStateChange(){}}};
  try{
    await module.startReceivedPage(client,{getUser:async()=>({id:owner})});
    assert.equal(dom.window.document.getElementById('rec-workspace').hidden,false);
    assert.match(dom.window.document.getElementById('rec-messages').textContent,/não executar/);
    assert.equal(dom.window.document.querySelector('#rec-messages script'),null);
    assert.equal(dom.window.document.querySelector('form'),null);
    assert.equal(scopes.length,4);assert.ok(scopes.every(([,key,value])=>key==='user_id'&&value===owner));
  }finally{delete global.document;dom.window.close();}
});
