// Inicialização única das páginas internas.
// Confirma o usuário e sincroniza os dados antes de liberar qualquer renderização.
const AppBootstrap = {
    _iniciando: null,

    _mostrarErroInicializacao(erro = null) {
        delete document.documentElement.dataset.appAutenticado;
        if (document.getElementById('erroInicializacaoApp')) return;
        const painel = document.createElement('div');
        painel.id = 'erroInicializacaoApp';
        painel.setAttribute('role', 'alertdialog');
        painel.setAttribute('aria-modal', 'true');
        painel.setAttribute('aria-labelledby', 'tituloErroInicializacao');
        painel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#f8fafc;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;color:#0f172a';
        const titulo = document.createElement('h1');
        titulo.id = 'tituloErroInicializacao';
        titulo.textContent = 'Não foi possível carregar seus dados com segurança';
        const detalhe = document.createElement('p');
        detalhe.textContent = erro?.code === 'CACHE_RECOVERY_FAILED'
            ? 'A cópia de recuperação dos dados locais não pôde ser concluída. Não limpe os dados deste site. Revise a recuperação antes de continuar.'
            : 'A sincronização inicial não foi concluída. Verifique sua conexão e recarregue a página para tentar novamente.';
        const tentar = document.createElement('button');
        tentar.type = 'button';
        tentar.className = 'btn btn-primary';
        tentar.textContent = 'Recarregar página';
        tentar.addEventListener('click', () => window.location.reload());
        painel.append(titulo, detalhe, tentar);
        // Evita que o teclado alcance formulários com dados ainda não validados.
        Array.from(document.body.children).forEach(elemento => { elemento.inert = true; });
        document.body.append(painel);
        tentar.focus();
    },

    async iniciar(callback = null) {
        if (this._iniciando) return this._iniciando;

        this._iniciando = (async () => {
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve, { once: true });
                });
            }

            delete document.documentElement.dataset.appAutenticado;
            const autenticado = await Auth.proteger();
            if (!autenticado) return false;

            if (await CloudSync.init() !== true) {
                this._mostrarErroInicializacao();
                return false;
            }
            CloudSync.mostrarAvisoRecuperacao?.();
            document.documentElement.dataset.appAutenticado = 'true';
            document.dispatchEvent(new CustomEvent('app:ready'));

            if (typeof callback === 'function') await callback();
            return true;
        })().catch(error => {
            console.error('Falha ao inicializar página protegida:', error);
            this._mostrarErroInicializacao(error);
            return false;
        });

        return this._iniciando;
    }
};

window.AppBootstrap = AppBootstrap;
