// Sincronização com controle otimista de versão.
// O LocalStorage continua sendo o cache rápido, mas uma versão desatualizada
// nunca sobrescreve silenciosamente os dados gravados por outro aparelho.
const CloudSync = {
    _salvandoTimeout: null,
    _userId: null,
    _online: false,
    _monitorando: false,
    _backupPendente: false,
    _aplicandoNuvem: false,
    _versaoNuvem: null,
    _envioEmAndamento: null,
    _reenviarDepois: false,
    _inicializado: false,
    _geracao: 0,

    CHAVES: ['emissao_vendas', 'emissao_pessoas', 'emissao_pacotes', 'emissao_cotacoes'],
    CHAVES_LEGADAS: ['emissao_clientes', 'emissao_fornecedores'],
    CHAVES_CONTEXTO: ['cotacao_para_venda'],
    META_KEY: 'emissao_cloud_sync_meta_v2',
    CONFLITO_KEY: 'emissao_cloud_sync_ultimo_conflito',
    USUARIO_LOCAL_KEY: 'emissao_cloud_sync_usuario_local',
    RECUPERACAO_KEY: 'emissao_cache_recuperacao_v1',

    _novaOperacao() {
        return { geracao: this._geracao, userId: this._userId };
    },

    _operacaoAtual(operacao) {
        return !!operacao.userId && operacao.geracao === this._geracao && operacao.userId === this._userId &&
            localStorage.getItem(this.USUARIO_LOCAL_KEY) === operacao.userId;
    },

    async init() {
        if (this._inicializado) return true;
        const geracao = this._geracao;

        const client = getSupabaseClient();
        if (!client) return false;

        const userId = await Auth.getUserId();
        if (geracao !== this._geracao) return false;
        this._userId = userId;
        if (!this._userId) return false;
        const operacao = this._novaOperacao();

        this._prepararCacheDoUsuario();
        this._online = true;
        const sincronizado = await this.baixarDaNuvem(operacao);
        if (!this._operacaoAtual(operacao)) return false;
        if (sincronizado !== true) {
            this._online = false;
            return false;
        }
        this._monitorarLocalStorage();
        this._registrarSalvamentoDeEmergencia();
        this._inicializado = true;

        this._atualizarIndicador('sincronizado');
        return true;
    },

    _assinaturaRecuperacao(dados) {
        const ordenar = valor => {
            if (Array.isArray(valor)) return valor.map(ordenar);
            if (valor && typeof valor === 'object') return Object.fromEntries(
                Object.keys(valor).sort().map(chave => [chave, ordenar(valor[chave])])
            );
            return valor;
        };
        return JSON.stringify(Object.fromEntries(Object.keys(dados).sort()
            .filter(chave => chave !== this.META_KEY)
            .map(chave => {
                try { return [chave, ordenar(JSON.parse(dados[chave]))]; }
                catch { return [chave, dados[chave]]; }
            })));
    },

    _preservarCache(chaves, motivo, usuarioId = null) {
        const valores = Object.fromEntries(chaves
            .map(chave => [chave, localStorage.getItem(chave)])
            .filter(([, valor]) => valor !== null));
        if (!Object.keys(valores).length) return false;
        const dados = Object.fromEntries(Object.entries(valores).filter(([chave]) => chave !== this.META_KEY));
        // Metadados de sincronização não são registros do usuário e não justificam
        // acumular cópias idênticas a cada mudança de versão/horário na nuvem.
        if (!Object.keys(dados).length) return true;

        // Guarda os valores originais, inclusive JSON inválido, antes de remover
        // qualquer chave. A cópia fica fora das coleções sincronizadas e não é
        // importada automaticamente. Uma falha de espaço mantém o original.
        try {
            const anteriores = JSON.parse(localStorage.getItem(this.RECUPERACAO_KEY) || '[]');
            if (!Array.isArray(anteriores)) throw new Error('Formato de recuperação inválido');
            const conteudo = this._assinaturaRecuperacao(dados);
            if (!anteriores.some(item => item && item.usuarioId === usuarioId && item.dados &&
                this._assinaturaRecuperacao(item.dados) === conteudo)) {
                const copia = { criadoEm: new Date().toISOString(), usuarioId, motivo, dados,
                    metadados: valores[this.META_KEY] ? { sincronizacao: valores[this.META_KEY] } : {} };
                const serializado = JSON.stringify([...anteriores, copia]);
                localStorage.setItem(this.RECUPERACAO_KEY, serializado);
                if (localStorage.getItem(this.RECUPERACAO_KEY) !== serializado) throw new Error('Cópia não confirmada');
            }
            return true;
        } catch {
            const erro = new Error('Não foi possível preservar os dados locais para recuperação. Os dados originais foram mantidos.');
            erro.code = 'CACHE_RECOVERY_FAILED';
            throw erro;
        }
    },

    _isolarCache(chaves, motivo, usuarioId = null) {
        if (!this._preservarCache(chaves, motivo, usuarioId)) return;
        chaves.forEach(chave => localStorage.removeItem(chave));
        this._cacheIsolado = true;
    },

    _prepararCacheDoUsuario() {
        const usuarioAnterior = localStorage.getItem(this.USUARIO_LOCAL_KEY);
        if (usuarioAnterior !== this._userId) {
            // Sem dono conhecido, também não é seguro atribuir a base à conta
            // que acabou de entrar. Preservar antes de liberar o cache operacional.
            this._isolarCache(
                [...this.CHAVES, ...this.CHAVES_CONTEXTO, this.META_KEY, this.CONFLITO_KEY],
                usuarioAnterior ? 'troca-de-conta' : 'cache-sem-dono',
                usuarioAnterior || null
            );
        }
        // Nem mesmo um dono atual conhecido comprova a origem destas chaves:
        // versões antigas deixavam o legado de outras contas no navegador.
        this._isolarCache(this.CHAVES_LEGADAS, 'legado-sem-dono');
        localStorage.setItem(this.USUARIO_LOCAL_KEY, this._userId);
    },

    preservarCacheParaLogout() {
        const usuarioId = localStorage.getItem(this.USUARIO_LOCAL_KEY) || null;
        this._preservarCache(
            [...this.CHAVES, ...this.CHAVES_CONTEXTO, this.META_KEY, this.CONFLITO_KEY],
            'saida-da-conta', usuarioId
        );
        this._preservarCache(this.CHAVES_LEGADAS, 'legado-sem-dono');
    },

    suspenderSincronizacao() {
        // As respostas já em trânsito também perdem autorização para tocar o cache.
        this._geracao++;
        clearTimeout(this._salvandoTimeout);
        this._online = false;
        this._inicializado = false;
        this._userId = null;
        this._versaoNuvem = null;
        this._envioEmAndamento = null;
        this._reenviarDepois = false;
        this._backupPendente = false;
    },

    limparCacheAposLogout() {
        this.suspenderSincronizacao();
        [...this.CHAVES, ...this.CHAVES_LEGADAS, ...this.CHAVES_CONTEXTO,
            this.META_KEY, this.CONFLITO_KEY, this.USUARIO_LOCAL_KEY]
            .forEach(chave => localStorage.removeItem(chave));
    },

    mostrarAvisoRecuperacao() {
        if (!this._cacheIsolado || document.getElementById('avisoRecuperacaoLocal')) return;
        const aviso = document.createElement('div');
        aviso.id = 'avisoRecuperacaoLocal';
        aviso.className = 'alert alert-warning m-3';
        aviso.setAttribute('role', 'status');
        aviso.textContent = 'Dados antigos deste navegador foram preservados em uma cópia local separada e não foram importados para esta conta. Não limpe os dados do navegador antes de revisar a recuperação.';
        document.body.prepend(aviso);
    },

    _obterConteudoLocal() {
        const conteudo = {};
        this.CHAVES.forEach(chave => {
            const raw = localStorage.getItem(chave);
            const valor = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(valor)) throw new Error(`Dados locais inválidos em ${chave}`);
            conteudo[chave] = valor;
        });
        return conteudo;
    },

    _temRegistros(conteudo) {
        return this.CHAVES.some(chave => Array.isArray(conteudo[chave]) && conteudo[chave].length > 0);
    },

    _fingerprint(conteudo) {
        const texto = JSON.stringify(Object.fromEntries(
            this.CHAVES.map(chave => [chave, conteudo[chave] || []])
        ));
        let hash = 2166136261;
        for (let i = 0; i < texto.length; i++) {
            hash ^= texto.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return `${texto.length}:${(hash >>> 0).toString(16)}`;
    },

    _obterMeta() {
        try {
            const meta = JSON.parse(localStorage.getItem(this.META_KEY) || 'null');
            return meta && meta.userId === this._userId ? meta : null;
        } catch {
            return null;
        }
    },

    _salvarMeta(versao, conteudo, atualizadoEm = null) {
        localStorage.setItem(this.META_KEY, JSON.stringify({
            userId: this._userId,
            versao: Number(versao) || 0,
            fingerprint: this._fingerprint(conteudo),
            atualizadoEm: atualizadoEm || new Date().toISOString()
        }));
    },

    _aplicarConteudo(conteudo) {
        this._aplicandoNuvem = true;
        try {
            this.CHAVES.forEach(chave => {
                const valor = conteudo[chave] === undefined ? [] : conteudo[chave];
                if (!Array.isArray(valor)) {
                    throw new Error(`Dados da nuvem inválidos em ${chave}`);
                }
                localStorage.setItem(chave, JSON.stringify(valor));
            });
        } finally {
            this._aplicandoNuvem = false;
        }
    },

    _registrarConflito(local, nuvem, versaoNuvem, atualizadoEm, resolucao = 'pendente') {
        localStorage.setItem(this.CONFLITO_KEY, JSON.stringify({
            detectadoEm: new Date().toISOString(),
            userId: this._userId,
            versaoNuvem,
            atualizadoEm,
            resolucao,
            local,
            nuvem
        }));
    },

    async _resolverConflito(local, nuvem, versaoNuvem, atualizadoEm, operacao = this._novaOperacao()) {
        if (!this._operacaoAtual(operacao)) return false;
        this._registrarConflito(local, nuvem, versaoNuvem, atualizadoEm);
        this._atualizarIndicador('conflito', 'Há alterações diferentes neste aparelho e na nuvem.');

        const usarNuvem = window.confirm(
            'CONFLITO DE SINCRONIZAÇÃO\n\n' +
            'Outro aparelho alterou os dados enquanto este aparelho também tinha mudanças.\n\n' +
            'OK: usar a versão da NUVEM (uma cópia local ficará guardada).\n' +
            'CANCELAR: manter os dados DESTE APARELHO e substituir a nuvem.\n\n' +
            'Nenhuma opção apaga a cópia de segurança do conflito.'
        );

        if (!this._operacaoAtual(operacao)) return false;
        this._versaoNuvem = Number(versaoNuvem) || 0;
        if (usarNuvem) {
            this._registrarConflito(local, nuvem, versaoNuvem, atualizadoEm, 'nuvem');
            this._aplicarConteudo(nuvem);
            this._salvarMeta(this._versaoNuvem, nuvem, atualizadoEm);
            this._backupPendente = false;
            this._atualizarIndicador('sincronizado');
            return true;
        }

        this._registrarConflito(local, nuvem, versaoNuvem, atualizadoEm, 'local');
        return this._enviarConteudo(local, true, operacao);
    },

    async baixarDaNuvem(operacao = this._novaOperacao()) {
        const client = getSupabaseClient();
        if (!client || !this._operacaoAtual(operacao)) return false;

        try {
            const { data, error } = await client
                .from('dados_app')
                .select('conteudo, atualizado_em, versao')
                .eq('user_id', operacao.userId)
                .maybeSingle();

            if (!this._operacaoAtual(operacao)) return false;
            if (error) throw error;

            const local = this._obterConteudoLocal();
            if (!data) {
                this._versaoNuvem = null;
                return this._enviarConteudo(local, false, operacao);
            }

            const nuvem = data.conteudo || {};
            const versaoNuvem = Number(data.versao) || 0;
            const meta = this._obterMeta();
            const hashLocal = this._fingerprint(local);
            const hashNuvem = this._fingerprint(nuvem);
            this._versaoNuvem = versaoNuvem;

            if (hashLocal === hashNuvem) {
                this._salvarMeta(versaoNuvem, nuvem, data.atualizado_em);
                return true;
            }

            if (!this._temRegistros(local)) {
                this._aplicarConteudo(nuvem);
                this._salvarMeta(versaoNuvem, nuvem, data.atualizado_em);
                return true;
            }

            const localNaoMudou = meta && hashLocal === meta.fingerprint;
            const nuvemNaoMudou = meta &&
                versaoNuvem === Number(meta.versao) &&
                hashNuvem === meta.fingerprint;

            if (localNaoMudou) {
                this._aplicarConteudo(nuvem);
                this._salvarMeta(versaoNuvem, nuvem, data.atualizado_em);
                return true;
            }

            if (nuvemNaoMudou) {
                return this._enviarConteudo(local, false, operacao);
            }

            return this._resolverConflito(local, nuvem, versaoNuvem, data.atualizado_em, operacao);
        } catch (error) {
            if (!this._operacaoAtual(operacao)) return false;
            console.error('Erro ao baixar da nuvem:', error);
            this._atualizarIndicador('erro', error.message);
            return false;
        }
    },

    async _buscarVersaoAtual(operacao = this._novaOperacao()) {
        if (!this._operacaoAtual(operacao)) return null;
        const client = getSupabaseClient();
        const { data, error } = await client
            .from('dados_app')
            .select('conteudo, atualizado_em, versao')
            .eq('user_id', operacao.userId)
            .maybeSingle();
        if (!this._operacaoAtual(operacao)) return null;
        if (error) throw error;
        return data;
    },

    async _enviarConteudo(conteudo, confirmouSobrescrita = false, operacao = this._novaOperacao()) {
        const client = getSupabaseClient();
        if (!client || !this._operacaoAtual(operacao)) return false;

        const proximaVersao = (Number(this._versaoNuvem) || 0) + 1;
        const registro = {
            user_id: operacao.userId,
            conteudo,
            versao: proximaVersao,
            atualizado_em: new Date().toISOString()
        };

        let resposta;
        if (this._versaoNuvem === null) {
            resposta = await client
                .from('dados_app')
                .insert(registro)
                .select('versao, atualizado_em')
                .maybeSingle();
        } else {
            resposta = await client
                .from('dados_app')
                .update(registro)
                .eq('user_id', operacao.userId)
                .eq('versao', this._versaoNuvem)
                .select('versao, atualizado_em')
                .maybeSingle();
        }

        if (!this._operacaoAtual(operacao)) return false;
        if (resposta.error) {
            if (resposta.error.code !== '23505') throw resposta.error;
        } else if (resposta.data) {
            this._versaoNuvem = Number(resposta.data.versao) || proximaVersao;
            this._salvarMeta(this._versaoNuvem, conteudo, resposta.data.atualizado_em);
            this._backupPendente = false;
            this._atualizarIndicador('sincronizado');
            return true;
        }

        const atual = await this._buscarVersaoAtual(operacao);
        if (!this._operacaoAtual(operacao)) return false;
        if (!atual) throw new Error('A nuvem não retornou o registro esperado.');

        if (confirmouSobrescrita) {
            // Outro conflito aconteceu enquanto a escolha anterior era aplicada.
            // Volta ao fluxo assistido em vez de insistir automaticamente.
            confirmouSobrescrita = false;
        }
        return this._resolverConflito(
            conteudo,
            atual.conteudo || {},
            Number(atual.versao) || 0,
            atual.atualizado_em,
            operacao
        );
    },

    async enviarParaNuvem() {
        if (!this._online || !this._userId) return false;
        const operacao = this._novaOperacao();

        if (this._envioEmAndamento) {
            this._reenviarDepois = true;
            return this._envioEmAndamento;
        }

        this._envioEmAndamento = (async () => {
            try {
                return await this._enviarConteudo(this._obterConteudoLocal(), false, operacao);
            } catch (error) {
                if (!this._operacaoAtual(operacao)) return false;
                console.error('Erro ao enviar para a nuvem:', error);
                this._atualizarIndicador('erro', error.message);
                return false;
            } finally {
                if (this._operacaoAtual(operacao)) {
                    this._envioEmAndamento = null;
                    if (this._reenviarDepois) {
                        this._reenviarDepois = false;
                        this.agendarBackup(0);
                    }
                }
            }
        })();

        return this._envioEmAndamento;
    },

    agendarBackup(atraso = 1500) {
        if (!this._online || this._aplicandoNuvem) return;
        this._backupPendente = true;
        this._atualizarIndicador('salvando');
        clearTimeout(this._salvandoTimeout);
        const operacao = this._novaOperacao();
        this._salvandoTimeout = setTimeout(() => {
            if (this._operacaoAtual(operacao)) this.enviarParaNuvem();
        }, atraso);
    },

    _monitorarLocalStorage() {
        if (this._monitorando) return;
        const originalSetItem = localStorage.setItem.bind(localStorage);
        const self = this;

        localStorage.setItem = function (chave, valor) {
            originalSetItem(chave, valor);
            if (!self._aplicandoNuvem && self.CHAVES.includes(chave)) {
                self.agendarBackup();
            }
        };
        this._monitorando = true;
        try { localStorage.removeItem('_cloudSyncAtivo'); } catch (_) {}
    },

    _registrarSalvamentoDeEmergencia() {
        if (this._eventosEmergenciaRegistrados) return;
        this._eventosEmergenciaRegistrados = true;

        const tentarSalvar = () => {
            if (!this._backupPendente) return;
            clearTimeout(this._salvandoTimeout);
            this.enviarParaNuvem();
        };
        window.addEventListener('beforeunload', tentarSalvar);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') tentarSalvar();
        });
    },

    _atualizarIndicador(estado, detalhe = '') {
        const el = document.getElementById('cloudStatus');
        if (!el) return;

        const mapa = {
            salvando: { icon: 'bi-cloud-arrow-up', texto: 'Salvando...', cor: '#F59E0B' },
            sincronizado: { icon: 'bi-cloud-check', texto: 'Salvo na nuvem', cor: '#10B981' },
            conflito: { icon: 'bi-exclamation-triangle', texto: 'Conflito de sincronização', cor: '#DC2626' },
            erro: { icon: 'bi-cloud-slash', texto: 'Erro ao salvar na nuvem', cor: '#EF4444' }
        };
        const info = mapa[estado] || mapa.sincronizado;

        el.replaceChildren();
        const icon = document.createElement('i');
        icon.className = `bi ${info.icon}`;
        el.append(icon, document.createTextNode(` ${info.texto}`));
        el.style.color = info.cor;
        el.title = detalhe ? `Detalhe: ${detalhe}` : '';
    }
};

window.CloudSync = CloudSync;
