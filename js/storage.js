// Storage Manager - Funções para gerenciar LocalStorage
const StorageManager = {
    // Chaves do LocalStorage
    KEYS: {
        VENDAS: 'emissao_vendas',
        PESSOAS: 'emissao_pessoas', // Unificado: clientes, passageiros e fornecedores
        PACOTES: 'emissao_pacotes',
        COTACOES: 'emissao_cotacoes'
    },

    // ========== COMPANHIAS AÉREAS (FIXO) ==========
    COMPANHIAS: [
        { codigo: 'LA', nome: 'LATAM Airlines' },
        { codigo: 'G3', nome: 'Gol Linhas Aéreas' },
        { codigo: 'AD', nome: 'Azul Linhas Aéreas' },
        { codigo: 'AA', nome: 'American Airlines' },
        { codigo: 'AV', nome: 'Avianca' },
        { codigo: 'UA', nome: 'United Airlines' },
        { codigo: 'DL', nome: 'Delta Air Lines' },
        { codigo: 'AF', nome: 'Air France' },
        { codigo: 'KL', nome: 'KLM' },
        { codigo: 'LH', nome: 'Lufthansa' },
        { codigo: 'BA', nome: 'British Airways' },
        { codigo: 'IB', nome: 'Iberia' },
        { codigo: 'TP', nome: 'TAP Portugal' },
        { codigo: 'AR', nome: 'Aerolíneas Argentinas' },
        { codigo: 'CM', nome: 'Copa Airlines' }
    ],

    getCompanhias() {
        return this.COMPANHIAS;
    },

    getCompanhiaByCodigo(codigo) {
        return this.COMPANHIAS.find(c => c.codigo === codigo);
    },

    // ========== VENDAS ==========
    getVendas() {
        const data = localStorage.getItem(this.KEYS.VENDAS);
        return data ? JSON.parse(data) : [];
    },

    saveVendas(vendas) {
        localStorage.setItem(this.KEYS.VENDAS, JSON.stringify(vendas));
    },

    addVenda(venda) {
        const vendas = this.getVendas();
        venda.id = this.generateId();
        venda.dataCadastro = new Date().toISOString();
        vendas.push(venda);
        this.saveVendas(vendas);
        return venda;
    },

    updateVenda(id, vendaAtualizada) {
        const vendas = this.getVendas();
        const index = vendas.findIndex(v => v.id === id);
        if (index !== -1) {
            vendas[index] = { ...vendas[index], ...vendaAtualizada };
            this.saveVendas(vendas);
            return vendas[index];
        }
        return null;
    },

    deleteVenda(id) {
        const vendas = this.getVendas();
        const filtered = vendas.filter(v => v.id !== id);
        this.saveVendas(filtered);
        return filtered.length < vendas.length;
    },

    getVendaById(id) {
        const vendas = this.getVendas();
        return vendas.find(v => v.id === id);
    },

    // ========== PESSOAS (CLIENTES, PASSAGEIROS E FORNECEDORES) ==========
    getPessoas() {
        const data = localStorage.getItem(this.KEYS.PESSOAS);
        return data ? JSON.parse(data) : [];
    },

    savePessoas(pessoas) {
        localStorage.setItem(this.KEYS.PESSOAS, JSON.stringify(pessoas));
    },

    addPessoa(pessoa) {
        const pessoas = this.getPessoas();
        pessoa.id = this.generateId();
        pessoa.dataCadastro = new Date().toISOString();
        pessoas.push(pessoa);
        this.savePessoas(pessoas);
        return pessoa;
    },

    updatePessoa(id, pessoaAtualizada) {
        const pessoas = this.getPessoas();
        const index = pessoas.findIndex(p => p.id === id);
        if (index !== -1) {
            pessoas[index] = { ...pessoas[index], ...pessoaAtualizada };
            this.savePessoas(pessoas);
            return pessoas[index];
        }
        return null;
    },

    deletePessoa(id) {
        const pessoas = this.getPessoas();
        const filtered = pessoas.filter(p => p.id !== id);
        this.savePessoas(filtered);
        return filtered.length < pessoas.length;
    },

    getPessoaById(id) {
        const pessoas = this.getPessoas();
        return pessoas.find(p => p.id === id);
    },

    // Filtros por tipo
    getClientes() {
        return this.getPessoas().filter(p => p.tipo === 'cliente');
    },

    getPassageiros() {
        return this.getPessoas().filter(p => p.tipo === 'passageiro');
    },

    getFornecedores() {
        return this.getPessoas().filter(p => p.tipo === 'fornecedor');
    },

    // Compatibilidade com código antigo
    getClienteById(id) {
        return this.getPessoaById(id);
    },

    getFornecedorById(id) {
        return this.getPessoaById(id);
    },

    // CRUD de clientes (clientes são pessoas com tipo 'cliente')
    addCliente(cliente) {
        cliente.tipo = 'cliente';
        return this.addPessoa(cliente);
    },

    updateCliente(id, clienteAtualizado) {
        return this.updatePessoa(id, clienteAtualizado);
    },

    deleteCliente(id) {
        return this.deletePessoa(id);
    },

    // ========== PACOTES TURÍSTICOS ==========
    getPacotes() {
        const data = localStorage.getItem(this.KEYS.PACOTES);
        return data ? JSON.parse(data) : [];
    },

    savePacotes(pacotes) {
        localStorage.setItem(this.KEYS.PACOTES, JSON.stringify(pacotes));
    },

    addPacote(pacote) {
        const pacotes = this.getPacotes();
        pacote.id = this.generateId();
        pacote.dataCadastro = new Date().toISOString();
        pacotes.push(pacote);
        this.savePacotes(pacotes);
        return pacote;
    },

    updatePacote(id, pacoteAtualizado) {
        const pacotes = this.getPacotes();
        const index = pacotes.findIndex(p => p.id === id);
        if (index !== -1) {
            pacotes[index] = { ...pacotes[index], ...pacoteAtualizado };
            this.savePacotes(pacotes);
            return pacotes[index];
        }
        return null;
    },

    deletePacote(id) {
        const pacotes = this.getPacotes();
        const filtered = pacotes.filter(p => p.id !== id);
        this.savePacotes(filtered);
        return filtered.length < pacotes.length;
    },

    getPacoteById(id) {
        return this.getPacotes().find(p => p.id === id);
    },

    // ========== COTAÇÕES ==========
    getCotacoes() {
        const data = localStorage.getItem(this.KEYS.COTACOES);
        return data ? JSON.parse(data) : [];
    },

    saveCotacoes(cotacoes) {
        localStorage.setItem(this.KEYS.COTACOES, JSON.stringify(cotacoes));
    },

    addCotacao(cotacao) {
        const cotacoes = this.getCotacoes();
        cotacao.id = this.generateId();
        cotacao.dataCadastro = new Date().toISOString();
        if (!cotacao.status) cotacao.status = 'pendente';
        cotacoes.push(cotacao);
        this.saveCotacoes(cotacoes);
        return cotacao;
    },

    updateCotacao(id, cotacaoAtualizada) {
        const cotacoes = this.getCotacoes();
        const index = cotacoes.findIndex(c => c.id === id);
        if (index !== -1) {
            cotacoes[index] = { ...cotacoes[index], ...cotacaoAtualizada };
            this.saveCotacoes(cotacoes);
            return cotacoes[index];
        }
        return null;
    },

    deleteCotacao(id) {
        const cotacoes = this.getCotacoes();
        const filtered = cotacoes.filter(c => c.id !== id);
        this.saveCotacoes(filtered);
        return filtered.length < cotacoes.length;
    },

    getCotacaoById(id) {
        return this.getCotacoes().find(c => c.id === id);
    },

    // Marca a cotação como convertida e retorna seus dados (para pré-preencher a venda)
    converterCotacaoParaVenda(id) {
        const cotacao = this.getCotacaoById(id);
        if (!cotacao) return null;
        this.updateCotacao(id, { status: 'convertida', dataConversao: new Date().toISOString() });
        return cotacao;
    },

    // ========== UTILIDADES ==========
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    clearAll() {
        if (confirm('Tem certeza que deseja limpar TODOS os dados? Esta ação não pode ser desfeita!')) {
            localStorage.removeItem(this.KEYS.VENDAS);
            localStorage.removeItem(this.KEYS.PESSOAS);
            localStorage.removeItem(this.KEYS.PACOTES);
            localStorage.removeItem(this.KEYS.COTACOES);
            // Manter compatibilidade com dados antigos
            localStorage.removeItem('emissao_clientes');
            localStorage.removeItem('emissao_fornecedores');
            alert('Todos os dados foram removidos!');
            location.reload();
        }
    },

    exportData() {
        const data = {
            vendas: this.getVendas(),
            pessoas: this.getPessoas(),
            pacotes: this.getPacotes(),
            cotacoes: this.getCotacoes(),
            exportDate: new Date().toISOString()
        };
        return JSON.stringify(data, null, 2);
    },

    importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            if (data.vendas) this.saveVendas(data.vendas);
            if (data.pessoas) this.savePessoas(data.pessoas);
            if (data.pacotes) this.savePacotes(data.pacotes);
            if (data.cotacoes) this.saveCotacoes(data.cotacoes);
            // Compatibilidade com exports antigos
            if (data.clientes || data.fornecedores) {
                const pessoas = this.getPessoas();
                if (data.clientes) {
                    data.clientes.forEach(c => {
                        c.tipo = 'cliente';
                        pessoas.push(c);
                    });
                }
                if (data.fornecedores) {
                    data.fornecedores.forEach(f => {
                        f.tipo = 'fornecedor';
                        pessoas.push(f);
                    });
                }
                this.savePessoas(pessoas);
            }
            alert('Dados importados com sucesso!');
            location.reload();
        } catch (error) {
            alert('Erro ao importar dados: ' + error.message);
        }
    },

    // ========== MIGRAÇÃO DE DADOS ANTIGOS ==========
    migrarDadosAntigos() {
        // Migrar clientes antigos
        const clientesAntigos = localStorage.getItem('emissao_clientes');
        if (clientesAntigos) {
            const clientes = JSON.parse(clientesAntigos);
            const pessoas = this.getPessoas();
            clientes.forEach(c => {
                c.tipo = 'cliente';
                if (!pessoas.find(p => p.id === c.id)) {
                    pessoas.push(c);
                }
            });
            this.savePessoas(pessoas);
            console.log('Clientes migrados:', clientes.length);
        }

        // Migrar fornecedores antigos
        const fornecedoresAntigos = localStorage.getItem('emissao_fornecedores');
        if (fornecedoresAntigos) {
            const fornecedores = JSON.parse(fornecedoresAntigos);
            const pessoas = this.getPessoas();
            fornecedores.forEach(f => {
                f.tipo = 'fornecedor';
                if (!pessoas.find(p => p.id === f.id)) {
                    pessoas.push(f);
                }
            });
            this.savePessoas(pessoas);
            console.log('Fornecedores migrados:', fornecedores.length);
        }
    },

    // ========== ESTATÍSTICAS ==========
    // Calcula estatísticas para um conjunto arbitrário de vendas (ex.: vendas filtradas)
    calcularStatsPeriodo(vendas) {
        const lista = vendas || [];
        const totalVendas = lista.length;
        const valorTotalVendas = lista.reduce((sum, v) => sum + (parseFloat(v.valorVenda) || 0), 0);
        const valorTotalCusto = lista.reduce((sum, v) => sum + (parseFloat(v.valorCusto) || 0), 0);
        const lucroTotal = valorTotalVendas - valorTotalCusto;
        const margemLucroMedia = valorTotalVendas > 0 ? (lucroTotal / valorTotalVendas * 100) : 0;

        return {
            totalVendas,
            valorTotalVendas,
            valorTotalCusto,
            lucroTotal,
            margemLucroMedia
        };
    },

    getStats() {
        const vendas = this.getVendas();
        const pessoas = this.getPessoas();
        const clientes = pessoas.filter(p => p.tipo === 'cliente');
        const fornecedores = pessoas.filter(p => p.tipo === 'fornecedor');

        const totalClientes = clientes.length;
        const totalFornecedores = fornecedores.length;

        // Totais GERAIS (todas as vendas de todos os tempos)
        const valorTotalGeral = vendas.reduce((sum, v) => sum + (parseFloat(v.valorVenda) || 0), 0);
        const custoTotalGeral = vendas.reduce((sum, v) => sum + (parseFloat(v.valorCusto) || 0), 0);
        const lucroTotalGeral = valorTotalGeral - custoTotalGeral;

        // ===== VENDAS DO MÊS ATUAL (pela DATA DA VENDA, não do voo) =====
        const now = new Date();
        const mesAtual = now.getMonth();
        const anoAtual = now.getFullYear();

        const parseData = (v) => {
            const raw = v.dataVenda || v.dataCadastro;
            if (!raw) return null;
            // Aceita "YYYY-MM-DD" e ISO; pega só ano-mês de forma segura
            const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw));
            if (m) return { ano: parseInt(m[1]), mes: parseInt(m[2]) - 1 };
            const d = new Date(raw);
            if (isNaN(d.getTime())) return null;
            return { ano: d.getFullYear(), mes: d.getMonth() };
        };

        const vendasMesAtual = vendas.filter(v => {
            const dv = parseData(v);
            return dv && dv.mes === mesAtual && dv.ano === anoAtual;
        });

        const valorMes = vendasMesAtual.reduce((sum, v) => sum + (parseFloat(v.valorVenda) || 0), 0);
        const custoMes = vendasMesAtual.reduce((sum, v) => sum + (parseFloat(v.valorCusto) || 0), 0);
        const lucroMes = valorMes - custoMes;
        const margemMes = valorMes > 0 ? (lucroMes / valorMes * 100) : 0;

        return {
            // Os campos abaixo (usados pelos cards do Dashboard) agora são DO MÊS ATUAL:
            totalVendas: vendasMesAtual.length,
            valorTotalVendas: valorMes,
            lucroTotal: lucroMes,
            margemLucroMedia: margemMes,

            // Cadastros (gerais)
            totalClientes,
            totalFornecedores,

            // Totais gerais (caso alguma tela precise)
            totalVendasGeral: vendas.length,
            valorTotalGeral,
            lucroTotalGeral,

            // Compatibilidade com nomes antigos
            vendasMesAtual: vendasMesAtual.length,
            valorVendasMesAtual: valorMes
        };
    }
};

// Migrar dados antigos automaticamente ao carregar
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        StorageManager.migrarDadosAntigos();
    });
}

// Tornar disponível globalmente
window.StorageManager = StorageManager;
