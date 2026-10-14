(function () {
    const $ = id => document.getElementById(id);
    let versions = [], preview = null, offset = 0, loading = false;
    const message = text => { $('historyStatus').textContent = text; };
    const clearPreview = () => { preview = null; $('recoveryPreview').hidden = true; };
    function render() {
        const chosen = $('historyVersion').value;
        $('historyVersion').replaceChildren(new Option('Selecione uma versão', ''));
        versions.forEach((item, i) => $('historyVersion').add(new Option(item.label, String(i))));
        $('historyVersion').value = chosen;
    }
    async function loadRemote() {
        if (loading) return;
        loading = true; $('moreHistory').disabled = true;
        const owner = IntegrityStore.owner, generation = IntegrityStore.generation;
        try {
            const { data, error } = await getSupabaseClient().from('dados_app_historico')
                .select('operacao_id,versao_antes,versao_depois,conteudo_antes,conteudo_depois,criado_em')
                .eq('user_id', owner).order('versao_depois', { ascending: false }).range(offset, offset + 49);
            IntegrityStore._check(owner, generation);
            if (error) throw error;
            for (const row of data || []) {
                if (row.conteudo_depois) versions.push({ label: `Nuvem: versão ${row.versao_depois} · ${row.criado_em || ''}`, body: row.conteudo_depois });
                if (row.conteudo_antes) versions.push({ label: `Nuvem: anterior à operação ${row.versao_depois} · versão ${row.versao_antes}`, body: row.conteudo_antes });
            }
            offset += (data || []).length;
            $('moreHistory').hidden = (data || []).length < 50;
            render(); message('Selecione uma versão para comparar uma cotação.');
        } catch (cause) {
            message('Não foi possível carregar as versões da nuvem. Tente novamente. As versões deste aparelho continuam disponíveis.');
        } finally { loading = false; $('moreHistory').disabled = false; }
    }
    $('historyVersion').addEventListener('change', () => {
        clearPreview(); $('historyQuote').replaceChildren(new Option('Selecione uma cotação', ''));
        const item = versions[Number($('historyVersion').value)];
        if ($('historyVersion').value !== '') for (const quote of item?.body.emissao_cotacoes || [])
            $('historyQuote').add(new Option(`Cotação #${quote.id} · ${quote.origem || ''} → ${quote.destino || ''}`, String(quote.id)));
        $('previewRecovery').disabled = true;
    });
    $('historyQuote').addEventListener('change', () => { clearPreview(); $('previewRecovery').disabled = !$('historyQuote').value; });
    $('previewRecovery').addEventListener('click', async () => {
        clearPreview();
        try {
            const source = versions[Number($('historyVersion').value)];
            preview = await IntegrityStore.previewQuote(source.body, $('historyQuote').value);
            $('recoveryBefore').textContent = preview.before ? JSON.stringify(preview.before, null, 2) : 'Cotação ausente dos dados atuais.';
            $('recoveryAfter').textContent = JSON.stringify(preview.after, null, 2);
            $('recoveryPreview').hidden = false;
            message('Comparação concluída. Nenhum registro foi alterado.');
        } catch (cause) { message(cause.message); }
    });
    $('applyRecovery').addEventListener('click', async () => {
        const captured = preview;
        if (!captured || !confirm(`Recuperar somente a cotação #${captured.id} como nova revisão?`)) return;
        $('applyRecovery').disabled = true;
        try {
            const saved = await IntegrityStore.restoreQuote(captured);
            clearPreview(); message(`Cotação #${saved.id} recuperada neste aparelho como nova revisão. Confira a confirmação na nuvem.`);
        } catch (cause) { clearPreview(); message(cause.message); }
        finally { $('applyRecovery').disabled = false; }
    });
    $('moreHistory').addEventListener('click', loadRemote);
    AppBootstrap.iniciar(async () => {
        const local = await IntegrityStore.history();
        versions = local.slice().reverse().flatMap(item => [
            { label: `Este aparelho: revisão ${item.revision} · ${item.at}`, body: item.after },
            ...(item.before ? [{ label: `Este aparelho: anterior à revisão ${item.revision} · ${item.at}`, body: item.before }] : [])
        ]);
        render(); await loadRemote();
    });
})();
