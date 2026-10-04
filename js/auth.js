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

    // Faz logout
    async logout() {
        const client = getSupabaseClient();
        const sync = window.CloudSync;
        let cachePreservado = false;
        try {
            if (sync) {
                sync.preservarCacheParaLogout();
                cachePreservado = true;
            }
        } catch {
            // Falta de espaço para outra cópia não pode prender a sessão aberta.
            // Os originais e seu marcador de dono permanecem para o próximo login.
        }
        try {
            if (client) {
                const { error } = await client.auth.signOut();
                if (error) throw error;
            }
        } catch {
            window.alert('Não foi possível sair com segurança. Os dados locais foram mantidos. Tente novamente antes de trocar de conta.');
            return false;
        }
        if (sync) sync.suspenderSincronizacao();
        if (cachePreservado) sync.limparCacheAposLogout();
        else window.alert('Você saiu da conta. Não foi possível criar uma cópia de recuperação; os dados locais e a identificação da conta foram mantidos neste navegador. Não limpe os dados do navegador antes de recuperar as alterações pendentes.');
        window.location.href = 'login.html';
        return true;
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
