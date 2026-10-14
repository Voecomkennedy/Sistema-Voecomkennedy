(function () {
    const $ = id => document.getElementById(id);
    let versions = [], preview = null, offset = 0, loading = false, selection = 0, legacyBackend = false;
    const scope = () => ({ owner: IntegrityStore.owner, generation: IntegrityStore.generation });
    const check = captured => IntegrityStore._check(captured.owner, captured.generation);
    const missingRpc = error => ['PGRST202', '42883'].includes(error?.code);
    function checkQuoteIds(body) {
        const quotes = body?.emissao_cotacoes;
        if (!Array.isArray(quotes)) return;
        const ids = quotes.filter(quote => quote?.id != null).map(quote => String(quote.id));
        if (new Set(ids).size !== ids.length) throw Object.assign(new Error('Esta versão tem identidades de cotação ambíguas e exige revisão específica.'), { code: 'RECOVERY_AMBIGUOUS' });
    }
    const resetQuotes = () => {
        clearPreview(); $('historyQuote').replaceChildren(new Option('Selecione uma cotação', ''));
        $('previewRecovery').disabled = true;
    };
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
        const captured = scope();
        try {
            const client = getSupabaseClient();
            let result;
            if (!legacyBackend && typeof client.rpc === 'function') {
                result = await client.rpc('integridade_listar_versoes', { p_user_id: captured.owner, p_offset: offset, p_limite: 50 });
                check(captured);
                if (missingRpc(result.error)) legacyBackend = true;
            } else legacyBackend = true;
            if (legacyBackend) result = await client.from('dados_app_historico')
                .select('operacao_id,versao_antes,versao_depois,conteudo_antes,conteudo_depois,criado_em')
                .eq('user_id', captured.owner).order('versao_depois', { ascending: false }).range(offset, offset + 49);
            check(captured);
            if (result.error) throw result.error;
            const rows = result.data || [];
            if (!legacyBackend && rows.some(row => ![1, 2].includes(row.formato))) throw new Error('Formato de histórico não suportado. Atualize o sistema antes de recuperar.');
            for (const row of rows) {
                const ref = { operation: row.operacao_id, scope: captured };
                versions.push({ ...ref, side: 'depois', label: `Nuvem: versão ${row.versao_depois} · ${row.criado_em || ''}`,
                    ...(legacyBackend ? { body: row.conteudo_depois } : {}) });
                if (row.versao_antes != null) versions.push({ ...ref, side: 'antes', label: `Nuvem: anterior à operação ${row.versao_depois} · versão ${row.versao_antes}`,
                    ...(legacyBackend ? { body: row.conteudo_antes } : {}) });
            }
            offset += rows.length; $('moreHistory').hidden = rows.length < 50;
            render(); message(legacyBackend ? 'Backend anterior: somente snapshots legados disponíveis. Versões compactas exigem o leitor central atualizado.' : 'Selecione uma versão para comparar uma cotação.');
        } catch (cause) {
            try { check(captured); } catch { return; }
            message(cause.message?.includes('Formato de histórico') ? cause.message : 'Não foi possível carregar as versões da nuvem. Tente novamente. As versões deste aparelho continuam disponíveis.');
        } finally { loading = false; $('moreHistory').disabled = false; }
    }
    $('historyVersion').addEventListener('change', async () => {
        const ticket = ++selection, captured = scope(), value = $('historyVersion').value;
        resetQuotes(); $('historyQuote').disabled = true;
        if (value === '') { $('historyQuote').disabled = false; return; }
        const item = versions[Number(value)];
        try {
            if (!item) return;
            if (item.scope) check(item.scope);
            if (!Object.prototype.hasOwnProperty.call(item, 'body')) {
                message('Reconstruindo a versão selecionada…');
                const { data, error } = await getSupabaseClient().rpc('integridade_obter_estado', {
                    p_user_id: captured.owner, p_operacao_id: item.operation, p_lado: item.side
                });
                check(captured);
                if (ticket !== selection) return;
                if (error) throw error;
                item.body = data;
            }
            check(captured); if (ticket !== selection) return;
            checkQuoteIds(item.body);
            const quotes = item.body?.emissao_cotacoes;
            if (Array.isArray(quotes)) for (const quote of quotes) {
                if (quote && quote.id != null) $('historyQuote').add(new Option(`Cotação #${quote.id} · ${quote.origem || ''} → ${quote.destino || ''}`, String(quote.id)));
            }
            message('Versão disponível para comparação. Nenhum registro foi alterado.');
        } catch (cause) {
            try { check(captured); } catch { return; }
            if (ticket === selection) { resetQuotes(); message(cause.code === 'RECOVERY_AMBIGUOUS' ? cause.message : 'Não foi possível validar esta versão. Nenhuma recuperação foi habilitada.'); }
        } finally {
            try { check(captured); if (ticket === selection) $('historyQuote').disabled = false; } catch { if (ticket === selection) resetQuotes(); }
        }
    });
    $('historyQuote').addEventListener('change', () => { selection++; clearPreview(); $('previewRecovery').disabled = !$('historyQuote').value; });
    $('previewRecovery').addEventListener('click', async () => {
        clearPreview();
        const captured = scope(), ticket = selection;
        try {
            const source = versions[Number($('historyVersion').value)];
            if (source?.scope) check(source.scope);
            const result = await IntegrityStore.previewQuote(source.body, $('historyQuote').value);
            check(captured); if (ticket !== selection) return;
            checkQuoteIds(IntegrityStore.state.body);
            if (result.before && result.before.id !== result.after.id) throw new Error('As identidades tipadas da cotação diferem. Esta recuperação exige revisão específica.');
            preview = result;
            $('recoveryBefore').textContent = preview.before ? JSON.stringify(preview.before, null, 2) : 'Cotação ausente dos dados atuais.';
            $('recoveryAfter').textContent = JSON.stringify(preview.after, null, 2);
            $('recoveryPreview').hidden = false;
            message('Comparação concluída. Nenhum registro foi alterado.');
        } catch (cause) {
            try { check(captured); if (ticket === selection) message(cause.message); } catch { if (ticket === selection) clearPreview(); }
        }
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
        const captured = scope();
        const local = await IntegrityStore.history();
        check(captured);
        versions = local.slice().reverse().flatMap(item => [
            { label: `Este aparelho: revisão ${item.revision} · ${item.at}`, body: item.after, scope: captured },
            ...(item.before ? [{ label: `Este aparelho: anterior à revisão ${item.revision} · ${item.at}`, body: item.before, scope: captured }] : [])
        ]);
        render(); await loadRemote();
    });
})();
