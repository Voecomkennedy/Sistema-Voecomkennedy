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
    _revisaoLocal: 0,
    _revisaoConfirmada: 0,
    _falhasConsecutivas: 0,
    _conflitoPendente: null,
    _revisandoConflito: false,

    CHAVES: ['emissao_vendas', 'emissao_pessoas', 'emissao_pacotes', 'emissao_cotacoes'],
    CHAVES_LEGADAS: ['emissao_clientes', 'emissao_fornecedores'],
    CHAVES_CONTEXTO: ['cotacao_para_venda'],
    META_KEY: 'emissao_cloud_sync_meta_v2',
    CONFLITO_KEY: 'emissao_cloud_sync_ultimo_conflito',
    CONFLITOS_KEY: 'emissao_cloud_sync_conflitos_v1',
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

        if (!this._backupPendente) this._atualizarIndicador('sincronizado');
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
                [...this.CHAVES, ...this.CHAVES_CONTEXTO, this.META_KEY, this.CONFLITO_KEY, this.CONFLITOS_KEY],
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
            [...this.CHAVES, ...this.CHAVES_CONTEXTO, this.META_KEY, this.CONFLITO_KEY, this.CONFLITOS_KEY],
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
        this._conflitoPendente = null;
        this._revisandoConflito = false;
        this._falhasConsecutivas = 0;
        this._revisaoLocal = 0;
        this._revisaoConfirmada = 0;
        this._fecharDialogoConflito?.();
    },

    limparCacheAposLogout() {
        this.suspenderSincronizacao();
        [...this.CHAVES, ...this.CHAVES_LEGADAS, ...this.CHAVES_CONTEXTO,
            this.META_KEY, this.CONFLITO_KEY, this.CONFLITOS_KEY, this.USUARIO_LOCAL_KEY]
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

    _textoConteudo(conteudo, canonico = false) {
        const ordenar = valor => {
            if (Array.isArray(valor)) return valor.map(ordenar);
            if (valor && typeof valor === 'object') return Object.fromEntries(Object.keys(valor).sort().map(chave => [chave, ordenar(valor[chave])]));
            return valor;
        };
        const base = Object.fromEntries(
            this.CHAVES.map(chave => [chave, conteudo[chave] || []])
        );
        return JSON.stringify(canonico ? ordenar(base) : base);
    },

    _conteudosIguais(a, b) {
        // JSONB may return object keys in a different order. Critical ack checks
        // compare full canonical content, not a short hash or insertion order.
        return this._textoConteudo(a, true) === this._textoConteudo(b, true);
    },

    _fingerprint(conteudo, canonico = false) {
        const texto = this._textoConteudo(conteudo, canonico);
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
            fingerprintCanonico: this._fingerprint(conteudo, true),
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

    _registrarConflito(captura, local, nuvem, versaoNuvem, atualizadoEm, resolucao = 'pendente', id = null) {
        const anteriores = JSON.parse(localStorage.getItem(this.CONFLITOS_KEY) || '[]');
        if (!Array.isArray(anteriores)) throw new Error('Histórico local de conflitos inválido. Os dados foram mantidos.');
        const ultimoRaw = localStorage.getItem(this.CONFLITO_KEY);
        if (!anteriores.length && ultimoRaw) {
            const ultimo = JSON.parse(ultimoRaw);
            if (ultimo.userId !== this._userId) throw new Error('A cópia anterior pertence a outra conta e precisa ser isolada antes de continuar.');
            anteriores.push(ultimo);
        }
        const registro = {
            id: id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
            detectadoEm: new Date().toISOString(),
            userId: this._userId,
            versaoNuvem,
            atualizadoEm,
            resolucao,
            captura,
            local,
            nuvem
        };
        // Append, verify, then update the legacy pointer. Never evict older copies
        // to make space: inability to preserve must stop the destructive action.
        const serializado = JSON.stringify([...anteriores, registro]);
        localStorage.setItem(this.CONFLITOS_KEY, serializado);
        if (localStorage.getItem(this.CONFLITOS_KEY) !== serializado) throw new Error('A cópia do conflito não foi confirmada.');
        localStorage.setItem(this.CONFLITO_KEY, JSON.stringify(registro));
        return registro;
    },

    _escolherResolucaoConflito() {
        return new Promise(resolve => {
            const painel = document.createElement('div');
            painel.setAttribute('role', 'dialog');
            painel.setAttribute('aria-modal', 'true');
            painel.setAttribute('aria-label', 'Conflito de sincronização');
            painel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0A1931bb;display:grid;place-items:center;padding:24px';
            const conteudo = document.createElement('div');
            conteudo.style.cssText = 'background:#F6FAFD;color:#0A1931;border-radius:12px;padding:24px;max-width:560px';
            const titulo = document.createElement('h2');
            titulo.textContent = 'Há alterações diferentes neste aparelho e na nuvem';
            const texto = document.createElement('p');
            texto.textContent = 'As versões foram preservadas neste navegador. Usar uma versão substitui todos os clientes, vendas e cotações da outra. Você pode revisar depois sem substituir dados.';
            const controles = document.createElement('div');
            controles.className = 'd-flex flex-wrap gap-2';
            const concluir = escolha => {
                painel.remove();
                this._fecharDialogoConflito = null;
                resolve(escolha);
            };
            this._fecharDialogoConflito = () => concluir('depois');
            for (const [escolha, nome] of [
                ['depois', 'Revisar depois'],
                ['nuvem', 'Usar dados da nuvem'],
                ['local', 'Substituir nuvem por estes dados']
            ]) {
                const botao = document.createElement('button');
                botao.type = 'button';
                botao.className = escolha === 'depois' ? 'btn btn-primary' : 'btn btn-outline-secondary';
                botao.textContent = nome;
                botao.dataset.resolucao = escolha;
                botao.addEventListener('click', () => concluir(escolha));
                controles.append(botao);
            }
            // Contain keyboard focus while operational forms await resolution.
            painel.addEventListener('keydown', event => {
                if (event.key === 'Escape') { event.preventDefault(); concluir('depois'); }
                if (event.key === 'Tab') {
                    const botoes = [...controles.querySelectorAll('button')];
                    const atual = botoes.indexOf(document.activeElement);
                    event.preventDefault();
                    botoes[(atual + (event.shiftKey ? -1 : 1) + botoes.length) % botoes.length].focus();
                }
            });
            conteudo.append(titulo, texto, controles);
            painel.append(conteudo);
            document.body.append(painel);
            controles.firstElementChild.focus();
        });
    },

    async _resolverConflito(captura, nuvem, versaoNuvem, atualizadoEm, operacao = this._novaOperacao()) {
        if (!this._operacaoAtual(operacao)) return false;
        this._revisandoConflito = true;
        try {
            this._conflitoPendente = { versaoNuvem };
            this._backupPendente = true;
            clearTimeout(this._salvandoTimeout);
            const local = this._obterConteudoLocal();
            const registro = this._registrarConflito(captura, local, nuvem, versaoNuvem, atualizadoEm);
            this._atualizarIndicador('conflito', 'Há alterações diferentes neste aparelho e na nuvem.');
            const escolha = await this._escolherResolucaoConflito();
            if (!this._operacaoAtual(operacao)) return false;
            const recente = this._obterConteudoLocal();
            if (!this._conteudosIguais(recente, local)) {
                this._registrarConflito(captura, recente, nuvem, versaoNuvem, atualizadoEm, 'alterado-durante-revisao');
                this._atualizarIndicador('conflito', 'Houve outra edição durante a revisão. As versões foram preservadas. Revise novamente.');
                return false;
            }
            if (escolha !== 'nuvem' && escolha !== 'local') {
                this._atualizarIndicador('conflito', 'Dados mantidos. Revise o conflito para retomar o envio.');
                return false;
            }
            this._registrarConflito(captura, local, nuvem, versaoNuvem, atualizadoEm, escolha, registro.id);
            this._versaoNuvem = Number(versaoNuvem) || 0;
            if (escolha === 'nuvem') {
                this._aplicarConteudo(nuvem);
                this._conflitoPendente = null;
                this._confirmarEnvio(nuvem, this._versaoNuvem, atualizadoEm);
                return true;
            }
            this._conflitoPendente = null;
            return await this._enviarConteudo(local, true, operacao);
        } finally {
            if (this._operacaoAtual(operacao)) this._revisandoConflito = false;
        }
    },

    _confirmarEnvio(conteudo, versao, atualizadoEm) {
        this._versaoNuvem = Number(versao) || 0;
        this._salvarMeta(this._versaoNuvem, conteudo, atualizadoEm);
        this._falhasConsecutivas = 0;
        const atualizado = this._conteudosIguais(this._obterConteudoLocal(), conteudo);
        this._backupPendente = !atualizado;
        if (atualizado) {
            clearTimeout(this._salvandoTimeout);
            this._reenviarDepois = false;
            this._revisaoConfirmada = this._revisaoLocal;
            this._atualizarIndicador('sincronizado');
        } else {
            this._reenviarDepois = true;
            this._atualizarIndicador('salvando', 'Há alterações mais recentes aguardando confirmação.');
            if (!this._envioEmAndamento) this._programarEnvio(0);
        }
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
                return await this._enviarConteudo(local, false, operacao);
            }

            const nuvem = data.conteudo || {};
            const versaoNuvem = Number(data.versao) || 0;
            const meta = this._obterMeta();
            const hashLocal = this._fingerprint(local);
            const hashNuvem = this._fingerprint(nuvem);
            this._versaoNuvem = versaoNuvem;

            if (this._conteudosIguais(local, nuvem)) {
                this._salvarMeta(versaoNuvem, nuvem, data.atualizado_em);
                return true;
            }

            if (!this._temRegistros(local)) {
                this._aplicarConteudo(nuvem);
                this._salvarMeta(versaoNuvem, nuvem, data.atualizado_em);
                return true;
            }

            const localNaoMudou = meta && (meta.fingerprintCanonico
                ? this._fingerprint(local, true) === meta.fingerprintCanonico
                : hashLocal === meta.fingerprint);
            const nuvemNaoMudou = meta &&
                versaoNuvem === Number(meta.versao) &&
                (meta.fingerprintCanonico
                    ? this._fingerprint(nuvem, true) === meta.fingerprintCanonico
                    : hashNuvem === meta.fingerprint);

            if (localNaoMudou) {
                this._aplicarConteudo(nuvem);
                this._salvarMeta(versaoNuvem, nuvem, data.atualizado_em);
                return true;
            }

            if (nuvemNaoMudou) {
                return await this._enviarConteudo(local, false, operacao);
            }

            return await this._resolverConflito(local, nuvem, versaoNuvem, data.atualizado_em, operacao);
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
        if (!this._operacaoAtual(operacao)) return false;
        if (!client) throw new Error('A conexão com a nuvem não está disponível. Os dados locais foram mantidos.');

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
            this._confirmarEnvio(conteudo, Number(resposta.data.versao) || proximaVersao, resposta.data.atualizado_em);
            return true;
        }

        const atual = await this._buscarVersaoAtual(operacao);
        if (!this._operacaoAtual(operacao)) return false;
        if (!atual) throw new Error('A nuvem não retornou o registro esperado.');

        // A committed request may have lost its response. Recognize that content
        // instead of publishing it twice or offering an unnecessary overwrite.
        const recente = this._obterConteudoLocal();
        if (this._conteudosIguais(atual.conteudo || {}, recente)) {
            this._confirmarEnvio(recente, atual.versao, atual.atualizado_em);
            return true;
        }
        if (this._conteudosIguais(atual.conteudo || {}, conteudo)) {
            this._confirmarEnvio(conteudo, atual.versao, atual.atualizado_em);
            return true;
        }

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
        if (!this._online || !this._userId || this._conflitoPendente) return false;
        const operacao = this._novaOperacao();

        if (this._envioEmAndamento) {
            this._reenviarDepois = true;
            return this._envioEmAndamento;
        }

        // Read before assigning the promise. A synchronous parse failure inside
        // the async closure would run its finally before assignment, leaving a
        // completed promise stuck as the in-flight operation.
        let conteudo;
        try {
            conteudo = this._obterConteudoLocal();
        } catch (error) {
            if (this._operacaoAtual(operacao)) this._registrarFalhaEnvio(error);
            return false;
        }

        this._envioEmAndamento = (async () => {
            try {
                return await this._enviarConteudo(conteudo, false, operacao);
            } catch (error) {
                if (!this._operacaoAtual(operacao)) return false;
                this._registrarFalhaEnvio(error);
                return false;
            } finally {
                if (this._operacaoAtual(operacao)) {
                    this._envioEmAndamento = null;
                    if (this._reenviarDepois && !this._conflitoPendente) {
                        this._reenviarDepois = false;
                        this._programarEnvio(0);
                    }
                }
            }
        })();

        return this._envioEmAndamento;
    },

    _registrarFalhaEnvio(error) {
        console.error('Erro ao enviar para a nuvem:', error);
        this._backupPendente = true;
        this._atualizarIndicador('erro', error.message);
        this._falhasConsecutivas++;
        // Bounded retries. A pending conflict never triggers a write by
        // reconnecting or by closing the page.
        if (!this._conflitoPendente && this._falhasConsecutivas <= 3) {
            this._programarEnvio(2000 * (2 ** (this._falhasConsecutivas - 1)));
        }
    },

    agendarBackup(atraso = 1500) {
        if (!this._online || this._aplicandoNuvem) return;
        this._revisaoLocal++;
        this._backupPendente = true;
        if (this._conflitoPendente) {
            this._atualizarIndicador('conflito', 'Há alterações locais aguardando revisão do conflito.');
            return;
        }
        this._atualizarIndicador('salvando');
        this._programarEnvio(atraso);
    },

    _programarEnvio(atraso) {
        if (!this._online || this._conflitoPendente) return;
        clearTimeout(this._salvandoTimeout);
        const operacao = this._novaOperacao();
        this._salvandoTimeout = setTimeout(() => {
            if (this._operacaoAtual(operacao)) this.enviarParaNuvem();
        }, atraso);
    },

    async tentarNovamente() {
        if (!this._online || !this._userId) return false;
        if (this._revisandoConflito) return false;
        if (this._conflitoPendente) {
            if (this._envioEmAndamento) return false;
            const operacao = this._novaOperacao();
            try {
                const atual = await this._buscarVersaoAtual(operacao);
                if (!this._operacaoAtual(operacao) || !atual) return false;
                return await this._resolverConflito(this._obterConteudoLocal(), atual.conteudo || {}, atual.versao, atual.atualizado_em, operacao);
            } catch (error) {
                if (this._operacaoAtual(operacao)) this._registrarFalhaEnvio(error);
                return false;
            }
        }
        this._falhasConsecutivas = 0;
        return this.enviarParaNuvem();
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
        window.addEventListener('online', () => {
            if (this._backupPendente && !this._conflitoPendente) this._programarEnvio(0);
        });
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
        el.setAttribute('aria-live', 'polite');
        if (estado === 'erro' || estado === 'conflito') {
            const tentar = document.createElement('button');
            tentar.type = 'button';
            tentar.className = 'btn btn-sm btn-outline-secondary ms-2';
            tentar.textContent = this._conflitoPendente ? 'Revisar conflito' : 'Tentar novamente';
            tentar.addEventListener('click', async () => {
                tentar.disabled = true;
                try { await this.tentarNovamente(); }
                finally { tentar.disabled = false; }
            });
            el.append(tentar);
        }
    }
};

window.CloudSync = CloudSync;
