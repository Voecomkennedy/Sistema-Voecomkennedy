// Utility Functions - Funções utilitárias reutilizáveis

const Utils = {
    // ========== UTILITÁRIO INTERNO ==========

    // Converter string de data YYYY-MM-DD em Date local (sem problema de timezone)
    parseLocalDate(dateString) {
        if (!dateString) return null;

        // Se já é um Date, retornar
        if (dateString instanceof Date) return dateString;

        // Se é string no formato YYYY-MM-DD, criar date local
        if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2}/)) {
            const [datePart] = dateString.split('T'); // Remover hora se tiver
            const [year, month, day] = datePart.split('-').map(Number);
            return new Date(year, month - 1, day);
        }

        // Para outros formatos, usar comportamento padrão
        return new Date(dateString);
    },

    // ========== FORMATAÇÃO ==========

    formatCurrency(value) {
        const num = parseFloat(value) || 0;
        return num.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    },

    formatDate(dateString) {
        if (!dateString) return '-';
        const date = this.parseLocalDate(dateString);
        return date ? date.toLocaleDateString('pt-BR') : '-';
    },

    formatDateTime(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleString('pt-BR');
    },

    formatCPF(cpf) {
        if (!cpf) return '';
        cpf = cpf.replace(/\D/g, '');
        return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    },

    formatPhone(phone) {
        if (!phone) return '';
        phone = phone.replace(/\D/g, '');
        if (phone.length === 11) {
            return phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
        } else if (phone.length === 10) {
            return phone.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
        }
        return phone;
    },

    // ========== CÁLCULOS ==========

    calcularMargemLucro(valorVenda, valorCusto) {
        const venda = parseFloat(valorVenda) || 0;
        const custo = parseFloat(valorCusto) || 0;

        if (venda === 0) return 0;

        return ((venda - custo) / venda * 100);
    },

    calcularLucro(valorVenda, valorCusto) {
        const venda = parseFloat(valorVenda) || 0;
        const custo = parseFloat(valorCusto) || 0;
        return venda - custo;
    },

    formatMargemLucro(margem) {
        return margem.toFixed(2) + '%';
    },

    getMargemClass(margem) {
        if (margem < 0) return 'lucro-negativo';
        if (margem < 10) return 'lucro-baixo';
        return 'lucro-positivo';
    },

    // ========== TEMPO E DATAS ==========

    calcularDiferencaHoras(dataFutura) {
        const agora = new Date();
        const futuro = new Date(dataFutura);
        const diff = futuro - agora;

        if (diff < 0) return { horas: 0, minutos: 0, segundos: 0, total: 0 };

        const horas = Math.floor(diff / (1000 * 60 * 60));
        const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const segundos = Math.floor((diff % (1000 * 60)) / 1000);

        return { horas, minutos, segundos, total: diff };
    },

    formatCountdown(tempo) {
        const { horas, minutos, segundos } = tempo;

        if (horas > 24) {
            const dias = Math.floor(horas / 24);
            const horasRestantes = horas % 24;
            return `${dias}d ${horasRestantes}h ${minutos}m`;
        }

        return `${horas}h ${minutos}m ${segundos}s`;
    },

    getCountdownClass(horas) {
        if (horas < 24) return 'urgent';
        if (horas < 72) return 'warning';
        return 'ok';
    },

    getAlertClass(horas) {
        if (horas < 24) return 'urgent';
        if (horas < 48) return 'warning';
        return 'ok';
    },

    // ========== FILTROS DE DATA ==========

    isHoje(dataString) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const data = this.parseLocalDate(dataString);
        if (!data) return false;
        data.setHours(0, 0, 0, 0);
        return data.getTime() === hoje.getTime();
    },

    isUltimos7Dias(dataString) {
        const hoje = new Date();
        hoje.setHours(23, 59, 59, 999);
        const data = this.parseLocalDate(dataString);
        if (!data) return false;
        const seteDiasAtras = new Date(hoje);
        seteDiasAtras.setDate(hoje.getDate() - 7);
        seteDiasAtras.setHours(0, 0, 0, 0);

        return data >= seteDiasAtras && data <= hoje;
    },

    isUltimos30Dias(dataString) {
        const hoje = new Date();
        hoje.setHours(23, 59, 59, 999);
        const data = this.parseLocalDate(dataString);
        if (!data) return false;
        const trintaDiasAtras = new Date(hoje);
        trintaDiasAtras.setDate(hoje.getDate() - 30);
        trintaDiasAtras.setHours(0, 0, 0, 0);

        return data >= trintaDiasAtras && data <= hoje;
    },

    isUltimos60Dias(dataString) {
        const hoje = new Date();
        hoje.setHours(23, 59, 59, 999);
        const data = this.parseLocalDate(dataString);
        if (!data) return false;
        const sessentaDiasAtras = new Date(hoje);
        sessentaDiasAtras.setDate(hoje.getDate() - 60);
        sessentaDiasAtras.setHours(0, 0, 0, 0);

        return data >= sessentaDiasAtras && data <= hoje;
    },

    isUltimos90Dias(dataString) {
        const hoje = new Date();
        hoje.setHours(23, 59, 59, 999);
        const data = this.parseLocalDate(dataString);
        if (!data) return false;
        const noventaDiasAtras = new Date(hoje);
        noventaDiasAtras.setDate(hoje.getDate() - 90);
        noventaDiasAtras.setHours(0, 0, 0, 0);

        return data >= noventaDiasAtras && data <= hoje;
    },

    // Filtros para check-in (baseados na data de embarque - próximos dias)
    isProximos7Dias(dataString) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const data = this.parseLocalDate(dataString);
        if (!data) return false;
        data.setHours(0, 0, 0, 0);
        const setediasDepois = new Date(hoje);
        setediasDepois.setDate(hoje.getDate() + 7);

        return data >= hoje && data <= setediasDepois;
    },

    isProximos30Dias(dataString) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const data = this.parseLocalDate(dataString);
        if (!data) return false;
        data.setHours(0, 0, 0, 0);
        const trintaDiasDepois = new Date(hoje);
        trintaDiasDepois.setDate(hoje.getDate() + 30);

        return data >= hoje && data <= trintaDiasDepois;
    },

    filtrarPorPeriodo(vendas, periodo, dataInicio = null, dataFim = null) {
        switch(periodo) {
            case 'hoje':
                return vendas.filter(v => this.isHoje(v.dataVenda || v.dataCadastro));

            case '7dias':
                return vendas.filter(v => this.isUltimos7Dias(v.dataVenda || v.dataCadastro));

            case '30dias':
                return vendas.filter(v => this.isUltimos30Dias(v.dataVenda || v.dataCadastro));

            case '60dias':
                return vendas.filter(v => this.isUltimos60Dias(v.dataVenda || v.dataCadastro));

            case '90dias':
                return vendas.filter(v => this.isUltimos90Dias(v.dataVenda || v.dataCadastro));

            case 'customizado':
                if (dataInicio && dataFim) {
                    const inicio = this.parseLocalDate(dataInicio);
                    inicio.setHours(0, 0, 0, 0);
                    const fim = this.parseLocalDate(dataFim);
                    fim.setHours(23, 59, 59, 999);

                    return vendas.filter(v => {
                        // Usar dataVenda se existir, senão usar dataCadastro (compatibilidade)
                        const data = this.parseLocalDate(v.dataVenda || v.dataCadastro);
                        return data >= inicio && data <= fim;
                    });
                }
                return vendas;

            case 'todos':
            default:
                return vendas;
        }
    },

    // Filtrar por período de embarque (para check-in e alertas)
    filtrarPorPeriodoEmbarque(vendas, periodo) {
        switch(periodo) {
            case '7dias':
                return vendas.filter(v => this.isProximos7Dias(v.dataEmbarque));

            case '30dias':
                return vendas.filter(v => this.isProximos30Dias(v.dataEmbarque));

            case 'todos':
            default:
                return vendas;
        }
    },

    // ========== VALIDAÇÕES ==========

    validarCPF(cpf) {
        cpf = cpf.replace(/\D/g, '');

        if (cpf.length !== 11) return false;
        if (/^(\d)\1{10}$/.test(cpf)) return false;

        let soma = 0;
        let resto;

        for (let i = 1; i <= 9; i++) {
            soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
        }

        resto = (soma * 10) % 11;
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(cpf.substring(9, 10))) return false;

        soma = 0;
        for (let i = 1; i <= 10; i++) {
            soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
        }

        resto = (soma * 10) % 11;
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(cpf.substring(10, 11))) return false;

        return true;
    },

    validarEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    },

    validarTelefone(telefone) {
        const limpo = telefone.replace(/\D/g, '');
        return limpo.length >= 10 && limpo.length <= 11;
    },

    // ========== MÁSCARAS ==========

    aplicarMascaraCPF(input) {
        let valor = input.value.replace(/\D/g, '');
        valor = valor.substring(0, 11);
        valor = valor.replace(/(\d{3})(\d)/, '$1.$2');
        valor = valor.replace(/(\d{3})(\d)/, '$1.$2');
        valor = valor.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
        input.value = valor;
    },

    aplicarMascaraTelefone(input) {
        let valor = input.value.replace(/\D/g, '');
        valor = valor.substring(0, 11);

        if (valor.length > 10) {
            valor = valor.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
        } else if (valor.length > 6) {
            valor = valor.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
        } else if (valor.length > 2) {
            valor = valor.replace(/(\d{2})(\d{0,5})/, '($1) $2');
        }

        input.value = valor;
    },

    aplicarMascaraMoeda(input) {
        let valor = input.value.replace(/\D/g, '');
        valor = (parseFloat(valor) / 100).toFixed(2);
        valor = valor.replace('.', ',');
        valor = valor.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        input.value = 'R$ ' + valor;
    },

    // ========== HELPERS ==========

    showSuccess(message) {
        alert('✓ ' + message);
    },

    showError(message) {
        alert('✗ ' + message);
    },

    confirm(message) {
        return confirm(message);
    },

    downloadJSON(data, filename) {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // ========== ORDENAÇÃO ==========

    ordenarPorData(items, campo, ordem = 'asc') {
        return items.sort((a, b) => {
            const dataA = this.parseLocalDate(a[campo]);
            const dataB = this.parseLocalDate(b[campo]);
            if (!dataA || !dataB) return 0;
            return ordem === 'asc' ? dataA - dataB : dataB - dataA;
        });
    },

    ordenarPorNome(items, campo = 'nome', ordem = 'asc') {
        return items.sort((a, b) => {
            const nomeA = (a[campo] || '').toLowerCase();
            const nomeB = (b[campo] || '').toLowerCase();
            if (ordem === 'asc') {
                return nomeA.localeCompare(nomeB);
            } else {
                return nomeB.localeCompare(nomeA);
            }
        });
    },

    // ========== BUSCA ==========

    filtrarPorTexto(items, texto, campos) {
        if (!texto) return items;

        const textoLower = texto.toLowerCase();
        return items.filter(item => {
            return campos.some(campo => {
                const valor = item[campo];
                return valor && valor.toString().toLowerCase().includes(textoLower);
            });
        });
    }
};

// Tornar disponível globalmente
window.Utils = Utils;
