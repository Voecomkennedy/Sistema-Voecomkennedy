// Ponte entre a proposta visual e o cadastro autenticado do painel.
// O iframe usa a mesma origem; somente esta página, depois de app:ready, grava dados.
(function () {
    let currentId = null;
    let currentBase = null;
    let selectionVersion = 0;
    let ready = false;
    let saving = false;
    const $ = id => document.getElementById(id);
    const frame = () => $('quadroProposta').contentWindow;
    const whenFrameReady = () => frame()?.restaurarProposta
        ? Promise.resolve(frame())
        : new Promise((resolve, reject) => {
            const iframe = $('quadroProposta');
            const timeout = setTimeout(() => { iframe.removeEventListener('load', check); reject(new Error('Editor não carregou.')); }, 15000);
            const check = () => {
                if (!frame()?.restaurarProposta) return;
                clearTimeout(timeout);
                iframe.removeEventListener('load', check);
                resolve(frame());
            };
            iframe.addEventListener('load', check);
        });
    const money = value => {
        const raw = String(value || '').replace(/[^\d,.-]/g, '');
        const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
        const n = Number(normalized);
        return Number.isFinite(n) ? n : 0;
    };
    const client = () => StorageManager.getClienteById($('clienteProposta').value);
    const status = message => { $('propostaEstado').textContent = message; };
    const fingerprint = value => JSON.stringify(value, function (key, item) {
        return item && !Array.isArray(item) && typeof item === 'object'
            ? Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]])) : item;
    });
    const showMode = quote => {
        const modo = $('propostaModo');
        if (modo) modo.textContent = quote ? `Editando cotação #${quote.id}, revisão ${quote.propostaRevisao || 1}` : 'Nova cotação';
        const botao = $('salvarPropostaCompleta');
        if (botao) botao.textContent = quote ? 'Salvar alterações' : 'Salvar cotação';
    };

    window.ProposalMetrics = {
        monthly(quotes, now = new Date()) {
            const seen = new Set();
            const monthly = (quotes || []).filter(q => {
                const when = new Date(q.dataCriacao || q.dataCadastro || '');
                if (Number.isNaN(when.getTime()) || when.getFullYear() !== now.getFullYear() || when.getMonth() !== now.getMonth()) return false;
                if (q.id != null) {
                    const key = String(q.id);
                    if (seen.has(key)) return false;
                    seen.add(key);
                }
                return true;
            });
            const converted = monthly.filter(q => q.status === 'convertida').length;
            return { total: monthly.length, converted, percent: monthly.length ? Math.round(100 * converted / monthly.length) : 0 };
        }
    };

    function refreshClients() {
        const select = $('clienteProposta');
        const selected = select.value;
        select.replaceChildren(new Option('Selecione um cliente', ''));
        StorageManager.getClientes().slice().sort((a, b) =>
            (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
        ).forEach(c => select.add(new Option(c.nome, c.id)));
        select.value = selected;
    }

    function setClientName() {
        const input = frame()?.document.getElementById('p-cliente');
        if (input) input.value = client()?.nome || '';
    }

    function mapQuote(d, existing, contact) {
        const n = Number(d.adultos || 0) + Number(d.criancas || 0) + Number(d.bebes || 0);
        const stops = (prefix, count) => Array.from({ length: Math.min(3, Number(count) || 0) }, (_, i) => ({
            cidade: d[i ? `escalaCidade${i + 1}${prefix}` : `escalaCidade${prefix}`] || '',
            tempo: d[i ? `escalaTempo${i + 1}${prefix}` : `escalaTempo${prefix}`] || ''
        }));
        const now = new Date().toISOString();
        return {
            propostaVersao: 1,
            propostaRevisao: (Number(existing?.propostaRevisao) || 0) + 1,
            propostaCompleta: JSON.parse(JSON.stringify(d)),
            clienteId: contact.id,
            nomeCliente: contact.nome,
            adultos: Number(d.adultos || 0), criancas: Number(d.criancas || 0), bebes: Number(d.bebes || 0),
            totalPassageiros: n || 1,
            totalPagantes: d.totalPagantes ?? null, paxTarifaBase: d.paxTarifaBase ?? null,
            origem: d.orig || '', destino: d.dest || '',
            companhiaAerea: d.cia || '', tipoTarifa: d.classe || '',
            tipoViagem: d.somenteIda ? 'so-ida' : 'ida-volta',
            linkCompanhia: d.linkAereo || '',
            dataSaidaIda: d.dataIdaISO || '', horaSaidaIda: d.depIda || '',
            dataChegadaIda: d.timing?.fields?.['p-data-chegada-ida'] || '', horaChegadaIda: d.chegIda || '',
            tempoTotalIda: d.durIda || '', temConexaoIda: d.paradaIda === 'direto' ? 'direto' : String(parseInt(d.paradaIda, 10) || 0),
            paradasIda: stops('Ida', parseInt(d.paradaIda, 10)),
            dataSaidaVolta: d.somenteIda ? '' : (d.dataVoltaISO || ''), horaSaidaVolta: d.depVolta || '',
            dataChegadaVolta: d.timing?.fields?.['p-data-chegada-volta'] || '', horaChegadaVolta: d.chegVolta || '',
            tempoTotalVolta: d.durVolta || '', temConexaoVolta: d.paradaVolta === 'direto' ? 'direto' : String(parseInt(d.paradaVolta, 10) || 0),
            paradasVolta: stops('Volta', parseInt(d.paradaVolta, 10)),
            valorPorPessoa: money(d.valPix), valorTotalPix: money(d.valTotalPix),
            numParcelas: Number(d.parcelas || 1), valorParcela: money(d.valParcela),
            totalParcelado: money(d.valCartaoFinal),
            observacao: d.obs || '', bagagemIncluida: d.bagMao || '',
            status: existing?.status || 'aberta',
            dataCriacao: existing?.dataCriacao || now,
            dataAtualizacao: now
        };
    }

    const bridge = {
        afterReset() {
            selectionVersion++;
            currentId = null;
            currentBase = null;
            showMode(null);
            setClientName();
            status('Novo formulário. Salvar criará uma nova cotação.');
        },
        canSave() {
            if (!ready || document.documentElement.dataset.appAutenticado !== 'true') return false;
            if (!client()) { status('Selecione um cliente cadastrado antes de gerar o PDF.'); return false; }
            return true;
        },
        save(d) {
            if (saving) throw new Error('Aguarde a gravação atual terminar antes de salvar novamente.');
            if (!this.canSave()) throw new Error('Selecione um cliente cadastrado.');
            const contact = { ...client() };
            const snapshot = JSON.parse(JSON.stringify(d));
            snapshot.cliente = contact.nome;
            const existing = currentId == null ? null : StorageManager.getCotacaoById(currentId);
            if (currentId != null && !existing) throw new Error('Cotação original não encontrada. Reabra a lista antes de salvar.');
            if (existing?.status === 'convertida') throw new Error('Esta cotação já virou venda e não pode ser alterada.');
            if (existing && currentBase && fingerprint(existing) !== currentBase) throw new Error('A cotação mudou em outra tela. Reabra a versão atual antes de salvar alterações.');
            const quote = mapQuote(snapshot, existing, contact);
            const version = selectionVersion;
            const finish = saved => {
                if (!saved) throw new Error('Falha ao gravar a cotação.');
                if (version === selectionVersion) {
                    currentId = saved.id;
                    currentBase = fingerprint(saved);
                    showMode(saved);
                }
                try { CloudSync.agendarBackup(); }
                catch (_) {
                    // The proposal is already committed. A scheduler failure
                    // leaves cloud confirmation pending, but must allow its PDF.
                    CloudSync._backupPendente = true;
                    try { CloudSync._atualizarIndicador?.('erro', 'Cotação salva neste aparelho. Não foi possível agendar o envio.'); } catch (_) {}
                }
                status(`Cotação #${saved.id}, revisão ${saved.propostaRevisao}, salva neste aparelho. A confirmação na nuvem aparece no indicador de sincronização.`);
                carregarCotacoes();
                return saved;
            };
            const stored = existing ? StorageManager.gravar('updateCotacao', [currentId, quote], { expectedRecord: existing })
                : StorageManager.gravar('addCotacao', [quote]);
            if (!stored?.then) return finish(stored);
            saving = true;
            return stored.then(finish).finally(() => { saving = false; });
        }
    };
    window.ProposalBridge = bridge;

    window.selecionarClienteProposta = setClientName;
    window.selecionarContatoProposta = function (id) {
        if (!ready || document.documentElement.dataset.appAutenticado !== 'true') return false;
        const contact = StorageManager.getClientes().find(c => String(c.id) === String(id));
        if (!contact) return false;
        refreshClients();
        $('clienteProposta').value = contact.id;
        setClientName();
        return true;
    };
    window.novaPropostaCompleta = function () {
        if (!ready) return;
        window.reiniciarCadastroContatoProposta?.();
        selectionVersion++;
        currentId = null;
        currentBase = null;
        showMode(null);
        refreshClients();
        $('clienteProposta').value = '';
        $('editorProposta').open = true;
        frame()?.limparProposta?.();
        setClientName();
        status('Nova proposta. Selecione o cliente e preencha os dados.');
        $('editorProposta').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.editarPropostaCompleta = async function (id) {
        if (!ready) return;
        window.reiniciarCadastroContatoProposta?.();
        const version = ++selectionVersion;
        const quote = StorageManager.getCotacaoById(id);
        if (!quote?.propostaCompleta) { abrirModalCotacao(id); return; }
        currentId = quote.id;
        currentBase = fingerprint(quote);
        showMode(quote);
        refreshClients();
        $('clienteProposta').value = quote.clienteId || '';
        $('editorProposta').open = true;
        const editor = await whenFrameReady();
        if (version !== selectionVersion) return;
        editor.restaurarProposta(quote.propostaCompleta);
        setClientName();
        status(`Editando cotação #${quote.id}.`);
        $('editorProposta').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.salvarPropostaCompleta = async function () {
        try {
            const version = selectionVersion;
            const editor = await whenFrameReady();
            if (version !== selectionVersion) { status('O formulário mudou. Salve a proposta que está aberta agora.'); return; }
            const d = editor.coletarDadosProposta();
            if (d) await bridge.save(d);
        } catch (error) { status(error.message); }
    };
    window.baixarPDFProposta = async function (id) {
        const quote = StorageManager.getCotacaoById(id);
        if (!quote?.propostaCompleta) return;
        $('editorProposta').open = true;
        const iframe = await whenFrameReady();
        try {
            const ok = await iframe.abrirProposta(quote.propostaCompleta);
            if (!ok) status('Não foi possível baixar o PDF. Tente novamente.');
        } catch (error) { status('Erro ao baixar o PDF: ' + error.message); }
    };
    window.addEventListener('message', event => {
        if (event.origin !== location.origin || event.source !== frame() || event.data?.type !== 'vck-proposal-height') return;
        $('quadroProposta').style.height = Math.min(Math.max(Number(event.data.height) + 30, 800), 12000) + 'px';
    });
    document.addEventListener('app:ready', () => {
        ready = true;
        showMode(null);
        refreshClients();
        $('quadroProposta').addEventListener('load', setClientName);
        $('quadroProposta').src = $('quadroProposta').dataset.src;
    });
})();
