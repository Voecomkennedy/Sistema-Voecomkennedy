(function () {
    'use strict';
    // O editor incorporado usa a mesma instância da página autenticada.
    if (window.parent !== window && window.parent.CardRatesService) {
        window.CardRatesService = window.parent.CardRatesService;
        window.CardRatesUI = window.parent.CardRatesUI;
        window.parent.addEventListener('card-rates:changed', () => window.dispatchEvent(new Event('card-rates:changed')));
        return;
    }
    const service = CardRates.createStore(getSupabaseClient(), () => window.dispatchEvent(new Event('card-rates:changed')));
    window.CardRatesService = service;
    let dialog, status, grid, save, reload, revision;
    function build() {
        dialog = document.createElement('dialog');
        dialog.className = 'card-rates-dialog';
        dialog.setAttribute('aria-labelledby', 'card-rates-title');
        dialog.innerHTML = `<form method="dialog"><header><h2 id="card-rates-title">Taxas de cartão</h2><button aria-label="Fechar taxas" value="close">✕</button></header></form>
            <p>Link de pagamento · Receba na Hora · Visa, Mastercard e Elo</p>
            <p>Informe a taxa descontada pela operadora. O sistema calcula o valor a cobrar para preservar o líquido.</p>
            <div class="card-rates-grid"></div>
            <p class="card-rates-status" role="status" aria-live="polite"></p>
            <footer><button type="button" data-rates-reload>Recarregar da nuvem</button><button type="button" data-rates-save>Salvar taxas</button></footer>
            <p class="card-rates-note">Vale para novos cálculos em todos os dispositivos da mesma conta. Propostas salvas mantêm seus valores. Após alterar em outro dispositivo, recarregue a tabela. Evite editar simultaneamente em duas telas.</p>`;
        document.body.append(dialog);
        status = dialog.querySelector('.card-rates-status'); grid = dialog.querySelector('.card-rates-grid');
        save = dialog.querySelector('[data-rates-save]'); reload = dialog.querySelector('[data-rates-reload]');
        for (let n = 1; n <= 12; n++) {
            const label = document.createElement('label'); label.textContent = n + 'x (%)';
            const input = document.createElement('input'); input.type = 'text'; input.inputMode = 'decimal'; input.dataset.installments = n; input.maxLength = 5;
            label.append(input); grid.append(label);
        }
        reload.addEventListener('click', () => { if (!dialog.dataset.dirty || confirm('Recarregar descarta somente as alterações de taxas ainda não salvas. Continuar?')) load(); });
        grid.addEventListener('input', () => { dialog.dataset.dirty = 'true'; status.textContent = 'Alterações ainda não salvas.'; });
        dialog.addEventListener('cancel', event => { if (dialog.dataset.dirty && !confirm('Fechar sem salvar as alterações de taxas?')) event.preventDefault(); });
        dialog.querySelector('form').addEventListener('submit', event => { if (dialog.dataset.dirty && !confirm('Fechar sem salvar as alterações de taxas?')) event.preventDefault(); });
        save.addEventListener('click', async () => {
            busy(true);
            try {
                await service.save(Object.fromEntries([...grid.querySelectorAll('input')].map(input => [input.dataset.installments, input.value])), revision);
                revision = service.revision; delete dialog.dataset.dirty; status.textContent = 'Taxas salvas na nuvem. Novos cálculos usam esta tabela.';
            } catch (error) { status.textContent = error.message; }
            finally { busy(false); }
        });
    }
    function busy(value) { save.disabled = value; reload.disabled = value; grid.querySelectorAll('input').forEach(input => { input.disabled = value; }); }
    async function load() {
        busy(true); status.textContent = 'Carregando taxas da sua conta…';
        try {
            const rates = await service.load(); revision = service.revision;
            grid.querySelectorAll('input').forEach(input => { input.value = rates[input.dataset.installments].toFixed(2).replace('.', ','); });
            delete dialog.dataset.dirty; status.textContent = revision === 'null' ? 'Tabela inicial da imagem enviada em 09/10/2026. Salve para registrar na sua conta.' : 'Tabela carregada da nuvem.';
        } catch (error) { status.textContent = error.message; }
        finally { busy(false); save.disabled = !service.ready; }
    }
    window.CardRatesUI = { async open() { if (!dialog) build(); if (dialog.open) return; dialog.showModal(); await load(); } };
    document.addEventListener('click', event => { if (event.target.closest('[data-card-rates-open]')) window.CardRatesUI.open(); });
    service.load().catch(() => { /* Os cálculos permanecem bloqueados; o botão permite tentar novamente. */ });
})();
