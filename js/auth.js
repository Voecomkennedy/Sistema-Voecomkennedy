// ============================================
// Autenticação (login / logout / proteção de página)
// ============================================

const Auth = {
    // Retorna a sessão atual (ou null se não logado)
    async getSession() {
        const client = getSupabaseClient();
        if (!client) return null;
        const { data } = await client.auth.getSession();
        return data ? data.session : null;
    },

    // Retorna o usuário logado (ou null)
    async getUser() {
        const client = getSupabaseClient();
        if (!client) return null;

        // getUser consulta o servidor de autenticação e valida o token.
        // Não usar apenas os dados locais da sessão para autorizar uma página.
        const { data, error } = await client.auth.getUser();
        if (error) {
            console.warn('Não foi possível validar o usuário:', error.message);
            return null;
        }
        return data ? data.user : null;
    },

    // Faz login com e-mail e senha
    async login(email, senha) {
        const client = getSupabaseClient();
        if (!client) return { ok: false, erro: 'Sistema de nuvem indisponível.' };

        const { data, error } = await client.auth.signInWithPassword({
            email: email.trim(),
            password: senha
        });

        if (error) {
            let msg = 'E-mail ou senha incorretos.';
            if (error.message && error.message.includes('Email not confirmed')) {
                msg = 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
            }
            return { ok: false, erro: msg };
        }
        return { ok: true, user: data.user };
    },

    _bloquearInterfaceSaida(falhou = false) {
        if (typeof document === 'undefined' || !document.body) return;
        delete document.documentElement.dataset.appAutenticado;
        let painel = document.getElementById('saidaDaConta');
        if (!painel) {
            painel = document.createElement('div');
            painel.id = 'saidaDaConta';
            painel.setAttribute('role', 'alertdialog');
            painel.setAttribute('aria-modal', 'true');
            painel.setAttribute('aria-label', 'Saída da conta');
            painel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#f8fafc;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;color:#0f172a';
            Array.from(document.body.children).forEach(elemento => { elemento.inert = true; });
            document.body.append(painel);
        }
        const texto = document.createElement('p');
        texto.textContent = falhou
            ? 'Não foi possível sair da conta. Seus dados locais foram mantidos. Recarregue a página para continuar com segurança.'
            : 'Saindo da conta e preservando os dados locais…';
        painel.replaceChildren(texto);
        if (falhou) {
            const recarregar = document.createElement('button');
            recarregar.type = 'button';
            recarregar.className = 'btn btn-primary';
            recarregar.textContent = 'Recarregar página';
            recarregar.addEventListener('click', () => window.location.reload());
            painel.append(recarregar);
            recarregar.focus();
        }
    },

    // Bloquear edições e invalidar respostas em trânsito antes de aguardar a rede.
    async logout() {
        if (this._saidaEmAndamento) return this._saidaEmAndamento;
        const client = getSupabaseClient();
        const sync = window.CloudSync;
        const chaveDono = sync?.USUARIO_LOCAL_KEY || 'emissao_cloud_sync_usuario_local';
        const donoInicial = localStorage.getItem(chaveDono);
        this._saidaSolicitada = true;
        if (sync) sync.suspenderSincronizacao();
        this._bloquearInterfaceSaida();

        this._saidaEmAndamento = (async () => {
            try {
                if (!client) throw new Error('Autenticação indisponível');
                const { error } = await client.auth.signOut();
                if (error) throw error;
            } catch {
                this._bloquearInterfaceSaida(true);
                return false;
            }

            // Outra aba pode ter assumido o cache durante o signOut. Nesse caso,
            // não preservar nem apagar os registros que agora pertencem a ela.
            const mesmoDono = localStorage.getItem(chaveDono) === donoInicial;
            let cachePreservado = false;
            if (sync && mesmoDono) {
                try {
                    // Recapturar depois da espera inclui qualquer alteração feita
                    // antes do bloqueio ou por um retorno local já enfileirado.
                    sync.preservarCacheParaLogout();
                    cachePreservado = true;
                    if (localStorage.getItem(chaveDono) === donoInicial) sync.limparCacheAposLogout();
                } catch {
                    // Quota cheia não prende a sessão aberta: manter os originais.
                    cachePreservado = false;
                }
            }
            if (mesmoDono && !cachePreservado) {
                window.alert('Você saiu da conta. Não foi possível criar uma cópia de recuperação; os dados locais e a identificação da conta foram mantidos neste navegador. Não limpe os dados do navegador antes de recuperar as alterações pendentes.');
            }
            window.location.href = 'login.html';
            return true;
        })().finally(() => { this._saidaEmAndamento = null; });
        return this._saidaEmAndamento;
    },

    // Protege uma página: se não estiver logado, manda pro login.
    // Use no topo de cada página interna.
    async proteger() {
        const user = await this.getUser();
        if (!user) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    },

    // Retorna o ID único do usuário logado (usado para separar dados por agência)
    async getUserId() {
        const user = await this.getUser();
        return user ? user.id : null;
    }
};

window.Auth = Auth;
