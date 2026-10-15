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
            input.placeholder = 'Buscar por nome, telefone ou e-mail';
            input.autocomplete = 'off';
            input.setAttribute('role', 'combobox');
            input.setAttribute('aria-autocomplete', 'list');
            input.setAttribute('aria-expanded', 'false');
            const list = document.createElement('div');
            list.id = select.id + 'Resultados';
            list.className = 'client-picker-list';
            list.setAttribute('role', 'listbox');
            list.setAttribute('aria-label', 'Clientes encontrados');
            list.hidden = true;
            input.setAttribute('aria-controls', list.id);
            const clear = document.createElement('button');
            clear.type = 'button';
            clear.className = 'client-picker-clear';
            clear.setAttribute('aria-label', 'Limpar cliente selecionado');
            clear.textContent = '×';
            clear.hidden = true;
            const hint = document.createElement('div');
            hint.id = select.id + 'Ajuda';
            hint.className = 'form-text';
            hint.textContent = 'Digite para buscar. Use as setas e Enter para selecionar.';
            input.setAttribute('aria-describedby', hint.id);
            const status = document.createElement('div');
            status.className = 'visually-hidden';
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            select.after(wrapper);
            wrapper.append(input, clear, list, hint, status);
            const label = document.querySelector(`label[for="${select.id}"]`);
            if (label) label.htmlFor = input.id;
            select.hidden = true;
            let items = [], matches = [], active = -1;
            const close = () => {
                list.hidden = true;
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
                Array.from(list.querySelectorAll('[role="option"]')).forEach((node, i) => node.setAttribute('aria-selected', String(i === active)));
                const node = list.children[active];
                if (node) {
                    input.setAttribute('aria-activedescendant', node.id);
                    node.scrollIntoView({ block: 'nearest' });
                }
            };
            const search = () => {
                const query = normalize(input.value.trim());
                const digits = query.replace(/\D/g, '');
                const results = items.filter(c => !query || normalize([c.nome, c.telefone, c.email].join(' ')).includes(query)
                    || (digits.length >= 3 && String(c.telefone || '').replace(/\D/g, '').includes(digits)));
                matches = results.slice(0, 20);
                active = -1;
                input.removeAttribute('aria-activedescendant');
                list.replaceChildren();
                matches.forEach((item, index) => {
                    const option = document.createElement('div');
                    option.id = list.id + '-' + index;
                    option.className = 'client-picker-option';
                    option.setAttribute('role', 'option');
                    option.setAttribute('aria-selected', 'false');
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
                const message = results.length > 20 ? `Mostrando 20 de ${results.length} clientes. Refine a busca.`
                    : results.length ? `${results.length} cliente${results.length === 1 ? '' : 's'} encontrado${results.length === 1 ? '' : 's'}.`
                    : items.length ? 'Nenhum cliente encontrado. Revise a busca ou cadastre um contato.'
                    : 'Nenhum cliente cadastrado. Use Cadastrar contato para começar.';
                if (!matches.length || results.length > 20) {
                    const notice = document.createElement('p');
                    notice.className = 'client-picker-notice';
                    notice.textContent = message;
                    list.append(notice);
                }
                status.textContent = message;
                list.hidden = false;
                input.setAttribute('aria-expanded', 'true');
            };
            input.addEventListener('focus', () => { if (!select.value) search(); });
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
                    if (list.hidden) search();
                    if (matches.length) activate(active < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1)
                        : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
                } else if (event.key === 'Enter' && !list.hidden) {
                    event.preventDefault();
                    if (active >= 0) choose(matches[active]);
                }
            });
            input.addEventListener('blur', close);
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
