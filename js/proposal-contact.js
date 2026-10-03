// Cadastro básico na cotação usa a mesma base de Pessoas e o sync existente.
(function () {
    const $ = id => document.getElementById(id);
    const form = $('cadastroContatoProposta');
    let ready = false;
    let saving = false;
    const authenticated = () => ready && document.documentElement.dataset.appAutenticado === 'true';
    const message = text => { $('contatoPropostaEstado').textContent = text; };
    const cleanName = value => value.trim().replace(/\s+/g, ' ');
    const nameKey = value => cleanName(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');

    function phone(value) {
        const raw = value.trim();
        if (!/^\+?[\d\s().-]+$/.test(raw)) return null;
        const digits = raw.replace(/\D/g, '');
        if (/^(\d)\1+$/.test(digits)) return null;
        // DDD para números locais; código de país explícito para internacionais.
        if (raw.startsWith('+')) return /^[1-9]\d{6,14}$/.test(digits) ? '+' + digits : null;
        return /^[1-9]\d{9,10}$/.test(digits) ? digits : null;
    }

    function phoneKey(value) {
        const raw = String(value || '').trim();
        const digits = raw.replace(/\D/g, '');
        if (!digits) return '';
        // Compara o formato brasileiro legado com +55 sem atribuir DDI a outros países.
        if (/^55\d{10,11}$/.test(digits)) return 'BR:' + digits.slice(2);
        if (!raw.startsWith('+') && /^\d{10,11}$/.test(digits)) return 'BR:' + digits;
        return 'INT:' + digits;
    }

    function clearMatches() {
        $('contatosPropostaEncontrados').replaceChildren();
        $('contatosPropostaEncontrados').hidden = true;
    }

    window.fecharCadastroContatoProposta = function () {
        form.hidden = true;
        $('abrirContatoProposta').setAttribute('aria-expanded', 'false');
    };
    window.reiniciarCadastroContatoProposta = function () {
        window.fecharCadastroContatoProposta();
        form.reset();
        message('');
        clearMatches();
    };
    window.abrirCadastroContatoProposta = function () {
        if (!authenticated()) return;
        form.hidden = false;
        $('abrirContatoProposta').setAttribute('aria-expanded', 'true');
        $('contatoPropostaNome').focus();
    };

    function selectContact(contact, created = false) {
        if (!window.selecionarContatoProposta(contact.id)) throw new Error('Não foi possível selecionar o contato. Tente novamente.');
        window.reiniciarCadastroContatoProposta();
        $('clienteProposta').focus();
        $('propostaEstado').textContent = created
            ? 'Contato salvo neste aparelho e selecionado. Confira o indicador de sincronização antes de trocar de aparelho.'
            : 'Contato já cadastrado selecionado. Os dados da proposta foram mantidos.';
    }

    function showMatches(matches, fingerprint, mayCreate) {
        const container = $('contatosPropostaEncontrados');
        container.hidden = false;
        const list = document.createElement('div');
        list.className = 'list-group';
        matches.forEach(contact => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'list-group-item list-group-item-action';
            button.textContent = 'Selecionar ' + contact.nome;
            button.addEventListener('click', () => {
                if (!authenticated() || saving) return;
                try {
                    const existing = StorageManager.getClientes().find(c => String(c.id) === String(contact.id));
                    if (!existing) throw new Error('Contato não encontrado. Confira o cadastro antes de continuar.');
                    selectContact(existing);
                } catch (error) { message(error.message); }
            });
            list.append(button);
        });
        container.append(list);
        if (mayCreate) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn btn-outline-secondary mt-2';
            button.textContent = 'Cadastrar outra pessoa com este WhatsApp';
            button.addEventListener('click', () => save(fingerprint));
            container.append(button);
        }
        message('Este WhatsApp já aparece no cadastro. Selecione o contato correto para evitar duplicidade.');
    }

    function save(confirmedFingerprint = null) {
        if (!authenticated() || saving || form.hidden) return;
        clearMatches();
        const first = cleanName($('contatoPropostaNome').value);
        const last = cleanName($('contatoPropostaSobrenome').value);
        for (const [id, value, label] of [
            ['contatoPropostaNome', first, 'nome'], ['contatoPropostaSobrenome', last, 'sobrenome']
        ]) {
            if (!value || !/\p{L}/u.test(value)) {
                message('Informe o ' + label + ' do contato.');
                $(id).focus();
                return;
            }
        }
        const telefone = phone($('contatoPropostaWhatsapp').value);
        if (!telefone) {
            message('Informe um WhatsApp com DDD (10 ou 11 dígitos) ou com + e código do país (7 a 15 dígitos). Use apenas números e sinais de formatação.');
            $('contatoPropostaWhatsapp').focus();
            return;
        }
        const nome = first + ' ' + last;
        const fingerprint = JSON.stringify([nameKey(nome), telefone]);
        const button = $('salvarContatoProposta');
        saving = true;
        button.disabled = true;
        try {
            const matches = StorageManager.getClientes().filter(c =>
                [c.telefone, c.telefone2].some(number => phoneKey(number) === phoneKey(telefone))
            );
            const exact = matches.filter(c => nameKey(c.nome) === nameKey(nome));
            if (exact.length === 1) { selectContact(exact[0]); return; }
            if (exact.length > 1 || (matches.length && confirmedFingerprint !== fingerprint)) {
                showMatches(exact.length ? exact : matches, fingerprint, !exact.length);
                return;
            }
            const contact = StorageManager.addPessoa({ tipo: 'cliente', nome, telefone });
            if (!contact?.id || !StorageManager.getClienteById(contact.id)) throw new Error('Não foi possível gravar o contato. Tente novamente.');
            selectContact(contact, true);
            try { CloudSync.agendarBackup(); }
            catch {
                $('propostaEstado').textContent = 'Contato salvo neste aparelho e selecionado, mas houve falha ao agendar a sincronização. Confira o indicador de nuvem.';
            }
        } catch (error) {
            message('Não foi possível salvar o contato: ' + error.message);
        } finally {
            saving = false;
            button.disabled = false;
        }
    }

    window.salvarContatoProposta = () => save();
    form.addEventListener('submit', event => { event.preventDefault(); save(); });
    form.addEventListener('input', () => { clearMatches(); message(''); });
    document.addEventListener('app:ready', () => { ready = true; });
})();
