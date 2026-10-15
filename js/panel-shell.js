// Navegação comum das telas operacionais.
(function () {
    const host = document.getElementById('panelShell');
    if (!host) return;
    const page = host.dataset.page;
    const groups = [
        ['Operação', [['inicio', 'index.html', 'grid-1x2', 'Visão geral'], ['cotacoes', 'cotacoes.html', 'file-earmark-text', 'Cotações'], ['vendas', 'vendas.html', 'ticket-perforated', 'Vendas'], ['pessoas', 'pessoas.html', 'people', 'Clientes e pessoas'], ['checkin', 'checkin.html', 'airplane', 'Check-ins'], ['mensagens', 'mensagens.html', 'chat-left-text', 'Mensagens']]],
        ['Gestão', [['balanco', 'balanco.html', 'bar-chart', 'Balanço'], ['revisao', 'revisao-vendas.html', 'shield-check', 'Revisão de legado'], ['cartao', 'cartao-embarque.html', 'qr-code', 'Cartão de embarque'], ['backup', 'backup.html', 'cloud-arrow-down', 'Backup'], ['pacotes', 'pacotes.html', 'archive', 'Pacotes do legado']]]
    ];
    const link = ([key, href, icon, label]) => `<a href="${href}" class="panel-nav-link${page === key ? ' is-active' : ''}"${page === key ? ' aria-current="page"' : ''}><i class="bi bi-${icon}" aria-hidden="true"></i><span>${label}</span></a>`;
    const current = groups.flatMap(([, entries]) => entries).find(([key]) => key === page);
    host.innerHTML = `
        <a class="panel-skip" href="#panelMain">Ir para o conteúdo</a>
        <aside class="panel-sidebar" id="panelNavigation">
            <div class="panel-brand-row"><a class="panel-brand" href="index.html"><img src="icons/icon-192.png" alt=""><span>Voecomkennedy</span></a><button type="button" class="panel-menu-close" aria-label="Fechar menu"><i class="bi bi-x-lg" aria-hidden="true"></i></button></div>
            <nav aria-label="Principal">${groups.map(([title, entries]) => `<section class="panel-nav-group"><h2>${title}</h2>${entries.map(link).join('')}</section>`).join('')}</nav>
            <div class="panel-sidebar-footer"><span>Seu espaço de trabalho</span><button type="button" class="panel-logout" onclick="Auth.logout()"><i class="bi bi-box-arrow-right" aria-hidden="true"></i>Sair da conta</button></div>
        </aside>
        <button type="button" class="panel-scrim" aria-label="Fechar menu" tabindex="-1" hidden></button>
        <header class="panel-topbar"><div class="panel-topbar-context"><button type="button" class="panel-menu-toggle" aria-controls="panelNavigation" aria-expanded="false" aria-label="Abrir menu"><i class="bi bi-list" aria-hidden="true"></i></button><span>Área de trabalho</span><i class="bi bi-chevron-right" aria-hidden="true"></i><strong>${host.dataset.title || current?.[3] || 'Painel'}</strong></div><div class="panel-topbar-meta"><span class="panel-date">${new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(new Date())}</span><span id="cloudStatus" role="status"></span></div></header>
        <nav class="panel-mobile-nav" aria-label="Navegação rápida">${groups[0][1].slice(0, 4).map(link).join('')}</nav>`;
    const sidebar = host.querySelector('.panel-sidebar');
    const toggle = host.querySelector('.panel-menu-toggle');
    const scrim = host.querySelector('.panel-scrim');
    let open = false;
    const setOpen = value => {
        open = value;
        document.body.classList.toggle('panel-menu-open', value);
        toggle.setAttribute('aria-expanded', String(value));
        scrim.hidden = !value;
        if (value) {
            sidebar.setAttribute('role', 'dialog'); sidebar.setAttribute('aria-modal', 'true'); sidebar.setAttribute('aria-label', 'Menu principal');
            sidebar.querySelector('a').focus();
        } else {
            sidebar.removeAttribute('role'); sidebar.removeAttribute('aria-modal'); sidebar.removeAttribute('aria-label');
        }
    };
    const close = () => { setOpen(false); toggle.focus(); };
    toggle.addEventListener('click', () => setOpen(!open));
    host.querySelector('.panel-menu-close').addEventListener('click', close);
    scrim.addEventListener('click', close);
    document.addEventListener('keydown', event => {
        if (!open) return;
        if (event.key === 'Escape') { event.preventDefault(); close(); }
        if (event.key === 'Tab') {
            const targets = Array.from(sidebar.querySelectorAll('a, button'));
            const first = targets[0], last = targets.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });
    window.matchMedia?.('(min-width: 1100px)')?.addEventListener('change', event => { if (event.matches) setOpen(false); });
})();
