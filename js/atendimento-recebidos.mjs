const $=id=>document.getElementById(id);
const item=(tag,text,className)=>{const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;};
const time=value=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value));
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const asRows=value=>Array.isArray(value)?value:[];
const sameId=(a,b)=>String(a)===String(b);
const validLink=(rows,id)=>!id||rows.some(row=>sameId(row.id,id));
const options=(id,rows,label,value)=>{const el=$(id);el.replaceChildren(item('option','Sem vínculo'));el.firstChild.value='';
  for(const row of rows){const option=item('option',label(row));option.value=String(row.id);el.append(option);}
  if(value&&!validLink(rows,value)){const missing=item('option',`${value} · não encontrado nos dados comerciais atuais`);missing.value=String(value);el.append(missing);}
  el.value=value?String(value):'';
};
const dateInput=value=>{if(!value)return '';const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
  const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);return local.toISOString().slice(0,16);
};

export async function startReceivedPage(client=getSupabaseClient(),auth=Auth){
  const gate=$('rec-gate'),error=$('rec-error'),workspace=$('rec-workspace');
  const user=await auth.getUser();if(!user){gate.textContent='Entre no sistema para consultar mensagens recebidas.';return;}
  const read=async query=>{const result=await query;if(result.error)throw new Error('Não foi possível consultar as mensagens.');return result.data||[];};
  let closed=false,selected='',detailed='',busy=false;
  client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||(event==='SIGNED_IN'&&session?.user?.id!==user.id)){
    closed=true;workspace.hidden=true;gate.hidden=false;gate.textContent='Sessão encerrada. Entre novamente no sistema.';
  }});
  const assertSession=async()=>{if(closed||(await auth.getUser())?.id!==user.id)throw new Error('Sessão encerrada. Entre novamente no sistema.');};
  const all=async(table,columns,order)=>{const rows=[];for(let start=0;;start+=500){
    let query=client.from(table).select(columns).eq('user_id',user.id).range(start,start+499);
    for(const key of order)query=query.order(key,{ascending:true});
    const batch=await read(query);rows.push(...batch);if(batch.length<500)return rows;
  }};
  const chats=await all('atendimento_recepcao_conversas','id,instancia,nome,criado_em',['id']);
  const ids=await all('atendimento_recepcao_identidades','conversa_id,tipo,valor',['conversa_id','tipo','valor']);
  const messages=await all('atendimento_recepcao_mensagens','id,conversa_id,texto,tipo,nome_arquivo,ocorrido_em,lida_em',['ocorrido_em','id']);
  const files=await all('atendimento_recepcao_arquivos','id,mensagem_id,nome,caminho,tamanho,sha256',['id']);
  const managementRows=await all('atendimento_recepcao_gestao','user_id,instancia,conversa_id,etapa,etapa_em,nao_contatar,etiquetas,origem,anotacao,proxima_acao,proxima_em,cliente_id,cotacao_id,venda_id,visto_ate,atualizado_em',['conversa_id']);
  const managed=new Map(managementRows.map(row=>[row.conversa_id,row]));
  const commercial=await client.from('dados_app').select('conteudo').eq('user_id',user.id).maybeSingle();
  if(commercial.error)throw new Error('Não foi possível consultar clientes, cotações e vendas.');
  const business=commercial.data?.conteudo||{};
  const people=asRows(business.emissao_pessoas),quotes=asRows(business.emissao_cotacoes),sales=asRows(business.emissao_vendas);
  await assertSession();selected=chats[0]?.id||'';
  const chat=()=>chats.find(x=>x.id===selected),meta=id=>managed.get(id)||{};
  const unread=id=>messages.filter(m=>m.conversa_id===id&&(!meta(id).visto_ate||m.ocorrido_em>meta(id).visto_ate)).length;
  const failure=e=>{error.textContent=e.message;error.hidden=false;};
  async function download(file){
    await assertSession();const result=await client.storage.from('atendimento-arquivos').download(file.caminho);
    if(result.error||!result.data)throw new Error('PDF indisponível.');
    if(result.data.size>5242880)throw new Error('PDF excede o limite permitido.');
    const bytes=new Uint8Array(await result.data.arrayBuffer());
    if(bytes.length!==Number(file.tamanho)||await sha(bytes)!==file.sha256)throw new Error('PDF não passou na conferência de integridade.');
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
    const link=item('a','');link.href=url;link.download=file.nome;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function related(value,quoteValue='',saleValue=''){
    const q=quotes.filter(x=>value&&sameId(x.clienteId,value));
    const s=sales.filter(x=>value&&sameId(x.clienteId,value)&&!x.excluidaEm);
    options('rec-quote',q,x=>`${x.id} · ${x.origem||''} → ${x.destino||''}`,quoteValue);
    options('rec-sale',s,x=>`${x.id} · ${x.origem||''} → ${x.destino||''}`,saleValue);
  }
  function detail(){
    const c=chat(),context=$('rec-context');context.hidden=!c;
    if(!c)return;
    const m=meta(c.id);$('rec-stage').value=m.etapa||'novo';$('rec-optout').checked=m.nao_contatar===true;$('rec-tags').value=asRows(m.etiquetas).join(', ');
    $('rec-origin').value=m.origem||'';$('rec-note').value=m.anotacao||'';$('rec-next-action').value=m.proxima_acao||'';
    $('rec-next-due').value=dateInput(m.proxima_em);
    options('rec-client',people,x=>`${x.nome||'Pessoa'} · ${x.id}`,m.cliente_id);
    related($('rec-client').value,m.cotacao_id,m.venda_id);
    const replied=m.etapa==='aguardando'&&m.etapa_em&&messages.some(x=>x.conversa_id===c.id&&x.ocorrido_em>=m.etapa_em);
    $('rec-feedback').textContent=replied?'O cliente respondeu após entrar em aguardando. Nenhum follow-up deve ser enviado; revise a etapa.':'Vínculos manuais; nenhum valor recebido é atribuído por inferência.';
  }
  function render(){
    const stage=$('rec-stage-filter').value,tag=$('rec-tag-filter').value,term=$('rec-search').value.trim().toLocaleLowerCase('pt-BR');
    const labels=[...new Set([...managed.values()].flatMap(m=>asRows(m.etiquetas)))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const tagFilter=$('rec-tag-filter');tagFilter.replaceChildren(item('option','Todas'));tagFilter.firstChild.value='';
    for(const label of labels){const option=item('option',label);option.value=label;tagFilter.append(option);}tagFilter.value=labels.includes(tag)?tag:'';
    const counts={novo:0,cotacao:0,aguardando:0,sem_resposta:0,emissao:0,encerrado:0};let due=0;
    for(const c of chats){const m=meta(c.id);counts[m.etapa||'novo']++;if(m.proxima_em&&m.proxima_acao&&new Date(m.proxima_em)<=new Date())due++;}
    $('rec-summary').textContent=`${chats.length} conversa(s) · ${counts.cotacao} em cotação · ${counts.aguardando} aguardando · ${counts.sem_resposta} sem resposta · ${counts.emissao} em emissão · ${due} ação(ões) para revisar`;
    const list=$('rec-chats');list.replaceChildren();
    for(const c of chats){
      const m=meta(c.id),phone=ids.find(x=>x.conversa_id===c.id&&x.tipo==='telefone')?.valor||'';
      const ms=messages.filter(x=>x.conversa_id===c.id),unreadCount=unread(c.id);
      if(stage&&(m.etapa||'novo')!==stage||tag&&!asRows(m.etiquetas).includes(tag)||$('rec-unread-filter').checked&&!unreadCount)continue;
      if(term&&![c.nome,phone,m.origem,m.anotacao,...ms.map(x=>x.texto)].some(x=>String(x||'').toLocaleLowerCase('pt-BR').includes(term)))continue;
      const button=item('button','',`chat-button${c.id===selected?' selected':''}`);button.type='button';button.setAttribute('aria-pressed',String(c.id===selected));
      button.append(item('strong',c.nome||'Contato'));
      if(unreadCount)button.firstChild.append(item('span',String(unreadCount),'count'));
      button.append(item('small',`+${phone} · ${m.etapa||'novo'} · ${asRows(m.etiquetas).join(', ')}`));
      button.addEventListener('click',()=>{selected=c.id;render();});list.append(button);
    }
    if(!list.children.length)list.append(item('p','Nenhuma conversa para estes filtros.','help'));
    const c=chat();$('rec-title').textContent=c?.nome||'Selecione uma conversa';
    $('rec-identity').textContent=ids.filter(x=>x.conversa_id===selected).map(x=>x.tipo==='telefone'?'+'+x.valor:x.valor).join(' · ');
    const timeline=$('rec-messages');timeline.replaceChildren();
    for(const m of messages.filter(x=>x.conversa_id===selected)){
      const entry=item('article','','message in');entry.append(item('p',m.texto),item('small',time(m.ocorrido_em)+' · recebida'));
      const file=files.find(x=>x.mensagem_id===m.id);
      if(file){const button=item('button','Baixar PDF: '+file.nome);button.type='button';button.addEventListener('click',()=>download(file).catch(failure));entry.append(button);}
      timeline.append(entry);
    }
    if(detailed!==selected){detail();detailed=selected;}
  }
  const save=async payload=>{await assertSession();const result=await client.from('atendimento_recepcao_gestao').upsert(payload,{onConflict:'user_id,instancia,conversa_id'});
    if(result.error)throw new Error('Não foi possível salvar a organização.');managed.set(payload.conversa_id,payload);render();};
  $('rec-manage').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||!chat())return;busy=true;error.hidden=true;
    try{
      const c=chat(),clientId=$('rec-client').value,quoteId=$('rec-quote').value,saleId=$('rec-sale').value;
      const tags=[...new Set($('rec-tags').value.split(',').map(x=>x.trim()).filter(Boolean))];
      if(tags.length>8||tags.some(x=>x.length>40))throw new Error('Use até 8 etiquetas de no máximo 40 caracteres.');
      if(!validLink(people,clientId)||!validLink(quotes.filter(x=>sameId(x.clienteId,clientId)),quoteId)||
         !validLink(sales.filter(x=>sameId(x.clienteId,clientId)&&!x.excluidaEm),saleId))throw new Error('Vínculo comercial não encontrado para este cliente. Recarregue a página e escolha outro.');
      const due=$('rec-next-due').value;if(due&&(!Number.isFinite(new Date(due).getTime())||!$('rec-next-action').value.trim()))throw new Error('Informe a próxima ação para marcar uma data.');
      const payload={user_id:user.id,instancia:c.instancia,conversa_id:c.id,etapa:$('rec-stage').value,etapa_em:meta(c.id).etapa===$('rec-stage').value?(meta(c.id).etapa_em||new Date().toISOString()):new Date().toISOString(),nao_contatar:$('rec-optout').checked,
        etiquetas:tags,origem:$('rec-origin').value.trim(),anotacao:$('rec-note').value.trim(),
        proxima_acao:$('rec-next-action').value.trim(),proxima_em:due?new Date(due).toISOString():null,
        cliente_id:clientId||null,cotacao_id:quoteId||null,venda_id:saleId||null,
        visto_ate:meta(c.id).visto_ate||null,atualizado_em:new Date().toISOString()};
      await save(payload);$('rec-feedback').textContent='Organização salva na sua conta.';
    }catch(e){failure(e);}finally{busy=false;}
  });
  $('rec-mark-read').addEventListener('click',async()=>{
    if(busy||!chat())return;busy=true;error.hidden=true;
    try{const c=chat(),latest=messages.filter(x=>x.conversa_id===c.id).at(-1)?.ocorrido_em;
      if(!latest)return;
      await save({user_id:user.id,instancia:c.instancia,conversa_id:c.id,etapa:'novo',etapa_em:new Date().toISOString(),nao_contatar:false,etiquetas:[],origem:'',anotacao:'',proxima_acao:'',proxima_em:null,
        cliente_id:null,cotacao_id:null,venda_id:null,...meta(c.id),visto_ate:latest,atualizado_em:new Date().toISOString()});
      $('rec-feedback').textContent='Conversa marcada como lida.';
    }catch(e){failure(e);}finally{busy=false;}
  });
  $('rec-client').addEventListener('change',()=>related($('rec-client').value));
  for(const id of ['rec-search','rec-stage-filter','rec-tag-filter','rec-unread-filter'])$(id).addEventListener(id==='rec-search'?'input':'change',render);
  render();gate.hidden=true;workspace.hidden=false;
}
if(typeof document!=='undefined')startReceivedPage().catch(e=>{$('rec-error').textContent=e.message;$('rec-error').hidden=false;$('rec-gate').textContent='Área indisponível.';});
