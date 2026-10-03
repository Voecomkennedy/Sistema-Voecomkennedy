// Ponte entre a proposta visual e o cadastro autenticado do painel.
// O iframe usa a mesma origem; somente esta página, depois de app:ready, grava dados.
(function () {
    let currentId = null;
    let selectionVersion = 0;
    let ready = false;
    const $ = id => document.getElementById(id);
    const frame = () => $('quadroProposta').contentWindow;
    const whenFrameReady = () => frame()?.restaurarProposta
        ? Promise.resolve(frame())
        : new Promise((resolve, reject) => {
            const iframe = $('quadroProposta');
            iframe.addEventListener('load', () => resolve(frame()), { once: true });
            iframe.addEventListener('error', reject, { once: true });
        });
    const money = value => {
        const raw = String(value || '').replace(/[^\d,.-]/g, '');
        const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
        const n = Number(normalized);
        return Number.isFinite(n) ? n : 0;
    };
    const client = () => StorageManager.getClienteById($('clienteProposta').value);
    const status = message => { $('propostaEstado').textContent = message; };

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

    function mapQuote(d, existing) {
        const n = Number(d.adultos || 0) + Number(d.criancas || 0) + Number(d.bebes || 0);
        const stops = (prefix, count) => Array.from({ length: Math.min(3, Number(count) || 0) }, (_, i) => ({
            cidade: d[i ? `escalaCidade${i + 1}${prefix}` : `escalaCidade${prefix}`] || '',
            tempo: d[i ? `escalaTempo${i + 1}${prefix}` : `escalaTempo${prefix}`] || ''
        }));
        const now = new Date().toISOString();
        return {
            propostaVersao: 1,
            propostaCompleta: JSON.parse(JSON.stringify(d)),
            clienteId: client().id,
            nomeCliente: client().nome,
            adultos: Number(d.adultos || 0), criancas: Number(d.criancas || 0), bebes: Number(d.bebes || 0),
            totalPassageiros: n || 1,
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
            setClientName();
            status('Novo formulário. Salvar criará uma nova cotação.');
        },
        canSave() {
            if (!ready || document.documentElement.dataset.appAutenticado !== 'true') return false;
            if (!client()) { status('Selecione um cliente cadastrado antes de gerar o PDF.'); return false; }
            return true;
        },
        save(d) {
            if (!this.canSave()) throw new Error('Selecione um cliente cadastrado.');
            d.cliente = client().nome;
            const existing = currentId == null ? null : StorageManager.getCotacaoById(currentId);
            if (currentId != null && !existing) throw new Error('Cotação original não encontrada. Reabra a lista antes de salvar.');
            if (existing?.status === 'convertida') throw new Error('Esta cotação já virou venda e não pode ser alterada.');
            const quote = mapQuote(d, existing);
            const saved = existing ? StorageManager.updateCotacao(currentId, quote) : StorageManager.addCotacao(quote);
            if (!saved) throw new Error('Falha ao gravar a cotação.');
            currentId = saved.id;
            CloudSync.agendarBackup();
            status(`Cotação #${saved.id} salva. Confira o indicador de sincronização antes de trocar de aparelho.`);
            carregarCotacoes();
            return saved;
        }
    };
    window.ProposalBridge = bridge;

    window.selecionarClienteProposta = setClientName;
    window.novaPropostaCompleta = function () {
        if (!ready) return;
        selectionVersion++;
        currentId = null;
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
        const version = ++selectionVersion;
        const quote = StorageManager.getCotacaoById(id);
        if (!quote?.propostaCompleta) { abrirModalCotacao(id); return; }
        currentId = quote.id;
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
    window.salvarPropostaCompleta = function () {
        try {
            const d = frame()?.coletarDadosProposta?.();
            if (d) bridge.save(d);
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
        refreshClients();
        $('quadroProposta').addEventListener('load', setClientName);
    });
})();
