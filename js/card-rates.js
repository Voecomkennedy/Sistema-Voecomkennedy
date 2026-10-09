(function (root) {
    'use strict';
    const KEY = 'vck_card_rates_v1';
    const DEFAULTS = Object.freeze(Object.fromEntries([5.49,10.89,11.99,12.59,13.29,13.99,14.99,15.59,16.19,16.89,17.89,18.29].map((rate, i) => [i + 1, rate])));
    function validate(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 12) throw new Error('Informe as 12 taxas.');
        const rates = {};
        for (let n = 1; n <= 12; n++) {
            const raw = String(value[n] ?? '').trim().replace(',', '.');
            if (!/^\d{1,2}(\.\d{1,2})?$/.test(raw)) throw new Error(`Taxa de ${n}x inválida. Use de 0 a 99,99%, com até duas casas decimais.`);
            rates[n] = Number(raw);
        }
        return rates;
    }
    function entry(rates, n) {
        if (!Number.isInteger(Number(n)) || n < 1 || n > 12) throw new Error('Parcelamento inválido.');
        const rate = validate(rates)[n];
        const divisor = (10000 - Math.round(rate * 100)) / 10000;
        return { divisor, taxa: rate.toFixed(2).replace('.', ',') + '%', perc: (1 / divisor - 1) * 100, rate };
    }
    function calculate(base, n, rates) {
        if (!Number.isFinite(base) || base < 0 || base > 100000000) throw new Error('Valor inválido.');
        const info = entry(rates, Number(n));
        // Centavos inteiros; arredondar para cima evita receber menos que a base.
        const totalCents = Math.ceil(Math.round(base * 100) * 10000 / (10000 - Math.round(info.rate * 100)));
        return { ...info, total: totalCents / 100, parcela: totalCents / 100 / Number(n) };
    }
    function createStore(client, notify = () => {}) {
        let current = null, owner = null, revision = null, generation = 0, saving = false;
        const fingerprint = value => JSON.stringify(value ?? null);
        const read = user => {
            const value = user.user_metadata?.[KEY];
            if (value == null) return { rates: { ...DEFAULTS }, revision: 'null' };
            if (value.schema !== 1 || typeof value.revision !== 'string') throw new Error('Tabela salva inválida. Revise as taxas antes de calcular.');
            return { rates: validate(value.rates), revision: fingerprint(value) };
        };
        const clear = () => { generation++; current = null; owner = null; revision = null; notify(); };
        async function user() {
            const { data, error } = await client.auth.getUser();
            if (error || !data?.user?.id) throw new Error('Entre na sua conta para carregar as taxas.');
            return data.user;
        }
        const store = {
            get ready() { return !!current; },
            get owner() { return owner; },
            get revision() { return revision; },
            rates() { if (!current) throw new Error('Taxas não carregadas. Recarregue a tabela antes de calcular.'); return { ...current }; },
            entry(n) { return entry(store.rates(), Number(n)); },
            calculate(base, n) { return calculate(base, Number(n), store.rates()); },
            clear,
            async load() {
                const op = ++generation;
                try {
                    const account = await user();
                    if (op !== generation) throw new Error('A sessão mudou. Recarregue a página.');
                    const value = read(account);
                    owner = account.id; current = value.rates; revision = value.revision; notify();
                    return store.rates();
                } catch (error) { if (op === generation) clear(); throw error; }
            },
            async save(rates, expectedRevision) {
                const checked = validate(rates);
                if (!current || saving) throw new Error('Aguarde o carregamento ou salvamento da tabela.');
                const op = generation, accountId = owner;
                saving = true;
                try {
                    const account = await user();
                    if (op !== generation || account.id !== accountId) throw new Error('A sessão mudou. Recarregue a página.');
                    if (read(account).revision !== expectedRevision) throw new Error('As taxas mudaram em outro dispositivo. Recarregue a tabela e revise suas alterações.');
                    const value = { schema: 1, rates: checked, revision: root.crypto.randomUUID(), updatedAt: new Date().toISOString() };
                    // Preferência da própria conta, nunca usada para autorizar acesso.
                    // Não altera senha, e-mail, permissões ou os dados de vendas.
                    const { data, error } = await client.auth.updateUser({ data: { [KEY]: value } });
                    if (error) throw new Error('Não foi possível salvar na nuvem. Suas alterações continuam na tela.');
                    if (op !== generation || data?.user?.id !== accountId) throw new Error('A sessão mudou. Recarregue a página.');
                    const saved = read(data.user);
                    if (saved.revision !== fingerprint(value)) throw new Error('A nuvem não confirmou a tabela. Recarregue antes de continuar.');
                    current = saved.rates; revision = saved.revision; notify();
                    return store.rates();
                } finally { saving = false; }
            }
        };
        client.auth.onAuthStateChange?.((event, session) => {
            if (event === 'SIGNED_OUT' || (owner && session?.user?.id && session.user.id !== owner)) clear();
        });
        return store;
    }
    const api = { KEY, DEFAULTS, validate, entry, calculate, createStore };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CardRates = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
