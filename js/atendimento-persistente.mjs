// Interface local para PostgreSQL descartável. Auth é simulado por loopback e marcado na tela.
import { createAtendimentoHttpClient } from './atendimento-http-client.mjs';
import { DEMO_SOURCE,demoPdf } from './atendimento-demo.mjs';
export function mountAtendimentoPersistente({root=document,api=createAtendimentoHttpClient()}={}){
    const $=id=>root.getElementById(id),node=(tag,value,cls)=>{const x=root.createElement(tag);if(value!==undefined)x.textContent=value;if(cls)x.className=cls;return x;};
    const drafts=new Map(),attachments=new Map();let selected='',chats=[],sequence=0,busy=false;
    const status=value=>{$('at-status').textContent=value;};
    const date=at=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(at));
    const download=(bytes,mime,name)=>{const url=URL.createObjectURL(new Blob([bytes],{type:mime})),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    const guard=fn=>async event=>{event?.preventDefault();if(busy)return;busy=true;root.querySelectorAll('button').forEach(b=>b.disabled=true);$('at-error').hidden=true;
        try{await fn(event);}catch(error){$('at-error').textContent=error.message;$('at-error').hidden=false;}finally{busy=false;root.querySelectorAll('button').forEach(b=>b.disabled=false);}};
    const options=(id,rows,value)=>{const el=$(id);el.replaceChildren(node('option','Sem vínculo'));el.firstChild.value='';for(const row of rows){const x=node('option',row.nome||`${row.id} · ${row.origem||''} → ${row.destino||''}`);x.value=String(row.id);el.append(x);}el.value=value||'';};
    const active=()=>chats.find(c=>c.id===selected);
    const related=()=>{const client=$('at-client').value,c=active();options('at-quote',DEMO_SOURCE.emissao_cotacoes.filter(x=>x.clienteId===client),c?.cotacaoId);options('at-sale',DEMO_SOURCE.emissao_vendas.filter(x=>x.clienteId===client),c?.vendaId);};
    async function detail(){const c=active();if(!c){$('at-messages').replaceChildren();return;}
        $('at-title').textContent=c.context.cliente?.nome||c.nome;$('at-phone').textContent=c.phone?'+'+c.phone:'LID sem telefone comprovado';
        $('at-text').value=drafts.get(selected)||'';$('at-attachment').textContent=attachments.has(selected)?`PDF: ${attachments.get(selected).name} · arquivado no teste local`:'Nenhum PDF anexado.';
        const timeline=$('at-messages');timeline.replaceChildren();
        for(const m of await api.messages(selected)){
            const article=node('article',undefined,'message '+(m.direction==='saida'?'out':'in'));
            const state=m.direction==='entrada'?'Recebida (sintética)':({simulada:'Sucesso simulado',falha_segura:'Falha segura',incerto:'Resultado incerto',tentativa:'Tentativa pendente',pendente:'Pendente'}[m.result]||'Própria (sintética)');
            article.append(node('p',m.text),node('small',`${date(m.at)} · ${state}`));
            if(m.attachmentId){const button=node('button','Baixar PDF');button.type='button';button.addEventListener('click',guard(async()=>{const file=await api.file(m.attachmentId);download(new Uint8Array(file.bytes),file.mime,file.name);}));article.append(button);}
            if(m.result==='falha_segura'&&m.attempt<3&&new Date(m.availableAt)<=new Date()){const retry=node('button','Repetir simulação');retry.type='button';retry.dataset.retry=m.id;retry.addEventListener('click',guard(async()=>{const r=await api.dispatch('success');if(!r)throw new Error('Retry ainda em espera pelo intervalo seguro.');await render();status('Retry sintético concluído.');}));article.append(retry);}
            if(m.result==='falha_segura'&&m.attempt<3&&new Date(m.availableAt)>new Date())article.append(node('p','Retry seguro disponível após o intervalo de espera; use Atualizar.','help'));
            if(m.result==='incerto')article.append(node('p','Repetição bloqueada: revisar o resultado antes de qualquer envio.','help'));
            timeline.append(article);
        }
        const context=$('at-context');context.replaceChildren(node('strong',c.context.cliente?.nome||'Cliente ainda sem vínculo'),node('p','Origem: '+c.context.origemContato));
        const tags=node('div',undefined,'tags');for(const t of c.etiquetas)tags.append(node('span',t,'tag'));context.append(tags);
        for(const q of c.context.cotacoes)context.append(node('div',`${q.id} · Cotação ${q.origem} → ${q.destino}${c.cotacaoId===q.id?' · vinculada':''}`,'record'));
        for(const s of c.context.vendas)context.append(node('div',`${s.id} · Venda ${s.origem} → ${s.destino}${s.vinculada?' · vinculada':''} · Recebido líquido: ${s.recebidoLiquido===null?'Não informado':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(s.recebidoLiquido)}`,'record'));
        options('at-client',DEMO_SOURCE.emissao_pessoas,c.clienteId);related();$('at-origin').value=c.origemContato;$('at-tags').value=c.etiquetas.join(', ');
    }
    async function render(){const mine=++sequence,all=await api.list();if(mine!==sequence)return;chats=all;if(!selected||!all.some(c=>c.id===selected))selected=all[0]?.id||'';
        const labels=[...new Set(all.flatMap(c=>c.etiquetas))],old=$('at-label').value;$('at-label').replaceChildren(node('option','Todas'));$('at-label').firstChild.value='';for(const t of labels){const x=node('option',t);x.value=t;$('at-label').append(x);}$('at-label').value=labels.includes(old)?old:'';
        const filtered=await api.list({search:$('at-search').value,unread:$('at-unread').checked,label:$('at-label').value});if(mine!==sequence)return;
        const list=$('at-chats');list.replaceChildren();for(const c of filtered){const b=node('button',undefined,'chat-button'+(c.id===selected?' selected':''));b.type='button';b.dataset.chatId=c.id;b.setAttribute('aria-pressed',String(c.id===selected));const title=node('strong',c.context.cliente?.nome||c.nome);if(c.unread)title.append(node('span',String(c.unread),'count'));b.append(title,node('small',c.last?.text?.slice(0,85)||'Sem mensagens'),node('small',c.etiquetas.join(' · ')));b.addEventListener('click',guard(async()=>{selected=c.id;await render();}));list.append(b);}if(!filtered.length)list.append(node('p','Nenhuma conversa para estes filtros.','help'));await detail();}
    $('at-search').addEventListener('input',()=>render().catch(error=>{$('at-error').textContent=error.message;$('at-error').hidden=false;}));
    $('at-unread').addEventListener('change',()=>render());$('at-label').addEventListener('change',()=>render());$('at-client').addEventListener('change',related);
    $('at-text').addEventListener('input',()=>drafts.set(selected,$('at-text').value));
    $('at-read').addEventListener('click',guard(async()=>{await api.read(selected);await render();status('Leitura gravada no PostgreSQL descartável.');}));
    $('at-receive').addEventListener('click',guard(async()=>{const c=active();if(!c?.phone)throw new Error('Contato sem telefone confirmado.');await api.ingest({type:'message',instance:'mock',messageId:crypto.randomUUID(),phone:'+'+c.phone,fromMe:false,text:'Nova resposta fictícia para teste local.',at:new Date().toISOString(),status:'entregue'});await render();status('Entrada fictícia gravada.');}));
    $('at-link').addEventListener('submit',guard(async()=>{await api.link(selected,{clienteId:$('at-client').value||null,cotacaoId:$('at-quote').value||null,vendaId:$('at-sale').value||null,origemContato:$('at-origin').value,etiquetas:$('at-tags').value.split(',').map(x=>x.trim()).filter(Boolean)});await render();status('Vínculo fictício gravado no teste local.');}));
    async function attach(name,bytes){const cid=selected,file=await api.archive(cid,name,new Uint8Array(bytes),crypto.randomUUID());attachments.set(cid,file);if(selected===cid)await detail();status('PDF fictício arquivado com checksum no teste local.');}
    $('at-sample-pdf').addEventListener('click',guard(()=>attach('proposta-exemplo.pdf',demoPdf())));
    $('at-pdf').addEventListener('change',guard(async e=>{const file=e.target.files[0];if(file)await attach(file.name,await file.arrayBuffer());e.target.value='';}));
    $('at-compose').addEventListener('submit',guard(async()=>{const cid=selected;const composed=await api.compose(cid,$('at-text').value,attachments.get(cid)?.id||null,crypto.randomUUID());const sent=await api.dispatch($('at-outcome').value);if(!sent)throw new Error('Envio sintético ainda em espera.');drafts.delete(cid);attachments.delete(cid);$('at-pdf').value='';await render();status(sent.messageId===composed.id?'Tentativa registrada no PostgreSQL local; nenhum WhatsApp usado.':'Mensagem na fila; outro item pendente anterior foi simulado.');}));
    $('at-export').addEventListener('click',guard(async()=>{download(JSON.stringify(await api.export(),null,2),'application/json','atendimento-local-sintetico.json');status('Pacote local com mensagens e bytes exportado.');}));
    $('at-import').addEventListener('change',guard(async e=>{const file=e.target.files[0];if(!file)return;if(file.size>20*1024*1024)throw new Error('Pacote excede 20 MB.');await api.restore(JSON.parse(await file.text()));selected='';drafts.clear();attachments.clear();e.target.value='';await render();status('Pacote restaurado no destino vazio.');}));
    $('at-workspace').hidden=false;$('at-gate').hidden=true;
    root.querySelectorAll('nav a').forEach(a=>{a.removeAttribute('href');a.title='Navegação operacional indisponível na demo local.';});
    root.querySelector('.context > .help').textContent='Vínculos e valor recebido são apenas exemplos sintéticos locais. A origem não é inferida; a integração comercial real exige Auth e o resumo financeiro do sistema.';
    const notice=$('at-workspace').querySelector('.notice');notice.textContent='Demonstração persistente local com dados fictícios e Auth simulado por loopback. PostgreSQL e PDFs vivem apenas no cluster descartável; nenhum WhatsApp ou Supabase remoto.';
    $('at-workspace').querySelector('.archive p').textContent='Exporta mensagens e bytes dos PDFs do banco local. Restauração requer destino vazio do mesmo proprietário sintético.';
    const refresh=node('button','Atualizar');refresh.type='button';refresh.addEventListener('click',guard(render));$('at-receive').after(refresh);
    return render().then(()=>{status('Conversas fictícias gravadas no PostgreSQL local; autenticação simulada.');return {render,api};});
}
