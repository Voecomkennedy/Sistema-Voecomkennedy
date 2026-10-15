// Busca acessível sobre o select existente. O valor canônico continua sendo o ID.
(function () {
    const instances = new WeakMap();
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
    window.ClientPicker = {
        attach(select) {
            if (instances.has(select)) return instances.get(select);
            const wrapper = document.createElement('div');
            wrapper.className = 'client-picker';
            const input = document.createElement('input');
            input.id = select.id + 'Busca';
            input.type = 'text';
            input.className = 'form-control';
            input.placeholder = 'Buscar por nome, telefone, e-mail ou ID';
            input.autocomplete = 'off';
            input.setAttribute('role', 'combobox');
            input.setAttribute('aria-autocomplete', 'list');
            input.setAttribute('aria-expanded', 'false');
            const popup = document.createElement('div');
            popup.className = 'client-picker-list';
            popup.hidden = true;
            const list = document.createElement('div');
            list.id = select.id + 'Resultados';
            list.setAttribute('role', 'listbox');
            list.setAttribute('aria-label', 'Clientes encontrados');
            input.setAttribute('aria-controls', list.id);
            const pager = document.createElement('div');
            pager.className = 'client-picker-notice';
            pager.setAttribute('role', 'group');
            pager.setAttribute('aria-label', 'Páginas de clientes');
            const previous = document.createElement('button');
            const next = document.createElement('button');
            for (const button of [previous, next]) {
                button.type = 'button';
                button.className = 'btn btn-sm btn-outline-secondary';
            }
            previous.textContent = 'Anteriores';
            previous.classList.add('me-2');
            next.textContent = 'Próximos';
            pager.append(previous, next);
            popup.append(list, pager);
            const clear = document.createElement('button');
            clear.type = 'button';
            clear.className = 'client-picker-clear';
            clear.setAttribute('aria-label', 'Limpar cliente selecionado');
            clear.textContent = '×';
            clear.hidden = true;
            const hint = document.createElement('div');
            hint.id = select.id + 'Ajuda';
            hint.className = 'form-text';
            hint.textContent = 'Busque por nome, telefone, e-mail ou ID. Use as setas e Enter para selecionar.';
            input.setAttribute('aria-describedby', hint.id);
            const status = document.createElement('div');
            status.className = 'visually-hidden';
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            select.after(wrapper);
            wrapper.append(input, clear, popup, hint, status);
            const label = document.querySelector(`label[for="${select.id}"]`);
            if (label) label.htmlFor = input.id;
            select.hidden = true;
            const pageSize = 20;
            let items = [], matches = [], active = -1, offset = 0;
            const close = () => {
                popup.hidden = true;
                input.setAttribute('aria-expanded', 'false');
                input.removeAttribute('aria-activedescendant');
                active = -1;
            };
            const changed = () => select.dispatchEvent(new Event('change', { bubbles: true }));
            const sync = () => {
                const item = items.find(c => String(c.id) === select.value);
                input.value = item?.nome || '';
                clear.hidden = !input.value;
                close();
            };
            const choose = item => {
                select.replaceChildren(new Option('Selecione um cliente', ''), new Option(item.nome, item.id));
                select.value = String(item.id);
                sync();
                changed();
                status.textContent = `Cliente selecionado: ${item.nome}.`;
            };
            const activate = index => {
                active = index;
                const start = Math.floor(index / pageSize) * pageSize;
                if (start !== offset) { offset = start; render(); }
                Array.from(list.querySelectorAll('[role="option"]')).forEach((node, i) => node.setAttribute('aria-selected', String(offset + i === active)));
                const node = list.children[active - offset];
                if (node) {
                    input.setAttribute('aria-activedescendant', node.id);
                    node.scrollIntoView({ block: 'nearest' });
                }
            };
            const render = () => {
                list.replaceChildren();
                matches.slice(offset, offset + pageSize).forEach((item, index) => {
                    const option = document.createElement('div');
                    option.id = list.id + '-' + (offset + index);
                    option.className = 'client-picker-option';
                    option.setAttribute('role', 'option');
                    option.setAttribute('aria-selected', 'false');
                    option.setAttribute('aria-posinset', String(offset + index + 1));
                    option.setAttribute('aria-setsize', String(matches.length));
                    const name = document.createElement('strong');
                    name.textContent = item.nome || 'Cliente sem nome';
                    const detail = document.createElement('small');
                    // O ID distingue cadastros homônimos mesmo sem dados de contato.
                    detail.textContent = [item.telefone, item.email, 'ID: ' + item.id].filter(Boolean).join(' · ');
                    option.append(name, detail);
                    option.addEventListener('mousedown', event => event.preventDefault());
                    option.addEventListener('click', () => { choose(item); input.focus(); });
                    list.append(option);
                });
                const message = matches.length > pageSize ? `Mostrando ${offset + 1} a ${Math.min(offset + pageSize, matches.length)} de ${matches.length} clientes. Use as setas ou os botões para ver os demais.`
                    : matches.length ? `${matches.length} cliente${matches.length === 1 ? '' : 's'} encontrado${matches.length === 1 ? '' : 's'}.`
                    : items.length ? 'Nenhum cliente encontrado. Revise a busca ou cadastre um contato.'
                    : 'Nenhum cliente cadastrado. Use Cadastrar contato para começar.';
                if (!matches.length || matches.length > pageSize) {
                    const notice = document.createElement('p');
                    notice.className = 'client-picker-notice';
                    notice.textContent = message;
                    list.append(notice);
                }
                pager.hidden = matches.length <= pageSize;
                previous.disabled = offset === 0;
                next.disabled = offset + pageSize >= matches.length;
                status.textContent = message;
            };
            const search = () => {
                const query = normalize(input.value.trim());
                const digits = query.replace(/\D/g, '');
                matches = items.filter(c => !query || normalize([c.nome, c.telefone, c.email, c.id].join(' ')).includes(query)
                    || (digits.length >= 3 && String(c.telefone || '').replace(/\D/g, '').includes(digits)));
                active = -1;
                offset = 0;
                input.removeAttribute('aria-activedescendant');
                render();
                popup.hidden = false;
                input.setAttribute('aria-expanded', 'true');
            };
            const turnPage = direction => {
                activate(Math.max(0, Math.min(offset + direction * pageSize, matches.length - 1)));
                input.focus();
            };
            previous.addEventListener('click', () => turnPage(-1));
            next.addEventListener('click', () => turnPage(1));
            input.addEventListener('focus', () => { if (!select.value && popup.hidden) search(); });
            input.addEventListener('click', search);
            input.addEventListener('input', () => {
                // Texto livre nunca mantém o vínculo com o cliente anterior.
                select.value = '';
                clear.hidden = !input.value;
                changed();
                search();
            });
            input.addEventListener('keydown', event => {
                if (event.key === 'Escape') { close(); event.preventDefault(); return; }
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    if (popup.hidden) search();
                    if (matches.length) activate(active < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1)
                        : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
                } else if (event.key === 'Enter' && !popup.hidden) {
                    event.preventDefault();
                    if (active >= 0) choose(matches[active]);
                }
            });
            const closeOutside = event => { if (!wrapper.contains(event.relatedTarget)) close(); };
            input.addEventListener('blur', closeOutside);
            wrapper.addEventListener('focusout', closeOutside);
            clear.addEventListener('click', () => {
                select.value = '';
                sync();
                changed();
                input.focus();
                search();
            });
            const api = {
                sync,
                refresh(clients) {
                    const selected = select.value;
                    items = clients.slice().sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
                    const item = items.find(c => String(c.id) === selected);
                    select.replaceChildren(new Option('Selecione um cliente', ''));
                    if (item) select.add(new Option(item.nome, item.id));
                    select.value = item ? String(item.id) : '';
                    sync();
                },
                select(id) {
                    const item = items.find(c => String(c.id) === String(id));
                    if (item) choose(item);
                    else { select.value = ''; sync(); changed(); }
                }
            };
            instances.set(select, api);
            return api;
        }
    };
})();
