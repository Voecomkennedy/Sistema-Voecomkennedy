import { TYPES, DEFAULT_CONFIG, DEFAULT_MODELOS, defaultViagem, previewContext, renderTemplate, validatePreferences, emSilencio, localToInstant, instantToLocal } from './messages-domain.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const labels = { pendente: 'Pendente', pausada: 'Pausada', reservada: 'Reservada', tentativa: 'Em tentativa', simulada: 'Simulada', incerto: 'Resultado incerto', falha: 'Falha', cancelada: 'Cancelada', expirada: 'Expirada' };
const unavailable = 'Central indisponível neste ambiente. Tente recarregar os dados. Suas edições foram mantidas.';
const conflict = 'As preferências mudaram em outra sessão. Suas edições foram mantidas. Copie o que deseja preservar antes de descartar e recarregar a versão atual.';

/** The API is injected so this controller can be exercised without a session or network. */
export async function mountMessagesPage({ api, root = document, now = () => new Date() }) {
    const doc = root.ownerDocument || root;
    const $ = id => root.querySelector('#' + id);
    const all = selector => [...root.querySelectorAll(selector)];
    const listeners = [];
    const arrivalEdits = new Map();
    let data = null, draft = null, dirty = false, busy = false, destroyed = false;
    let selectedType = TYPES[0], selectedSale = '', returnFocus = null;
    const listen = (target, type, fn) => { target.addEventListener(type, fn); listeners.push(() => target.removeEventListener(type, fn)); };
    const node = (tag, text, className) => {
        const el = doc.createElement(tag);
        if (text !== undefined) el.textContent = String(text);
        if (className) el.className = className;
        return el;
    };
    function error(message = '') {
        $('messages-error').textContent = message;
        $('messages-error').hidden = !message;
    }
    const status = message => { $('messages-status').textContent = message; };
    function lock() {
        const disabled = busy || !draft;
        for (const id of ['messages-config', 'messages-type-rules', 'messages-trip', 'messages-model-type', 'messages-model-text']) $(id).disabled = disabled;
        $('messages-trip').disabled = disabled || !data?.vendas.length;
        all('[data-save]').forEach(el => { el.disabled = disabled || !dirty; });
        $('messages-reload').disabled = busy;
        $('messages-discard').disabled = busy;
        $('messages-prepare').disabled = disabled || dirty;
        $('messages-dirty').hidden = !dirty;
        all('[data-task-action]').forEach(el => { el.disabled = disabled || dirty || el.dataset.allowed !== 'true'; });
        all('[data-task-preview]').forEach(el => { el.disabled = busy; });
    }
    function changed() { dirty = true; lock(); }
    function prefs(value) {
        return { versao: value.versao, config: { ...clone(DEFAULT_CONFIG), ...value.config }, modelos: Object.fromEntries(TYPES.map(type => [type, { ...clone(DEFAULT_MODELOS[type]), ...value.modelos?.[type] }])), viagens: clone(value.viagens || {}) };
    }
    function date(value) {
        const instant = new Date(value);
        if (!value || !Number.isFinite(instant.getTime())) return 'Data não informada';
        try { return new Intl.DateTimeFormat('pt-BR', { timeZone: data?.preferencias.config.fuso || DEFAULT_CONFIG.fuso, dateStyle: 'short', timeStyle: 'short' }).format(instant); }
        catch { return instant.toISOString(); }
    }
    const saleFor = id => data?.vendas.find(sale => String(sale.id) === String(id));
    const nameFor = task => saleFor(task.venda_id)?.nomeCliente || task.contexto?.primeiro_nome || 'Cliente da viagem';
    const typeName = type => DEFAULT_MODELOS[type]?.nome || 'Mensagem';
    function showTab(name, focus = false) {
        const selected = $('tab-' + name);
        if (!selected) return;
        for (const tab of all('[role="tab"]')) {
            const active = tab === selected;
            tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
            $(tab.getAttribute('aria-controls')).hidden = !active;
        }
        if (focus) selected.focus();
    }
    function previewModel() {
        const input = $('messages-model-text');
        try {
            $('messages-model-preview').textContent = renderTemplate(input.value, previewContext);
            $('messages-model-error').textContent = '';
            input.removeAttribute('aria-invalid');
        } catch (e) {
            $('messages-model-preview').textContent = '';
            $('messages-model-error').textContent = e.message;
            input.setAttribute('aria-invalid', 'true');
        }
    }
    function renderModel() {
        $('messages-model-type').value = selectedType;
        $('messages-model-text').value = draft.modelos[selectedType].texto;
        previewModel();
    }
    const tripFor = id => Object.hasOwn(draft.viagens, id) ? draft.viagens[id] : defaultViagem;
    function editableTrip(id) {
        if (!Object.hasOwn(draft.viagens, id)) Object.defineProperty(draft.viagens, id, { value: clone(defaultViagem), enumerable: true, writable: true, configurable: true });
        return draft.viagens[id];
    }
    function arrivalFor(id) {
        if (!arrivalEdits.has(id)) {
            const trip = tripFor(id), edit = { local: '', zone: trip.fusoChegada || '', originalISO: trip.chegadaFinal || '', touched: false, badInput: false, invalidSaved: false };
            if (trip.chegadaFinal) {
                try {
                    if (!edit.zone) throw new Error('Fuso não confirmado');
                    const value = instantToLocal(trip.chegadaFinal, edit.zone);
                    edit.local = `${value.date}T${value.time}`;
                } catch { edit.invalidSaved = true; }
            }
            arrivalEdits.set(id, edit);
        }
        return arrivalEdits.get(id);
    }
    function arrivalValue(edit) {
        // A stored instant is already disambiguated. Merely viewing its local
        // minute must not truncate seconds or re-resolve a DST overlap.
        if (!edit.touched) return edit.originalISO;
        if (edit.invalidSaved) throw new Error('Confira novamente a data, a hora e o fuso da chegada final.');
        if (edit.badInput) throw new Error('Complete a data e a hora da chegada final.');
        if (!edit.local) return '';
        if (!edit.zone.trim()) throw new Error('Informe o fuso do aeroporto de chegada final.');
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(edit.local)) throw new Error('Confira a data e a hora da chegada final.');
        return localToInstant(edit.local.slice(0, 10), edit.local.slice(11), edit.zone.trim());
    }
    function arrivalFeedback() {
        let message = '';
        try { arrivalValue(arrivalFor(selectedSale)); } catch (e) { message = e.message; }
        $('messages-arrival-error').textContent = message;
        for (const id of ['messages-arrival', 'messages-arrival-zone']) {
            if (message) $(id).setAttribute('aria-invalid', 'true'); else $(id).removeAttribute('aria-invalid');
        }
    }
    function renderTrip() {
        const sale = saleFor(selectedSale);
        const trip = tripFor(selectedSale), arrival = arrivalFor(selectedSale);
        $('messages-sale').value = selectedSale;
        $('messages-sale-summary').textContent = sale ? `${sale.origem || 'Origem'} → ${sale.destino || 'Destino'} · Ida: ${sale.dataEmbarque || 'sem data'} ${sale.horaEmbarque || ''}${sale.dataVolta ? ` · Volta: ${sale.dataVolta} ${sale.horaVolta || ''}` : ''}` : 'Nenhuma venda disponível para revisão.';
        $('messages-issued').checked = trip.emissaoConfirmada;
        $('messages-outbound-zone').value = trip.fusoIda;
        $('messages-return-zone').value = trip.fusoVolta;
        $('messages-arrival').value = arrival.local;
        $('messages-arrival-zone').value = arrival.zone;
        arrivalFeedback();
    }
    function renderForms() {
        $('messages-model-type').replaceChildren(...TYPES.map(type => {
            const option = node('option', typeName(type)); option.value = type; return option;
        }));
        renderModel();
        $('messages-paused').checked = draft.config.pausado;
        for (const [id, key] of [['messages-timezone', 'fuso'], ['messages-quiet-start', 'silencioInicio'], ['messages-quiet-end', 'silencioFim'], ['messages-test-phone', 'numeroTeste']]) $(id).value = draft.config[key];
        const ruleList = $('messages-type-rules-list'); ruleList.replaceChildren();
        for (const type of TYPES) {
            const rule = draft.modelos[type], row = node('div', undefined, 'messages-rule');
            const activeLabel = node('label', undefined, 'messages-check');
            const active = node('input'); active.type = 'checkbox'; active.checked = rule.ativo; active.dataset.ruleType = type; active.dataset.ruleField = 'ativo';
            activeLabel.append(active, doc.createTextNode(typeName(type))); row.append(activeLabel);
            for (const [key, text, min, max] of [['antecedenciaMinutos', type === 'volta' ? 'Minutos após a chegada final' : 'Minutos antes do voo', 0, 10080], ['validadeMinutos', 'Validade (minutos)', 1, 60]]) {
                const wrap = node('div'), id = 'messages-rule-' + type + '-' + key;
                const label = node('label', text); label.htmlFor = id;
                const input = node('input'); Object.assign(input, { type: 'number', id, min: String(min), max: String(max), step: '1', value: String(rule[key]) });
                input.dataset.ruleType = type; input.dataset.ruleField = key;
                wrap.append(label, input); row.append(wrap);
            }
            ruleList.append(row);
        }
        $('messages-sale').replaceChildren(...data.vendas.map(sale => {
            const option = node('option', `${sale.nomeCliente || 'Cliente da viagem'} · ${sale.origem || '?'} → ${sale.destino || '?'} · ${sale.dataEmbarque || 'sem data'}`); option.value = String(sale.id); return option;
        }));
        if (!saleFor(selectedSale)) selectedSale = data.vendas.length ? String(data.vendas[0].id) : '';
        renderTrip(); lock();
    }
    function simulationBlock(task) {
        const config = data.preferencias.config, rule = data.preferencias.modelos[task.tipo];
        const current = new Date(now()).getTime(), due = Date.parse(task.agendado_em), expiry = Date.parse(task.expira_em), flight = Date.parse(task.embarque_em);
        if (task.estado !== 'pendente') return 'Somente tarefas pendentes podem ser simuladas.';
        if (config.pausado) return 'A agenda de simulação está pausada em Regras.';
        if (!rule?.ativo) return 'Este tipo está desativado em Regras.';
        if (![current, due, expiry, flight].every(Number.isFinite)) return 'Confira as datas desta tarefa.';
        if (current < due) return 'A janela desta tarefa ainda não começou.';
        if (current >= expiry || (task.tipo !== 'volta' && current >= flight)) return 'A janela desta tarefa venceu.';
        try { if (emSilencio(new Date(current), config)) return 'A agenda está no horário de silêncio.'; }
        catch { return 'Confira o fuso e os horários de silêncio.'; }
        return '';
    }
    function action(task, command, text, allowed = true, reason = '') {
        const button = node('button', text, 'btn btn-sm btn-outline-secondary');
        button.type = 'button'; button.dataset.taskAction = command; button.dataset.taskId = task.id; button.dataset.allowed = String(allowed); button.title = reason;
        return button;
    }
    function renderAgenda() {
        const target = $('messages-agenda'); target.replaceChildren();
        const tasks = data.tarefas;
        $('messages-agenda-summary').textContent = `${tasks.length} ${tasks.length === 1 ? 'tarefa' : 'tarefas'} · ${data.preferencias.config.pausado ? 'Agenda pausada' : 'Agenda liberada para simular'} · Horários em ${data.preferencias.config.fuso}`;
        if (!tasks.length) target.append(node('p', 'Nenhuma tarefa na agenda. Revise as viagens e clique em Atualizar agenda para calcular as simulações.', 'messages-empty'));
        for (const task of tasks) {
            const card = node('article', undefined, 'messages-card'); card.dataset.taskId = task.id;
            const header = node('div', undefined, 'messages-card-heading');
            const title = node('h3', `${nameFor(task)} · ${typeName(task.tipo)}`);
            const badge = node('span', labels[task.estado] || 'Estado desconhecido', 'messages-badge'); badge.dataset.state = task.estado;
            header.append(title, badge);
            const route = node('p', `${task.contexto?.origem || '?'} → ${task.contexto?.destino || '?'} · ${task.destinatario || 'Sem telefone'}`);
            const meta = node('div', undefined, 'messages-meta'); meta.append(node('span', 'Agendada: ' + date(task.agendado_em)), node('span', 'Expira: ' + date(task.expira_em)));
            const actions = node('div', undefined, 'messages-card-actions');
            const preview = node('button', 'Ver prévia', 'btn btn-sm btn-outline-primary'); preview.type = 'button'; preview.dataset.taskPreview = task.id; actions.append(preview);
            if (task.estado === 'pendente') {
                const blocked = simulationBlock(task);
                actions.append(action(task, 'simular', 'Simular mensagem', !blocked, blocked), action(task, 'pausar', 'Pausar'), action(task, 'cancelar', 'Cancelar'));
                if (blocked) card.dataset.simulationReason = blocked;
            } else if (task.estado === 'pausada') {
                const expired = !(Date.parse(task.expira_em) > new Date(now()).getTime());
                if (!expired) actions.append(action(task, 'retomar', 'Retomar'));
                actions.append(action(task, 'cancelar', 'Cancelar'));
            }
            card.append(header, route, meta, actions);
            if (card.dataset.simulationReason) card.append(node('p', card.dataset.simulationReason, 'messages-help'));
            target.append(card);
        }
        const pending = data.pendencias || [];
        $('messages-pending').hidden = !pending.length;
        $('messages-pending-list').replaceChildren(...pending.map(item => node('li', `${saleFor(item.venda_id)?.nomeCliente || 'Viagem'}: ${item.mensagem || 'Confira os dados da viagem.'}`)));
        lock();
    }
    function renderHistory() {
        const target = $('messages-history'); target.replaceChildren();
        if (!data.historico.length) target.append(node('p', 'Nenhuma ação registrada nesta central.', 'messages-empty'));
        for (const entry of data.historico) {
            // A sale or task may now belong to a different contact. Historical
            // identity must come only from the snapshot recorded for this action.
            const snapshot = entry.snapshot;
            const name = typeof snapshot?.contexto?.primeiro_nome === 'string' && snapshot.contexto.primeiro_nome.trim() ? snapshot.contexto.primeiro_nome : 'Cliente não registrado';
            const recipient = typeof snapshot?.destinatario === 'string' && snapshot.destinatario.trim() ? 'Destinatário registrado: ' + snapshot.destinatario : 'Destinatário não registrado nesta ação.';
            const card = node('article', undefined, 'messages-card');
            card.append(node('h3', `${labels[entry.estado] || 'Registro da central'} · ${name}${snapshot?.tipo ? ' · ' + typeName(snapshot.tipo) : ''}`), node('p', recipient), node('p', date(entry.criado_em), 'messages-help'));
            if (entry.estado === 'simulada') card.append(node('p', 'Simulação concluída. Nenhuma mensagem foi enviada.'));
            else if (entry.estado === 'incerto' || entry.estado === 'tentativa') card.append(node('p', 'Requer conferência. Esta central não repete a tentativa automaticamente.'));
            target.append(card);
        }
    }
    function accept(result, replaceDraft) {
        if (!result || result.modo !== 'simulacao' || !result.preferencias || !Array.isArray(result.tarefas) || !Array.isArray(result.vendas) || !Array.isArray(result.historico)) throw new Error(unavailable);
        data = result;
        if (replaceDraft || !draft || !dirty) { draft = prefs(result.preferencias); arrivalEdits.clear(); dirty = false; renderForms(); }
        renderAgenda(); renderHistory();
    }
    async function run(operation, message, replaceDraft = false) {
        if (busy || destroyed) return false;
        busy = true; lock(); error(); status('Aguarde…');
        try {
            const result = await operation();
            if (destroyed) return false;
            accept(result, replaceDraft); status(message); return true;
        } catch (e) {
            if (!destroyed) { error(e?.status === 409 ? conflict : e?.message || unavailable); status('A ação não foi concluída.'); }
            return false;
        } finally { busy = false; if (!destroyed) lock(); }
    }
    async function reload(discard = false) {
        if (dirty && !discard) { error('Há alterações não salvas. Salve ou use “Descartar alterações e recarregar”.'); return false; }
        return run(() => api.listar(), 'Dados da central atualizados.', true);
    }
    async function save() {
        if (busy || !dirty || !draft) return;
        let preferences;
        try {
            const candidate = clone(draft);
            for (const [id, edit] of arrivalEdits) {
                if (!id || !edit.touched) continue;
                let arrival;
                try { arrival = arrivalValue(edit); }
                catch (e) { throw new Error(`${saleFor(id)?.nomeCliente || 'Viagem'}: ${e.message}`); }
                if (Object.hasOwn(candidate.viagens, id)) Object.assign(candidate.viagens[id], { chegadaFinal: arrival, fusoChegada: edit.zone.trim() });
            }
            preferences = { ...validatePreferences(candidate), versao: draft.versao };
        }
        catch (e) { error(e.message); return; }
        await run(() => api.salvar(preferences), 'Preferências salvas. Atualize a agenda para recalcular as tarefas.', true);
    }
    function openPreview(task, trigger) {
        returnFocus = trigger;
        $('messages-preview-title').textContent = `${typeName(task.tipo)} · simulação`;
        $('messages-preview-recipient').textContent = `${nameFor(task)} · ${task.destinatario || 'Sem telefone'}`;
        $('messages-task-preview').textContent = task.texto || 'Texto indisponível. Atualize a agenda.';
        const dialog = $('messages-preview-dialog');
        if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
        $('messages-preview-close').focus();
    }
    function closePreview() {
        const dialog = $('messages-preview-dialog');
        if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
        returnFocus?.focus();
    }
    listen($('messages-reload'), 'click', () => reload());
    listen($('messages-discard'), 'click', () => reload(true));
    all('[data-save]').forEach(button => listen(button, 'click', save));
    listen($('messages-prepare'), 'click', () => { if (!dirty) run(() => api.preparar(), 'Agenda recalculada. Nenhuma mensagem foi enviada.'); });
    all('[role="tab"]').forEach((tab, index, tabs) => {
        listen(tab, 'click', () => showTab(tab.id.slice(4)));
        listen(tab, 'keydown', event => {
            const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
            if (next >= 0) { event.preventDefault(); showTab(tabs[next].id.slice(4), true); }
        });
    });
    all('[data-open-tab]').forEach(button => listen(button, 'click', () => showTab(button.dataset.openTab, true)));
    listen($('messages-model-type'), 'change', event => { if (draft) { selectedType = event.target.value; renderModel(); } });
    listen($('messages-model-text'), 'input', event => { if (!draft || busy) return; draft.modelos[selectedType].texto = event.target.value; previewModel(); changed(); });
    for (const [id, key] of [['messages-paused', 'pausado'], ['messages-timezone', 'fuso'], ['messages-quiet-start', 'silencioInicio'], ['messages-quiet-end', 'silencioFim'], ['messages-test-phone', 'numeroTeste']]) {
        listen($(id), id === 'messages-paused' ? 'change' : 'input', event => { if (!draft || busy) return; draft.config[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value; changed(); });
    }
    const changeRule = event => {
        const input = event.target, type = input.dataset.ruleType, field = input.dataset.ruleField;
        if (!type || !field || !draft || busy || (event.type === 'input' && input.type === 'checkbox')) return;
        draft.modelos[type][field] = input.type === 'checkbox' ? input.checked : input.value === '' ? null : Number(input.value); changed();
    };
    listen($('messages-type-rules-list'), 'input', changeRule); listen($('messages-type-rules-list'), 'change', changeRule);
    listen($('messages-sale'), 'change', event => { selectedSale = event.target.value; renderTrip(); });
    for (const [id, key] of [['messages-issued', 'emissaoConfirmada'], ['messages-outbound-zone', 'fusoIda'], ['messages-return-zone', 'fusoVolta']]) {
        listen($(id), id === 'messages-issued' ? 'change' : 'input', event => {
            if (!draft || !selectedSale || busy) return;
            editableTrip(selectedSale)[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value; changed();
        });
    }
    for (const [id, key] of [['messages-arrival', 'local'], ['messages-arrival-zone', 'zone']]) {
        listen($(id), 'input', event => {
            if (!draft || !selectedSale || busy) return;
            const edit = arrivalFor(selectedSale); edit[key] = event.target.value; edit.touched = true; edit.invalidSaved = false;
            if (key === 'local') edit.badInput = event.target.validity.badInput;
            // Never leave the previous instant available after an incomplete edit.
            Object.assign(editableTrip(selectedSale), { chegadaFinal: '', fusoChegada: edit.zone });
            arrivalFeedback(); changed();
        });
    }
    listen($('messages-agenda'), 'click', event => {
        const button = event.target.closest('button'); if (!button || busy) return;
        const task = data?.tarefas.find(item => item.id === (button.dataset.taskId || button.dataset.taskPreview)); if (!task) return;
        if (button.dataset.taskPreview) { openPreview(task, button); return; }
        if (dirty || button.disabled || button.dataset.allowed !== 'true') return;
        const command = button.dataset.taskAction;
        if (command === 'simular') {
            const blocked = simulationBlock(task); if (blocked) { error(blocked); renderAgenda(); return; }
            run(() => api.simular(task.id), 'Simulação registrada. Nenhuma mensagem foi enviada.');
        } else if (['pausar', 'retomar', 'cancelar'].includes(command)) {
            if (command === 'retomar' && !(Date.parse(task.expira_em) > new Date(now()).getTime())) { error('A janela desta tarefa venceu.'); renderAgenda(); return; }
            run(() => api.controlar(task.id, command), 'Estado da tarefa atualizado.');
        }
    });
    listen($('messages-preview-close'), 'click', closePreview);
    listen($('messages-preview-dialog'), 'cancel', event => { event.preventDefault(); closePreview(); });
    if (doc.defaultView) listen(doc.defaultView, 'beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
    await reload();
    return { reload, destroy() { destroyed = true; listeners.forEach(remove => remove()); }, getDraft: () => draft ? clone(draft) : null };
}

async function bootstrap() {
    if (!await globalThis.Auth?.proteger()) return;
    await mountMessagesPage({ api: globalThis.createMessagesApi(globalThis.getSupabaseClient()) });
}
if (typeof document !== 'undefined' && document.querySelector('[data-messages-auto="true"]')) {
    bootstrap().catch(() => {
        const error = document.getElementById('messages-error'); error.textContent = unavailable; error.hidden = false;
        document.getElementById('messages-status').textContent = 'Não foi possível iniciar a central.';
    });
}
