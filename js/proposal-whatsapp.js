// Texto público da proposta salva. Não envia mensagens nem modifica a cotação.
(function (root) {
    'use strict';
    const commonJS = typeof module === 'object' && module.exports;
    const pdf = commonJS ? require('../cotador/js/proposal-pdf.js') : root.ProposalPDF;
    const pricing = commonJS ? require('../cotador/js/passenger-pricing.js') : root.PassengerPricing;
    const text = value => String(value ?? '').trim();
    const count = value => Math.max(0, Math.floor(Number(value) || 0));
    const number = value => {
        if (typeof value === 'number') return value;
        const raw = text(value).replace(/R\$|\s/g, '');
        if (!raw) return NaN;
        if (raw.includes(',')) return Number(raw.replace(/\./g, '').replace(',', '.'));
        return Number(/^-?\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, '') : raw);
    };
    const positive = value => Number.isFinite(number(value)) && number(value) > 0;
    const money = value => number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ');
    const normalized = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    function date(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return '';
        const parsed = new Date(value + 'T12:00:00Z');
        if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return '';
        return parsed.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    }

    function safeLink(value) {
        try {
            const url = new URL(text(value));
            return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : '';
        } catch { return ''; }
    }

    function card(d) {
        if (!positive(d.valCartaoBase)) return null;
        const total = positive(d.valCartaoFinal) ? d.valCartaoFinal : d.valCartaoBase;
        const installments = Number(d.parcelas);
        if (!Number.isInteger(installments) || installments < 1 || installments > 10) return null;
        if (installments > 1) {
            if (!positive(d.valParcela) || !positive(d.valCartaoFinal)) return null;
            return { label: installments + 'x de ' + money(d.valParcela), sub: 'total ' + money(total) + (d.comJuros === false ? ' · sem juros' : '') };
        }
        return { label: money(total), sub: 'à vista no cartão' };
    }

    function comparisonCard(d, option) {
        if (!card(d)) return null;
        // A taxa gravada é histórica. Não usar uma tabela atual para recalcular
        // uma proposta antiga, nem deduzir a taxa de um total negociado à mão.
        const rate = number(text(d.juroInfo?.taxa).replace('%', ''));
        const recordedRate = Number(d.juroInfo?.n) === Number(d.parcelas) && rate >= 0 && rate < 100;
        const config = { cardDivisor: recordedRate ? 1 - rate / 100 : undefined };
        if (d.comJuros === false || recordedRate) return pdf.cardForOption({
            ...d,
            valTotalPix: positive(d.valTotalPix) ? money(d.valTotalPix) : '',
            valCartaoBase: money(d.valCartaoBase),
            valCartaoFinal: positive(d.valCartaoFinal) ? money(d.valCartaoFinal) : '',
            valParcela: positive(d.valParcela) ? money(d.valParcela) : ''
        }, option, config);
        return option.selected && Math.abs(option.total - number(d.valTotalPix)) <= 0.02 ? card(d) : null;
    }

    function generate(quote) {
        const d = quote?.propostaCompleta;
        if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('Proposta completa não encontrada.');
        const payment = pricing.presentation(d);
        // O PDF já valida e seleciona os resultados comerciais do comparativo.
        // Nunca serializar calc, custos, fornecedor ou margens para o cliente.
        const options = pdf.options(d);
        const passengerLabel = [
            count(d.adultos) ? count(d.adultos) + ' adulto' + (count(d.adultos) > 1 ? 's' : '') : '',
            count(d.criancas) ? count(d.criancas) + ' criança' + (count(d.criancas) > 1 ? 's' : '') : '',
            count(d.bebes) ? count(d.bebes) + ' bebê' + (count(d.bebes) > 1 ? 's' : '') : ''
        ].filter(Boolean).join(', ') || payment.totalPax + ' passageiro(s)';
        const lines = ['✈️ *COTAÇÃO DE VIAGEM*'];
        if (text(d.cliente)) lines.push('Preparada para ' + text(d.cliente));
        lines.push(passengerLabel, 'Horários locais de cada aeroporto');

        function leg(key, origin, destination) {
            const airline = key === 'Volta' ? d.ciaVolta || d.cia : d.cia;
            const operator = d['ciaOperadora' + key];
            const departure = date(d['data' + key + 'ISO']) || text(d['data' + key]);
            const arrival = date(d.timing?.fields?.['p-data-chegada-' + key.toLowerCase()]) || text(d['dataChegada' + key]);
            lines.push('', '*' + key.toUpperCase() + '*' + (departure ? ' — ' + departure : ''),
                text(origin) + ' → ' + text(destination),
                [d['dep' + key] ? 'Saída ' + text(d['dep' + key]) : '', d['cheg' + key] ? 'Chegada ' + text(d['cheg' + key]) : ''].filter(Boolean).join(' · '));
            if (arrival) lines.push('Data de chegada: ' + arrival);
            lines.push('Companhia: ' + (text(airline) || 'a confirmar'));
            if (text(operator) && normalized(operator) !== normalized(airline)) lines.push('Operado por ' + text(operator));
            if (text(d.classe)) lines.push('Tarifa: ' + text(d.classe));
            const stops = Math.min(3, Number(String(d['parada' + key] || '').match(/\d/)?.[0] || 0));
            const flights = Array.from({ length: stops + 1 }, (_, i) => text(d['voo' + key + (i ? i + 1 : '')])).filter(Boolean);
            if (flights.length) lines.push('Voo(s): ' + flights.join(' · '));
            if (text(d['dur' + key])) lines.push('Duração total: ' + text(d['dur' + key]));
            if (d['parada' + key] === 'direto') lines.push('Voo direto');
            for (let i = 0; i < stops; i++) {
                const suffix = i ? i + 1 : '';
                const city = text(d['escalaCidade' + suffix + key]) || 'a confirmar';
                const wait = text(d['escalaTempo' + suffix + key]);
                const transfer = d['troca' + key + (i + 1)];
                lines.push((transfer ? 'Troca de aeroporto: ' + city + ' → ' + (text(d['troca' + key + (i + 1) + 'Dest']) || 'a confirmar') : 'Conexão em ' + city) + (wait ? ' · espera ' + wait : ''));
            }
            if (text(d.bagMao)) lines.push('Bagagem de mão: ' + text(d.bagMao));
            if (options.length) lines.push('Bagagem despachada conforme opção escolhida');
            else if (text(d['bagDesp' + key])) lines.push('Bagagem despachada: ' + text(d['bagDesp' + key]));
        }

        leg('Ida', d.orig, d.dest);
        if (!d.somenteIda) leg('Volta', d.multitrecho && d.origVolta ? d.origVolta : d.dest, d.multitrecho && d.destVolta ? d.destVolta : d.orig);

        function appendCard(value) {
            if (value) lines.push('Cartão: ' + value.label, value.sub);
        }
        if (options.length) {
            lines.push('', '*VALORES E OPÇÕES*');
            options.forEach((option, i) => {
                lines.push('', 'Opção ' + (i + 1) + (option.selected ? ' · selecionada' : '') + ': ' + text(option.label));
                if (text(option.detail)) lines.push(text(option.detail));
                lines.push(payment.label + ': ' + money(option.pp), 'Total no Pix · ' + payment.totalPax + ' passageiro(s): ' + money(option.total));
                appendCard(comparisonCard(d, option));
            });
        } else if (positive(d.valPix) || positive(d.valTotalPix) || card(d)) {
            lines.push('', '*VALORES*');
            if (positive(d.valPix)) lines.push(payment.label + ': ' + money(d.valPix), payment.basis);
            if (positive(d.valTotalPix)) lines.push('Total no Pix · ' + payment.totalPax + ' passageiro(s): ' + money(d.valTotalPix));
            appendCard(card(d));
        }
        if (payment.note) lines.push(payment.note);

        if (text(d.hotelNome)) {
            lines.push('', '*HOSPEDAGEM*', text(d.hotelNome));
            if (text(d.hotelCheckin)) lines.push('Check-in: ' + (date(d.hotelCheckin) || text(d.hotelCheckin)));
            if (text(d.hotelCheckout)) lines.push('Check-out: ' + (date(d.hotelCheckout) || text(d.hotelCheckout)));
            if (text(d.hotelNoites)) lines.push(text(d.hotelNoites) + ' noite(s)');
            if (text(d.hotelRegime)) lines.push(text(d.hotelRegime));
            if (safeLink(d.linkHotel)) lines.push('Fotos e detalhes: ' + safeLink(d.linkHotel));
        }
        if (text(d.obs)) lines.push('', '*OBSERVAÇÕES*', text(d.obs));
        if (safeLink(d.linkAereo)) lines.push('', 'Detalhes dos voos: ' + safeLink(d.linkAereo));
        lines.push('', '⚠️ Valores e disponibilidade sujeitos a alteração até a emissão.');
        return lines.join('\n').replace(/\u00a0/g, ' ');
    }

    const api = { generate };
    if (commonJS) module.exports = api;
    else root.ProposalWhatsApp = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
