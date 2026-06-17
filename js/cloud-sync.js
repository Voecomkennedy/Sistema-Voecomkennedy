// ============================================
// Sincronização com a Nuvem (Caminho Híbrido)
// ============================================
// Mantém o LocalStorage rápido (como hoje), mas:
//   1) Ao logar / abrir o app: BAIXA os dados da nuvem para o LocalStorage.
//   2) A cada alteração: ENVIA (faz backup) dos dados para a nuvem.
// Cada usuário (agência) só enxerga os próprios dados (protegido por RLS).

const CloudSync = {
    _salvandoTimeout: null,
    _userId: null,
    _online: false,
    _monitorando: false,
    _backupPendente: false,

    // Chaves do LocalStorage que serão sincronizadas
    CHAVES: ['emissao_vendas', 'emissao_pessoas', 'emissao_pacotes', 'emissao_cotacoes'],

    // Inicializa: baixa os dados da nuvem e começa a monitorar alterações
    async init() {
        const client = getSupabaseClient();
        if (!client) return;

        this._userId = await Auth.getUserId();
        if (!this._userId) return;

        this._online = true;

        // 1) Baixar dados da nuvem para o LocalStorage
        await this.baixarDaNuvem();

        // 2) Interceptar gravações no LocalStorage para disparar backup automático
        this._monitorarLocalStorage();

        // 3) Atualizar indicador visual de status (se existir na página)
        this._atualizarIndicador('sincronizado');

        // 4) Salvamento de emergência ao fechar/trocar de página:
        //    se ainda havia um backup pendente (debounce não disparou), envia agora.
        const self = this;
        window.addEventListener('beforeunload', () => {
            if (self._backupPendente) {
                clearTimeout(self._salvandoTimeout);
                self._backupPendente = false;
                // envio síncrono (não usa await pois a página vai fechar)
                self.enviarParaNuvem();
            }
        });
        // Também salva quando a aba fica oculta (celular: trocar de app)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && self._backupPendente) {
                clearTimeout(self._salvandoTimeout);
                self._backupPendente = false;
                self.enviarParaNuvem();
            }
        });
    },

    // Baixa o "documento" do usuário na nuvem e popula o LocalStorage
    async baixarDaNuvem() {
        const client = getSupabaseClient();
        if (!client || !this._userId) return;

        try {
            const { data, error } = await client
                .from('dados_app')
                .select('conteudo, atualizado_em')
                .eq('user_id', this._userId)
                .maybeSingle();

            if (error) {
                console.error('❌ Erro ao BAIXAR da nuvem:', error);
                this._atualizarIndicador('erro', error.message);
                return;
            }

            if (data && data.conteudo) {
                const conteudo = data.conteudo;
                this.CHAVES.forEach(chave => {
                    if (conteudo[chave] !== undefined) {
                        localStorage.setItem(chave, JSON.stringify(conteudo[chave]));
                    }
                });
                console.log('✓ Dados carregados da nuvem.');
            } else {
                // Primeira vez: sobe o que houver no LocalStorage
                console.log('Nenhum dado na nuvem ainda. Enviando dados locais (se houver).');
                await this.enviarParaNuvem();
            }
        } catch (e) {
            console.warn('Falha ao baixar da nuvem:', e);
        }
    },

    // Envia (faz backup) de todos os dados locais para a nuvem
    async enviarParaNuvem() {
        const client = getSupabaseClient();
        if (!client || !this._userId) return;

        try {
            const conteudo = {};
            this.CHAVES.forEach(chave => {
                const raw = localStorage.getItem(chave);
                conteudo[chave] = raw ? JSON.parse(raw) : [];
            });

            const { error } = await client
                .from('dados_app')
                .upsert({
                    user_id: this._userId,
                    conteudo: conteudo,
                    atualizado_em: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (error) {
                console.error('❌ Erro ao ENVIAR para a nuvem:', error);
                this._atualizarIndicador('erro', error.message);
            } else {
                console.log('✓ Dados salvos na nuvem.');
                this._atualizarIndicador('sincronizado');
            }
        } catch (e) {
            console.error('❌ Falha ao enviar para a nuvem:', e);
            this._atualizarIndicador('erro', e.message);
        }
    },

    // Agenda um backup (espera 1,5s após a última alteração para não enviar a cada tecla)
    agendarBackup() {
        if (!this._online) return;
        this._backupPendente = true;
        this._atualizarIndicador('salvando');
        clearTimeout(this._salvandoTimeout);
        this._salvandoTimeout = setTimeout(() => {
            this._backupPendente = false;
            this.enviarParaNuvem();
        }, 1500);
    },

    // Substitui o setItem padrão para detectar mudanças nas chaves do app
    _monitorarLocalStorage() {
        // Usa variável de MEMÓRIA (não localStorage) — evita travar na 2ª visita
        if (this._monitorando) return;
        const originalSetItem = localStorage.setItem.bind(localStorage);
        const self = this;

        localStorage.setItem = function (chave, valor) {
            originalSetItem(chave, valor);
            if (self.CHAVES.includes(chave)) {
                self.agendarBackup();
            }
        };
        this._monitorando = true;

        // Limpa resíduo antigo da versão bugada (se existir)
        try { localStorage.removeItem('_cloudSyncAtivo'); } catch (e) {}
    },

    // Atualiza um indicador visual de status (se existir o elemento #cloudStatus)
    _atualizarIndicador(estado, detalhe) {
        const el = document.getElementById('cloudStatus');
        if (!el) return;

        const mapa = {
            salvando:     { icon: 'bi-cloud-arrow-up', texto: 'Salvando...', cor: '#F59E0B' },
            sincronizado: { icon: 'bi-cloud-check',    texto: 'Salvo na nuvem', cor: '#10B981' },
            erro:         { icon: 'bi-cloud-slash',    texto: 'ERRO ao salvar na nuvem!', cor: '#EF4444' }
        };
        const info = mapa[estado] || mapa.sincronizado;
        el.innerHTML = `<i class="bi ${info.icon}"></i> ${info.texto}`;
        el.style.color = info.cor;
        // Mostra o detalhe do erro ao passar o mouse (ajuda no diagnóstico)
        el.title = detalhe ? ('Detalhe: ' + detalhe) : '';
    }
};

window.CloudSync = CloudSync;
