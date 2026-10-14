const rows=v=>Array.isArray(v)?v:[];
export async function startConversationPage({client=globalThis.getSupabaseClient(),auth=globalThis.Auth,root=document,storage=globalThis.sessionStorage,schedule=(fn)=>setInterval(fn,5000),cancel=clearInterval}={}){
  const $=id=>root.getElementById(id),node=(tag,text,cls)=>{const el=root.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;};
  let closed=false,refreshing=false,busy=false,composing=false,selected='',timer,chats=[],identities=[],incoming=[],outgoing=[];
  const drafts=new Map(),owner=(await auth.getUser())?.id;
  if(!owner){$('chat-gate').textContent='Entre no sistema para abrir as conversas.';return;}
  const failure=e=>{$('chat-error').textContent=e.message;$('chat-error').hidden=false;};
  const stop=()=>{closed=true;cancel(timer);$('chat-workspace').hidden=true;$('chat-gate').hidden=false;$('chat-gate').textContent='Sessão encerrada. Entre novamente no sistema.';};
  const session=async()=>{if(closed||(await auth.getUser())?.id!==owner){stop();throw Error('Sessão alterada.');}};
  client.auth.onAuthStateChange((event,s)=>{if(event==='SIGNED_OUT'||(event==='SIGNED_IN'&&s?.user?.id!==owner))stop();});
  const key=id=>'atendimento:manual:'+owner+':'+id;
  const pending=id=>{try{const v=storage.getItem(key(id));return v?JSON.parse(v):null;}catch{throw Error('Não foi possível conferir o bloqueio contra repetição.');}};
  const all=async(table,columns,order)=>{const result=[];for(let start=0;;start+=500){let q=client.from(table).select(columns).eq('user_id',owner).range(start,start+499);for(const field of order)q=q.order(field,{ascending:true});const r=await q;if(r.error)throw Error('Atualização indisponível. As últimas mensagens continuam na tela.');const batch=rows(r.data);result.push(...batch);if(batch.length<500)return result;}};
  const phone=id=>{const matches=identities.filter(x=>x.conversa_id===id&&x.tipo==='telefone');return matches.length===1&&/^55\d{10,11}$/.test(matches[0].valor)?matches[0].valor:null;};
  const unresolved=id=>outgoing.some(x=>x.conversa_id===id&&x.estado!=='aceito')||!!pending(id);
  function controls(){$('chat-text').disabled=busy||closed;root.querySelectorAll('[data-chat-id]').forEach(button=>{button.disabled=busy||closed;});try{$('chat-send').disabled=busy||closed||!phone(selected)||unresolved(selected)||!$('chat-text').value.trim();}catch(e){$('chat-send').disabled=true;failure(e);}}
  const state=x=>x.estado==='aceito'?'Aceita pela Z-API · entrega não confirmada':x.estado==='incerto'?'Resultado incerto · não repetir':'Aguardando confirmação · não repetir';
  function render(){
    const term=$('chat-search').value.trim().toLocaleLowerCase('pt-BR'),list=$('chat-list');list.replaceChildren();
    for(const c of chats){const ms=incoming.filter(x=>x.conversa_id===c.id),ss=outgoing.filter(x=>x.conversa_id===c.id),p=phone(c.id)||'Telefone não confirmado';if(term&&![c.nome,p,...ms.map(x=>x.texto),...ss.map(x=>x.texto)].some(x=>String(x||'').toLocaleLowerCase('pt-BR').includes(term)))continue;
      const button=node('button','',`chat-button${c.id===selected?' selected':''}`);button.type='button';button.dataset.chatId=c.id;button.append(node('strong',c.nome||'Contato'),node('small',p));button.disabled=busy;button.addEventListener('click',()=>{if(busy)return;selected=c.id;$('chat-text').value=drafts.get(selected)||'';$('chat-result').textContent='';render();});list.append(button);
    }
    if(!list.children.length)list.append(node('p','Nenhuma conversa para esta busca.'));
    const c=chats.find(x=>x.id===selected),p=phone(selected);$('chat-title').textContent=c?.nome||'Selecione uma conversa';$('chat-phone').textContent=p?'Destinatário: +'+p:'Telefone não confirmado. Envio bloqueado.';$('chat-compose').hidden=!c;
    const timeline=$('chat-messages'),oldScroll=timeline.scrollTop,nearEnd=timeline.scrollHeight-timeline.clientHeight-oldScroll<50;timeline.replaceChildren();
    const messages=[...incoming.filter(x=>x.conversa_id===selected).map(x=>({...x,direction:'in',at:x.ocorrido_em})),...outgoing.filter(x=>x.conversa_id===selected).map(x=>({...x,direction:'out',at:x.criado_em}))].sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
    for(const m of messages){const article=node('article','','message '+m.direction);article.append(node('p',m.texto),node('small',new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(m.at))+' · '+(m.direction==='in'?'Recebida':state(m))));timeline.append(article);}
    timeline.scrollTop=nearEnd?timeline.scrollHeight:oldScroll;
    try{if(unresolved(selected))$('chat-result').textContent='Há uma tentativa sem confirmação nesta conversa. Não repita; confira o resultado antes de enviar novamente.';}catch(e){failure(e);}
    controls();
  }
  async function refresh(){
    if(closed||refreshing||root.hidden)return;refreshing=true;
    try{await session();const snapshot=await Promise.all([all('atendimento_recepcao_conversas','id,instancia,nome',['id']),all('atendimento_recepcao_identidades','conversa_id,tipo,valor',['conversa_id','tipo','valor']),all('atendimento_recepcao_mensagens','id,conversa_id,texto,ocorrido_em',['ocorrido_em','id']),all('atendimento_recepcao_saidas','id,conversa_id,requisicao_id,texto,estado,criado_em',['criado_em','id'])]);await session();[chats,identities,incoming,outgoing]=snapshot;
      for(const row of outgoing)if(row.estado==='aceito'&&pending(row.conversa_id)?.requestId===row.requisicao_id){storage.removeItem(key(row.conversa_id));drafts.delete(row.conversa_id);if(selected===row.conversa_id)$('chat-text').value='';}
      if(!chats.some(x=>x.id===selected)){selected=chats[0]?.id||'';$('chat-text').value=drafts.get(selected)||'';}
      render();$('chat-sync').textContent='Mensagens atualizadas às '+new Intl.DateTimeFormat('pt-BR',{timeStyle:'medium',timeZone:'America/Sao_Paulo'}).format(new Date());$('chat-gate').hidden=true;$('chat-workspace').hidden=false;
    }catch(e){if(!closed){$('chat-sync').textContent='Sem atualização recente. Últimas mensagens preservadas.';failure(e);}}finally{refreshing=false;}
  }
  $('chat-search').addEventListener('input',render);
  $('chat-text').addEventListener('input',()=>{drafts.set(selected,$('chat-text').value);controls();});let composedAt=0;
  $('chat-text').addEventListener('compositionstart',()=>{composing=true;});
  $('chat-text').addEventListener('compositionend',()=>{composing=false;composedAt=Date.now();});
  $('chat-text').addEventListener('keydown',event=>{
    if(event.key!=='Enter'||event.shiftKey||event.ctrlKey||event.altKey||event.metaKey)return;
    if(event.isComposing||composing||event.keyCode===229||Date.now()-composedAt<100)return;
    event.preventDefault();if(event.repeat)return;controls();
    if(!$('chat-send').disabled)$('chat-compose').requestSubmit($('chat-send'));
  });
  $('chat-compose').addEventListener('submit',async event=>{
    event.preventDefault();if(busy||closed)return;
    const chatId=selected,text=$('chat-text').value.trim(),expectedPhone=phone(chatId);if(!expectedPhone||!text)return;
    busy=true;controls();$('chat-error').hidden=true;
    let requestId;
    try{await session();if(selected!==chatId||$('chat-text').value.trim()!==text)throw Error('Conversa ou texto mudou antes do envio. Confira o destinatário e envie novamente.');if(unresolved(chatId))throw Error('Tentativa pendente. Não repetir.');requestId=crypto.randomUUID();storage.setItem(key(chatId),JSON.stringify({requestId,text}));$('chat-result').textContent='Solicitando envio manual…';
      const response=await client.functions.invoke('atendimento-envio-manual',{method:'POST',body:{chatId,text,expectedPhone,requestId}});
      await session();
      if(response.error){let detail;try{detail=await response.error.context?.json();}catch{/* Resultado incerto. */}const status=response.error.context?.status;
        const safe=[400,401,403,405,409].includes(status)||(status===503&&['Envio manual desligado ou configuração incompleta.','Reserva recusada; nenhum envio iniciado.','Reserva não confirmada; nenhum envio iniciado.'].includes(detail?.erro));
        if(safe){storage.removeItem(key(chatId));throw Error(detail?.erro||'Solicitação recusada; nenhum novo envio iniciado.');}
        throw Error('Resposta não confirmada. A mensagem pode ter sido enviada; não repita.');
      }
      const m=response.data?.message;
      if(m?.requisicao_id!==requestId||m.conversa_id!==chatId)throw Error('Resposta não confirmada. Não repetir.');
      if(m.estado==='aceito'){storage.removeItem(key(chatId));drafts.delete(chatId);if(selected===chatId){$('chat-text').value='';$('chat-result').textContent='Z-API aceitou a mensagem. A entrega ainda não foi confirmada.';}}
      else throw Error('Resultado incerto ou reservado. Não repita.');
      await refresh();
    }catch(e){failure(e);if(selected===chatId)$('chat-result').textContent=e.message;}finally{busy=false;controls();}
  });
  await refresh();if(!closed)timer=schedule(refresh);root.addEventListener('visibilitychange',()=>{if(!root.hidden)void refresh();});
  return{refresh,stop};
}
if(typeof document!=='undefined'&&typeof globalThis.getSupabaseClient==='function')startConversationPage().catch(e=>{document.getElementById('chat-gate').textContent=e.message;});
