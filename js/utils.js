// Utility Functions - Funções utilitárias reutilizáveis

const Utils = {
    // ========== FORMATAÇÃO ==========

    formatCurrency(value) {
        const num = parseFloat(value) || 0;
        return num.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    },

    // ===== MÁSCARA DE DINHEIRO (REAL BRASILEIRO) =====

    // Converte um texto digitado (ex: "1.000,00" ou "R$ 1.234,56") para número (1000 / 1234.56)
    moedaParaNumero(texto) {
        if (texto === null || texto === undefined) return 0;
        if (typeof texto === 'number') return texto;
        // Mantém apenas dígitos, vírgula e ponto
        let limpo = String(texto).replace(/[^\d,.-]/g, '');
        if (!limpo) return 0;
        // Remove os pontos (separador de milhar) e troca a vírgula decimal por ponto
        limpo = limpo.replace(/\./g, '').replace(',', '.');
        const num = parseFloat(limpo);
        return isNaN(num) ? 0 : num;
    },

    // Converte um número (1000) para o texto exibido no campo: "R$ 1.000,00"
    // (mesmo formato que a máscara aplicarMascaraMoeda usa enquanto digita)
    numeroParaMoeda(num) {
        const n = parseFloat(num) || 0;
        const txt = n.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).replace(/[^\d.,]/g, '');
        return 'R$ ' + txt;
    },

    formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
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
        const data = new Date(dataString);
        return data.toDateString() === hoje.toDateString();
    },

    isProximos7Dias(dataString) {
        const hoje = new Date();
        const data = new Date(dataString);
        const setediasDepois = new Date(hoje);
        setediasDepois.setDate(hoje.getDate() + 7);

        return data >= hoje && data <= setediasDepois;
    },

    isProximos30Dias(dataString) {
        const hoje = new Date();
        const data = new Date(dataString);
        const trintaDiasDepois = new Date(hoje);
        trintaDiasDepois.setDate(hoje.getDate() + 30);

        return data >= hoje && data <= trintaDiasDepois;
    },

    // Filtra vendas pela DATA DA VENDA (quando foi vendida), não pela data do voo.
    // Suporta: hoje, 7/30/60/90 dias atrás, mes (mês atual), ano (ano atual),
    // customizado (dataInicio e dataFim), e todos.
    filtrarPorPeriodo(vendas, periodo, dataInicio, dataFim) {
        if (periodo === 'todos' || !periodo) return vendas;

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        // Retorna a data de referência da venda (data da venda ou cadastro)
        const dataDaVenda = (v) => {
            const d = this.parseLocalDate(v.dataVenda || v.dataCadastro);
            if (!d || isNaN(d.getTime())) return null;
            d.setHours(0, 0, 0, 0);
            return d;
        };

        // Caso customizado: do dia X até o dia Y (inclusive)
        if (periodo === 'customizado') {
            const ini = dataInicio ? this.parseLocalDate(dataInicio) : null;
            const fim = dataFim ? this.parseLocalDate(dataFim) : null;
            if (ini) ini.setHours(0, 0, 0, 0);
            if (fim) fim.setHours(23, 59, 59, 999);
            return vendas.filter(v => {
                const d = dataDaVenda(v);
                if (!d) return false;
                if (ini && d < ini) return false;
                if (fim && d > fim) return false;
                return true;
            });
        }

        // Mês atual
        if (periodo === 'mes') {
            const mes = hoje.getMonth();
            const ano = hoje.getFullYear();
            return vendas.filter(v => {
                const d = dataDaVenda(v);
                return d && d.getMonth() === mes && d.getFullYear() === ano;
            });
        }

        // Ano atual
        if (periodo === 'ano') {
            const ano = hoje.getFullYear();
            return vendas.filter(v => {
                const d = dataDaVenda(v);
                return d && d.getFullYear() === ano;
            });
        }

        // "Hoje"
        if (periodo === 'hoje') {
            return vendas.filter(v => {
                const d = dataDaVenda(v);
                return d && d.getTime() === hoje.getTime();
            });
        }

        // Últimos N dias (7, 30, 60, 90)
        const mapaDias = { '7dias': 7, '30dias': 30, '60dias': 60, '90dias': 90 };
        const dias = mapaDias[periodo];
        if (dias) {
            const limite = new Date(hoje);
            limite.setDate(hoje.getDate() - dias);
            return vendas.filter(v => {
                const d = dataDaVenda(v);
                return d && d >= limite && d <= hoje;
            });
        }

        return vendas;
    },

    // Filtra por período considerando a data/hora de embarque (a partir de agora)
    filtrarPorPeriodoEmbarque(vendas, periodo) {
        const agora = new Date();

        const calcLimite = (dias) => {
            const limite = new Date(agora);
            limite.setDate(agora.getDate() + dias);
            return limite;
        };

        const montarDataHora = (venda) => {
            const dataBase = this.parseLocalDate(venda.dataEmbarque);
            if (!dataBase || isNaN(dataBase.getTime())) return null;
            if (venda.horaEmbarque) {
                const [h, m] = venda.horaEmbarque.split(':');
                dataBase.setHours(parseInt(h) || 0, parseInt(m) || 0, 0, 0);
            }
            return dataBase;
        };

        const dentroDoPeriodo = (venda, limite) => {
            const dataHora = montarDataHora(venda);
            if (!dataHora) return false;
            return dataHora >= agora && dataHora <= limite;
        };

        switch (periodo) {
            case 'hoje': {
                return vendas.filter(v => {
                    const dataHora = montarDataHora(v);
                    return dataHora && this.isHoje(dataHora) && dataHora >= agora;
                });
            }
            case '7dias':
                return vendas.filter(v => dentroDoPeriodo(v, calcLimite(7)));
            case '30dias':
                return vendas.filter(v => dentroDoPeriodo(v, calcLimite(30)));
            case 'todos':
            default:
                return vendas;
        }
    },

    // Converte string de data para Date local (evita problema de fuso horário com "YYYY-MM-DD")
    parseLocalDate(dateString) {
        if (!dateString) return null;
        if (dateString instanceof Date) return dateString;

        // Formato somente data: "YYYY-MM-DD" -> interpreta como data local
        const matchData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
        if (matchData) {
            return new Date(
                parseInt(matchData[1]),
                parseInt(matchData[2]) - 1,
                parseInt(matchData[3])
            );
        }

        // Formato data e hora local: "YYYY-MM-DDTHH:MM"
        const matchDataHora = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(dateString);
        if (matchDataHora) {
            return new Date(
                parseInt(matchDataHora[1]),
                parseInt(matchDataHora[2]) - 1,
                parseInt(matchDataHora[3]),
                parseInt(matchDataHora[4]),
                parseInt(matchDataHora[5])
            );
        }

        // Demais formatos (inclui ISO com timezone)
        return new Date(dateString);
    },

    // Formata data no padrão brasileiro usando parseLocalDate
    formatarData(dateString) {
        if (!dateString) return '-';
        const date = this.parseLocalDate(dateString);
        if (!date || isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('pt-BR');
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
        let digitos = input.value.replace(/\D/g, '');
        if (!digitos) { input.value = ''; return; }
        digitos = digitos.slice(0, 12); // limite de segurança
        let valor = (parseInt(digitos, 10) / 100).toFixed(2);
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
            const dataA = new Date(a[campo]);
            const dataB = new Date(b[campo]);
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
