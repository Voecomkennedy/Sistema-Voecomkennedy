// Select com busca: transforma um <select> comum em um campo onde se digita
// para filtrar e escolhe numa lista compacta com rolagem (mesmo padrão da
// busca de cliente). O <select> original continua no formulário, escondido,
// como fonte do valor: quem lê ou grava `select.value` não precisa mudar.
(function (root) {
    'use strict';

    const CSS = `
.sb-wrap{position:relative}
.sb-native{position:absolute!important;left:0;right:0;bottom:0;height:100%;width:100%;opacity:0;pointer-events:none;z-index:-1}
.sb-input{cursor:text}
.sb-input.sb-chevron{padding-right:40px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%236c757d' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center}
.sb-list{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:1060;display:none;max-height:260px;overflow-y:auto;background:#fff;border:1px solid #dee2e6;border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.12);padding:0;margin:0;list-style:none;text-align:left}
.sb-list.sb-open{display:block}
.sb-group{padding:8px 14px 4px;font-size:.68rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a94a6;background:#fafbfc;border-bottom:1px solid #f0f2f5}
.sb-item{display:block;padding:10px 14px;border-bottom:1px solid #f0f2f5;font-size:.9rem;color:#212529;cursor:pointer;line-height:1.35}
.sb-item:last-child{border-bottom:none}
.sb-item strong{font-weight:600}
.sb-item small{color:#6c757d;font-weight:400;margin-left:4px}
.sb-item.sb-active{background:#eef3fb}
.sb-item.sb-selected strong{color:#0d47a1}
.sb-empty{padding:10px 14px;color:#6c757d;font-size:.88rem}
`;

    const normalizar = (texto) => String(texto || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

    const escapar = (texto) => String(texto ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // "LA - LATAM Airlines" vira nome "LATAM Airlines" + código "LA".
    function partes(texto) {
        const m = /^([A-Z0-9]{2,3}) - (.+)$/.exec(texto.trim());
        return m ? { nome: m[2], codigo: m[1] } : { nome: texto.trim(), codigo: '' };
    }

    function injetarCSS() {
        if (document.getElementById('select-busca-css')) return;
        const style = document.createElement('style');
        style.id = 'select-busca-css';
        style.textContent = CSS;
        document.head.appendChild(style);
    }

    function aplicar(select, opcoes = {}) {
        if (!select || select.dataset.selectBusca === '1') return;
        injetarCSS();
        select.dataset.selectBusca = '1';

        const wrap = document.createElement('div');
        wrap.className = 'sb-wrap';
        select.parentNode.insertBefore(wrap, select);

        const input = document.createElement('input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.id = select.id ? select.id + 'Busca' : '';
        input.className = (select.className || '') + ' sb-input' + (/form-select/.test(select.className) ? '' : ' sb-chevron');
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');

        const lista = document.createElement('div');
        lista.className = 'sb-list';
        lista.setAttribute('role', 'listbox');
        if (input.id) {
            lista.id = input.id + 'Lista';
            input.setAttribute('aria-controls', lista.id);
        }

        wrap.appendChild(input);
        wrap.appendChild(select);
        wrap.appendChild(lista);
        select.classList.add('sb-native');
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');

        // O rótulo do campo passa a focar o campo de busca.
        if (select.id && input.id) {
            document.querySelectorAll(`label[for="${select.id}"]`)
                .forEach((label) => { label.htmlFor = input.id; });
        }

        let itens = [];
        let ativo = -1;
        let aberto = false;

        function lerOpcoes() {
            const resultado = [];
            [...select.options].forEach((opt) => {
                const grupo = opt.parentElement && opt.parentElement.tagName === 'OPTGROUP'
                    ? opt.parentElement.label.replace(/^[^\p{L}\p{N}]+/u, '').trim() : '';
                resultado.push({ valor: opt.value, texto: opt.textContent.trim(), grupo, ...partes(opt.textContent) });
            });
            return resultado;
        }

        function placeholderDe(todas) {
            const vazia = todas.find((o) => o.valor === '');
            return opcoes.placeholder || (vazia && /^selecione/i.test(vazia.texto)
                ? 'Digite para buscar...' : (vazia ? vazia.texto : 'Digite para buscar...'));
        }

        function rotuloSelecionado() {
            const opt = select.options[select.selectedIndex];
            if (!opt || opt.value === '') return '';
            const p = partes(opt.textContent);
            return p.codigo ? `${p.nome} (${p.codigo})` : p.nome;
        }

        function sincronizar() {
            const todas = lerOpcoes();
            input.placeholder = placeholderDe(todas);
            if (document.activeElement !== input || !aberto) input.value = rotuloSelecionado();
            input.disabled = select.disabled;
            input.required = false;
        }

        function renderizar(termo) {
            const todas = lerOpcoes();
            const t = normalizar(termo);
            // Opção vazia só aparece na lista quando tem significado próprio
            // (ex.: "Mesma da Ida"); "Selecione..." vira só o texto de ajuda.
            itens = todas.filter((o) => {
                if (o.valor === '') return !/^selecione/i.test(o.texto) && !t;
                if (!t) return true;
                return normalizar(o.nome).includes(t) || normalizar(o.codigo) === t || normalizar(o.codigo).startsWith(t);
            });
            // Quem casa pelo código exato ou começa com o termo vem primeiro.
            if (t) {
                const peso = (o) => (normalizar(o.codigo) === t ? 0 : normalizar(o.nome).startsWith(t) ? 1 : 2);
                itens.sort((a, b) => peso(a) - peso(b));
            }

            if (!itens.length) {
                lista.innerHTML = `<div class="sb-empty">${escapar(opcoes.vazio || 'Nenhum resultado encontrado')}</div>`;
                ativo = -1;
                return;
            }

            const mostrarGrupos = !t && itens.some((o) => o.grupo);
            let grupoAtual = null;
            const html = [];
            itens.forEach((o, i) => {
                if (mostrarGrupos && o.grupo && o.grupo !== grupoAtual) {
                    grupoAtual = o.grupo;
                    html.push(`<div class="sb-group" role="presentation">${escapar(o.grupo)}</div>`);
                }
                const sel = o.valor === select.value && o.valor !== '' ? ' sb-selected' : '';
                html.push(`<div class="sb-item${sel}" role="option" data-i="${i}" id="${lista.id}-${i}">` +
                    `<strong>${escapar(o.nome)}</strong>${o.codigo ? `<small>- ${escapar(o.codigo)}</small>` : ''}</div>`);
            });
            lista.innerHTML = html.join('');
            const idxSel = itens.findIndex((o) => o.valor === select.value && o.valor !== '');
            marcar(t ? 0 : idxSel, !t);
        }

        function marcar(i, rolarParaSelecionado) {
            ativo = i;
            lista.querySelectorAll('.sb-item').forEach((el) => {
                const on = Number(el.dataset.i) === i;
                el.classList.toggle('sb-active', on);
                el.setAttribute('aria-selected', on ? 'true' : 'false');
                if (on) {
                    input.setAttribute('aria-activedescendant', el.id);
                    if (rolarParaSelecionado) lista.scrollTop = Math.max(0, el.offsetTop - 60);
                    else el.scrollIntoView({ block: 'nearest' });
                }
            });
        }

        function abrir() {
            if (input.disabled) return;
            aberto = true;
            lista.classList.add('sb-open');
            input.setAttribute('aria-expanded', 'true');
        }

        function fechar() {
            aberto = false;
            lista.classList.remove('sb-open');
            input.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
        }

        function escolher(i) {
            const item = itens[i];
            if (!item) return;
            if (select.value !== item.valor) {
                select.value = item.valor;
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
            fechar();
            input.value = rotuloSelecionado();
        }

        input.addEventListener('focus', () => {
            input.select();
            renderizar('');
            abrir();
        });
        input.addEventListener('click', () => {
            if (!aberto) { renderizar(''); abrir(); }
        });
        input.addEventListener('input', () => {
            renderizar(input.value);
            abrir();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!aberto) { renderizar(''); abrir(); return; }
                if (!itens.length) return;
                const passo = e.key === 'ArrowDown' ? 1 : -1;
                marcar(Math.min(itens.length - 1, Math.max(0, ativo + passo)), false);
            } else if (e.key === 'Enter') {
                if (aberto) {
                    e.preventDefault();
                    if (ativo >= 0) escolher(ativo);
                }
            } else if (e.key === 'Escape') {
                if (aberto) {
                    e.preventDefault();
                    fechar();
                    input.value = rotuloSelecionado();
                }
            } else if (e.key === 'Tab' && aberto) {
                if (input.value.trim() && ativo >= 0) escolher(ativo);
                else fechar();
            }
        });
        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (wrap.contains(document.activeElement)) return;
                // Campo apagado = limpar a escolha; texto solto = volta ao valor anterior.
                if (!input.value.trim() && select.value !== '') {
                    select.value = '';
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
                fechar();
                input.value = rotuloSelecionado();
            }, 120);
        });
        lista.addEventListener('mousedown', (e) => e.preventDefault());
        lista.addEventListener('click', (e) => {
            const el = e.target.closest('.sb-item');
            if (el) escolher(Number(el.dataset.i));
        });
        lista.addEventListener('mousemove', (e) => {
            const el = e.target.closest('.sb-item');
            if (el && Number(el.dataset.i) !== ativo) marcar(Number(el.dataset.i), false);
        });

        // Validação nativa (campo obrigatório) leva o foco para a busca.
        select.addEventListener('invalid', () => input.focus());
        select.addEventListener('change', sincronizar);

        // Mantém o texto certo quando o código grava `select.value` direto
        // (ao editar uma venda, importar cotação, limpar o formulário etc.).
        ['value', 'selectedIndex'].forEach((prop) => {
            const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
            Object.defineProperty(select, prop, {
                configurable: true,
                get() { return desc.get.call(this); },
                set(v) { desc.set.call(this, v); sincronizar(); }
            });
        });
        new MutationObserver(sincronizar).observe(select, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['disabled']
        });
        if (select.form) select.form.addEventListener('reset', () => setTimeout(sincronizar, 0));

        sincronizar();
    }

    function aplicarTodos(seletores, opcoes) {
        seletores.forEach((s) => {
            const el = typeof s === 'string' ? document.getElementById(s) : s;
            if (el) aplicar(el, opcoes);
        });
    }

    const api = { aplicar, aplicarTodos };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SelectBusca = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
