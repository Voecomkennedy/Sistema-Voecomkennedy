import { demoAllowed } from './atendimento-domain.mjs';
import { createDemo, DEMO_OWNER, DEMO_SOURCE, demoPdf } from './atendimento-demo.mjs';
import { mockTransport } from './atendimento-adapters.mjs';
export function mountAtendimentoPage({ service, root = document, owner = DEMO_OWNER }) {
    const $ = id => root.getElementById(id), node = (tag, text, className) => {
        const el = root.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el;
    };
    const drafts = new Map(), attachments = new Map();
    let selected = '', busy = false;
    const status = text => { $('at-status').textContent = text; };
    const listen = (id, event, fn) => $(id).addEventListener(event, fn);
    const guard = fn => async event => {
        event?.preventDefault(); if (busy) return;
        busy = true; root.querySelectorAll('button').forEach(b => b.disabled = true);
        $('at-error').hidden = true;
        try { await fn(event); } catch(error) { $('at-error').textContent = error.message; $('at-error').hidden = false; }
        finally { busy = false; root.querySelectorAll('button').forEach(b => b.disabled = false); }
    };
    const chat = () => service.list(owner).find(c => c.id === selected);
    const date = at => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(at));
    const money = value => value === null ? 'Não informado' : new Intl.NumberFormat('pt-BR',{ style:'currency', currency:'BRL' }).format(value);
    const download = (bytes, mime, name) => {
        const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
        const a = node('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    function options(id, rows, value) {
        const select = $(id); select.replaceChildren(node('option','Sem vínculo')); select.firstChild.value = '';
        rows.forEach(row => { const option = node('option', row.nome || `${row.id} · ${row.origem || ''} → ${row.destino || ''}`); option.value = String(row.id); select.append(option); }); select.value = value || '';
    }
    function related() {
        const client = $('at-client').value;
        options('at-quote', DEMO_SOURCE.emissao_cotacoes.filter(q => q.clienteId === client), chat()?.cotacaoId);
        options('at-sale', DEMO_SOURCE.emissao_vendas.filter(s => s.clienteId === client), chat()?.vendaId);
    }
    function renderDetail() {
        const c = chat(); if (!c) return;
        $('at-title').textContent = c.context.cliente?.nome || c.nome;
        $('at-phone').textContent = c.phone ? '+' + c.phone : 'LID sem telefone comprovado';
        $('at-text').value = drafts.get(selected) || '';
        $('at-attachment').textContent = attachments.has(selected) ? `PDF: ${attachments.get(selected).name} · bytes preservados na demonstração` : 'Nenhum PDF anexado.';
        const timeline = $('at-messages'); timeline.replaceChildren();
        for (const m of service.messages(owner, selected)) {
            const item = node('article', undefined, 'message ' + (m.direction === 'out' ? 'out' : 'in'));
            item.append(node('p',m.text),node('small',`${date(m.at)} · ${m.direction === 'in' ? 'Recebida (exemplo)' : ({ simulada: 'Sucesso simulado', falha_segura: 'Falha segura', incerto: 'Resultado incerto', pendente: 'Pendente' }[m.result] || 'Própria (exemplo)')}`));
            if (m.attachmentId) {
                const file = service.file(owner,m.attachmentId), button = node('button', 'Baixar ' + file.name); button.type = 'button';
                button.addEventListener('click', () => download(new Uint8Array(file.bytes), file.mime, file.name)); item.append(button);
            }
            if (m.result === 'falha_segura' && m.attempt < 3) {
                const retry = node('button','Repetir simulação'); retry.type = 'button'; retry.dataset.retry = m.id;
                retry.addEventListener('click', guard(async () => { await service.dispatch(owner,m.id,mockTransport()); render(); status('Retry concluído somente na demonstração.'); })); item.append(retry);
            }
            if (m.result === 'incerto') item.append(node('p','Repetição bloqueada: o resultado exige reconciliação.','help'));
            timeline.append(item);
        }
        const context = $('at-context'); context.replaceChildren(node('strong',c.context.cliente?.nome || 'Cliente ainda sem vínculo'),node('p','Origem: ' + c.context.origemContato));
        const tags = node('div',undefined,'tags'); c.etiquetas.forEach(t => tags.append(node('span',t,'tag'))); context.append(tags);
        for (const q of c.context.cotacoes) context.append(node('div',`${q.id} · Cotação ${q.origem} → ${q.destino}${c.cotacaoId === q.id ? ' · vinculada' : ''}`,'record'));
        for (const s of c.context.vendas) { const record = node('div',undefined,'record'); record.append(node('strong',`${s.id} · Venda ${s.origem} → ${s.destino}${s.vinculada ? ' · vinculada' : ''}`),node('p','Recebido líquido: ' + money(s.recebidoLiquido))); context.append(record); }
        options('at-client',DEMO_SOURCE.emissao_pessoas,c.clienteId); related();
        $('at-origin').value = c.origemContato; $('at-tags').value = c.etiquetas.join(', ');
    }
    function render() {
        const all = service.list(owner), labels = [...new Set(all.flatMap(c => c.etiquetas))], oldLabel = $('at-label').value;
        $('at-label').replaceChildren(node('option','Todas')); $('at-label').firstChild.value = '';
        labels.forEach(t => { const option = node('option',t); option.value = t; $('at-label').append(option); }); $('at-label').value = labels.includes(oldLabel) ? oldLabel : '';
        const chats = service.list(owner,{ search: $('at-search').value, unread: $('at-unread').checked, label: $('at-label').value });
        if (!selected || !all.some(c => c.id === selected)) selected = all[0]?.id || '';
        const list = $('at-chats'); list.replaceChildren();
        for (const c of chats) {
            const button = node('button',undefined,'chat-button' + (c.id === selected ? ' selected' : '')); button.type = 'button'; button.dataset.chatId = c.id; button.setAttribute('aria-pressed',String(c.id === selected));
            const name = node('strong',c.context.cliente?.nome || c.nome);
            if (c.unread) name.append(node('span',String(c.unread),'count'));
            button.append(name,node('small',c.last?.text.slice(0,85) || 'Sem mensagens'),node('small',c.etiquetas.join(' · ')));
            button.addEventListener('click', () => { selected = c.id; render(); }); list.append(button);
        }
        if (!chats.length) list.append(node('p','Nenhuma conversa para estes filtros.','help'));
        renderDetail();
    }
    listen('at-search','input',render); listen('at-unread','change',render); listen('at-label','change',render);
    listen('at-text','input',() => drafts.set(selected,$('at-text').value));
    listen('at-client','change',related);
    listen('at-read','click',guard(() => { service.read(owner,selected); render(); status('Mensagens vistas marcadas como lidas.'); }));
    listen('at-receive','click',guard(() => {
        const c = chat(); service.ingest(owner,{ type:'message',instance:'mock',messageId:crypto.randomUUID(),phone:'+' + c.phone,fromMe:false,text:'Nova resposta fictícia para testar não lidas.',at:new Date().toISOString(),status:'entregue' }); render(); status('Uma nova mensagem sintética foi recebida.');
    }));
    listen('at-link','submit',guard(() => { service.link(owner,selected,{ clienteId:$('at-client').value || null,cotacaoId:$('at-quote').value || null,vendaId:$('at-sale').value || null,origemContato:$('at-origin').value,etiquetas:$('at-tags').value.split(',').map(t=>t.trim()).filter(Boolean) }); render(); status('Vínculo atualizado somente na memória da demonstração.'); }));
    async function attach(file) { const cid = selected; const stored = await service.archive(owner,cid,file); attachments.set(cid,stored); if (selected === cid) renderDetail(); status('PDF preservado com bytes e checksum na demonstração.'); }
    listen('at-sample-pdf','click',guard(() => attach({ name:'proposta-exemplo.pdf',bytes:demoPdf() })));
    listen('at-pdf','change',guard(async event => { const file = event.target.files[0]; if (file) await attach({ name:file.name,bytes:await file.arrayBuffer(),mime:file.type }); event.target.value = ''; }));
    listen('at-compose','submit',guard(async () => {
        const cid = selected;
        const m = service.compose(owner,cid,{ text:$('at-text').value,attachmentId:attachments.get(cid)?.id || null,requestId:crypto.randomUUID() });
        await service.dispatch(owner,m.id,mockTransport({ outcome:$('at-outcome').value }));
        drafts.delete(cid); attachments.delete(cid); $('at-pdf').value = ''; render(); status('Tentativa registrada somente na demonstração.');
    }));
    listen('at-export','click',guard(() => { download(JSON.stringify(service.export(owner),null,2),'application/json','atendimento-sintetico.json'); status('Pacote sintético exportado com os bytes dos PDFs.'); }));
    listen('at-import','change',guard(async event => { const file = event.target.files[0]; if (!file) return; if (file.size > 20*1024*1024) throw new Error('Pacote excede 20 MB.'); await service.restore(owner,JSON.parse(await file.text())); selected = ''; drafts.clear(); attachments.clear(); event.target.value = ''; render(); status('Pacote validado e restaurado na demonstração.'); }));
    $('at-gate').hidden = true; $('at-workspace').hidden = false; render(); status('2 conversas sintéticas carregadas. Nenhuma conexão com WhatsApp ou Supabase.');
    return { render, service };
}
if (typeof document !== 'undefined' && demoAllowed(globalThis.location)) {
    mountAtendimentoPage({ service:createDemo({ financialSummary:sale => StorageManager.obterResumoFinanceiroVenda(sale) }) });
} else if (typeof document !== 'undefined' && globalThis.location.hostname === '127.0.0.1' && new URLSearchParams(globalThis.location.search).get('demo') === 'persistente') {
    import('./atendimento-persistente.mjs').then(({startAtendimentoPersistente})=>startAtendimentoPersistente()).catch(error=>{
        document.getElementById('at-gate').textContent='Demonstração persistente indisponível: '+error.message;
    });
}
