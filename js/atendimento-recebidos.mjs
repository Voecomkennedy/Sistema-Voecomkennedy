const $=id=>document.getElementById(id),item=(tag,text,className)=>{const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;};
const time=value=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value));
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');

export async function startReceivedPage(client=getSupabaseClient(),auth=Auth){
  const gate=$('rec-gate'),error=$('rec-error'),workspace=$('rec-workspace');
  const user=await auth.getUser();if(!user){gate.textContent='Entre no sistema para consultar mensagens recebidas.';return;}
  const read=async query=>{const result=await query;if(result.error)throw new Error('Não foi possível consultar as mensagens.');return result.data||[];};
  let closed=false;
  client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||(event==='SIGNED_IN'&&session?.user?.id!==user.id)){closed=true;workspace.hidden=true;gate.hidden=false;gate.textContent='Sessão encerrada. Entre novamente no sistema.';}});
  const all=async(table,columns,order)=>{const rows=[];for(let start=0;;start+=500){
    let query=client.from(table).select(columns).eq('user_id',user.id).range(start,start+499);
    for(const key of order)query=query.order(key,{ascending:true});
    const batch=await read(query);rows.push(...batch);if(batch.length<500)return rows;
  }};
  const chats=await all('atendimento_recepcao_conversas','id,nome,criado_em',['id']);
  const ids=await all('atendimento_recepcao_identidades','conversa_id,tipo,valor',['conversa_id','tipo','valor']);
  const messages=await all('atendimento_recepcao_mensagens','id,conversa_id,texto,tipo,nome_arquivo,ocorrido_em,lida_em',['ocorrido_em','id']);
  const files=await all('atendimento_recepcao_arquivos','id,mensagem_id,nome,caminho,tamanho,sha256',['id']);
  if(closed||(await auth.getUser())?.id!==user.id)throw new Error('Sessão encerrada. Entre novamente no sistema.');
  let selected=chats[0]?.id||'';
  async function download(file){
    const result=await client.storage.from('atendimento-arquivos').download(file.caminho);
    if(result.error||!result.data)throw new Error('PDF indisponível.');
    if(result.data.size>5242880)throw new Error('PDF excede o limite permitido.');
    const bytes=new Uint8Array(await result.data.arrayBuffer());
    if(bytes.length!==Number(file.tamanho)||await sha(bytes)!==file.sha256)throw new Error('PDF não passou na conferência de integridade.');
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
    const link=item('a','');link.href=url;link.download=file.nome;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function render(){
    const term=$('rec-search').value.trim().toLocaleLowerCase('pt-BR');
    const list=$('rec-chats');list.replaceChildren();
    for(const c of chats){
      const phone=ids.find(x=>x.conversa_id===c.id&&x.tipo==='telefone')?.valor||'';
      const ms=messages.filter(x=>x.conversa_id===c.id);
      if(term&&![c.nome,phone,...ms.map(x=>x.texto)].some(x=>x.toLocaleLowerCase('pt-BR').includes(term)))continue;
      const button=item('button',`${c.nome||'Contato'} · ${phone} · ${ms.length} mensagem(ns)`,'chat-button');button.type='button';
      button.addEventListener('click',()=>{selected=c.id;render();});list.append(button);
    }
    if(!list.children.length)list.append(item('p','Nenhuma conversa recebida.','help'));
    const c=chats.find(x=>x.id===selected);$('rec-title').textContent=c?.nome||'Selecione uma conversa';
    $('rec-identity').textContent=ids.filter(x=>x.conversa_id===selected).map(x=>x.tipo==='telefone'?'+'+x.valor:x.valor).join(' · ');
    const timeline=$('rec-messages');timeline.replaceChildren();
    for(const m of messages.filter(x=>x.conversa_id===selected)){
      const entry=item('article','','message in');entry.append(item('p',m.texto),item('small',time(m.ocorrido_em)+' · recebida'));
      const file=files.find(x=>x.mensagem_id===m.id);
      if(file){const button=item('button','Baixar PDF: '+file.nome);button.type='button';button.addEventListener('click',()=>download(file).catch(e=>{error.textContent=e.message;error.hidden=false;}));entry.append(button);}
      timeline.append(entry);
    }
  }
  $('rec-search').addEventListener('input',render);render();gate.hidden=true;workspace.hidden=false;
}
if(typeof document!=='undefined')startReceivedPage().catch(e=>{$('rec-error').textContent=e.message;$('rec-error').hidden=false;$('rec-gate').textContent='Área indisponível.';});
