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
    getTodasVendas() {
        const data = localStorage.getItem(this.KEYS.VENDAS);
        return data ? JSON.parse(data) : [];
    },

    // Por padrão, telas e relatórios recebem apenas vendas ativas. As arquivadas
    // continuam armazenadas e podem ser restauradas, evitando perda de histórico.
    getVendas(incluirArquivadas = false) {
        const vendas = this.getTodasVendas();
        return incluirArquivadas ? vendas : vendas.filter(v => !v.excluidaEm);
    },

    saveVendas(vendas) {
        localStorage.setItem(this.KEYS.VENDAS, JSON.stringify(vendas));
    },

    addVenda(venda) {
        const vendas = this.getTodasVendas();
        const agora = new Date().toISOString();
        venda.id = this.generateId();
        venda.dataCadastro = agora;
        venda.dataAtualizacao = agora;
        venda.historicoAlteracoes = [{ data: agora, acao: 'criacao', campos: [] }];
        vendas.push(venda);
        this.saveVendas(vendas);
        return venda;
    },

    updateVenda(id, vendaAtualizada) {
        const vendas = this.getTodasVendas();
        const index = vendas.findIndex(v => v.id === id);
        if (index !== -1) {
            const anterior = vendas[index];
            const camposIgnorados = new Set(['historicoAlteracoes', 'dataAtualizacao']);
            const camposAlterados = Object.keys(vendaAtualizada).filter(campo =>
                !camposIgnorados.has(campo) &&
                JSON.stringify(anterior[campo]) !== JSON.stringify(vendaAtualizada[campo])
            );
            const agora = new Date().toISOString();
            const historico = Array.isArray(anterior.historicoAlteracoes)
                ? [...anterior.historicoAlteracoes]
                : [];
            if (camposAlterados.length) {
                historico.push({
                    data: agora,
                    acao: vendaAtualizada.acaoHistorico || 'edicao',
                    campos: camposAlterados.filter(campo => campo !== 'acaoHistorico')
                });
            }
            const dados = { ...vendaAtualizada };
            delete dados.acaoHistorico;
            vendas[index] = {
                ...anterior,
                ...dados,
                dataAtualizacao: agora,
                historicoAlteracoes: historico
            };
            this.saveVendas(vendas);
            return vendas[index];
        }
        return null;
    },

    deleteVenda(id) {
        return !!this.updateVenda(id, {
            excluidaEm: new Date().toISOString(),
            acaoHistorico: 'arquivamento'
        });
    },

    restaurarVenda(id) {
        return !!this.updateVenda(id, {
            excluidaEm: null,
            acaoHistorico: 'restauracao'
        });
    },

    getVendaById(id) {
        const vendas = this.getTodasVendas();
        return vendas.find(v => v.id === id);
    },

    normalizarStatusVenda(venda) {
        const status = String(venda?.statusVenda || '').toLowerCase();
        return ['emitida', 'cancelada', 'reembolso_parcial', 'reembolso_total'].includes(status)
            ? status
            : 'emitida';
    },

    normalizarStatusPagamento(venda) {
        const status = String(venda?.statusPagamento || '').toLowerCase();
        return ['recebido', 'parcial', 'pendente', 'nao_informado'].includes(status)
            ? status
            : 'nao_informado';
    },

    obterResumoFinanceiroVenda(venda) {
        const statusVenda = this.normalizarStatusVenda(venda);
        const statusPagamento = this.normalizarStatusPagamento(venda);
        const valorVenda = this.numeroParaCentavos(venda?.valorVenda);
        const valorCusto = this.numeroParaCentavos(venda?.valorCusto);
        const valorRecebidoInformado = this.numeroParaCentavos(venda?.valorRecebido);
        const valorRecebido = statusPagamento === 'recebido' && venda?.valorRecebido === undefined
            ? valorVenda
            : valorRecebidoInformado;
        const valorReembolsado = this.numeroParaCentavos(venda?.valorReembolsadoCliente);
        const valorEstornado = this.numeroParaCentavos(venda?.valorEstornadoFornecedor);
        const cancelada = statusVenda === 'cancelada' || statusVenda === 'reembolso_total';
        const receitaProjetada = cancelada ? 0 : Math.max(0, valorVenda - valorReembolsado);
        const custoLiquido = Math.max(0, valorCusto - valorEstornado);
        const receitaRealizada = Math.max(0, valorRecebido - valorReembolsado);
        const realizadoConhecido = statusPagamento !== 'nao_informado';

        return {
            statusVenda,
            statusPagamento,
            valorVenda: this.centavosParaNumero(valorVenda),
            valorCusto: this.centavosParaNumero(valorCusto),
            receitaProjetada: this.centavosParaNumero(receitaProjetada),
            custoLiquido: this.centavosParaNumero(custoLiquido),
            lucroProjetado: this.centavosParaNumero(receitaProjetada - custoLiquido),
            receitaRealizada: realizadoConhecido ? this.centavosParaNumero(receitaRealizada) : null,
            lucroRealizado: realizadoConhecido ? this.centavosParaNumero(receitaRealizada - custoLiquido) : null,
            realizadoConhecido
        };
    },

    vendaPrecisaRevisaoLegado(venda) {
        const statusVenda = String(venda?.statusVenda || '').toLowerCase();
        const statusPagamento = String(venda?.statusPagamento || '').toLowerCase();
        const pagamentoRealizado = statusPagamento === 'recebido' || statusPagamento === 'parcial';
        return !venda?.dataVenda ||
            !['emitida', 'cancelada', 'reembolso_parcial', 'reembolso_total'].includes(statusVenda) ||
            !['recebido', 'parcial', 'pendente'].includes(statusPagamento) ||
            (pagamentoRealizado && !venda?.dataPagamento && !venda?.dataPagamentoDesconhecida);
    },

    getVendasParaRevisaoLegado() {
        return this.getVendas().filter(venda => this.vendaPrecisaRevisaoLegado(venda));
    },

    vendaAptaParaBalanco(venda) {
        return !!venda && !venda.excluidaEm && !this.vendaPrecisaRevisaoLegado(venda);
    },

    calcularBalancoConfiavel(vendas = null) {
        const lista = (vendas || this.getVendas()).filter(venda => !venda.excluidaEm);
        const classificadas = lista.filter(venda => this.vendaAptaParaBalanco(venda));
        const pendentes = lista.filter(venda => !this.vendaAptaParaBalanco(venda));
        const resumos = classificadas.map(venda => ({
            venda,
            financeiro: this.obterResumoFinanceiroVenda(venda)
        }));
        const somarResumo = campo => resumos.reduce((total, item) =>
            total + this.numeroParaCentavos(item.financeiro[campo]), 0);

        const receitaProjetadaCentavos = somarResumo('receitaProjetada');
        const custoLiquidoCentavos = somarResumo('custoLiquido');
        const receitaRealizadaCentavos = somarResumo('receitaRealizada');
        const lucroRealizadoCentavos = somarResumo('lucroRealizado');
        const lucroProjetadoCentavos = receitaProjetadaCentavos - custoLiquidoCentavos;
        const saldoAReceberCentavos = resumos.reduce((total, item) => {
            const projetado = this.numeroParaCentavos(item.financeiro.receitaProjetada);
            const realizado = this.numeroParaCentavos(item.financeiro.receitaRealizada);
            return total + Math.max(0, projetado - realizado);
        }, 0);
        const valorForaBalancoCentavos = pendentes.reduce((total, venda) =>
            total + this.numeroParaCentavos(venda.valorVenda), 0);

        return {
            totalRegistros: lista.length,
            totalClassificadas: classificadas.length,
            totalPendentes: pendentes.length,
            coberturaPercentual: lista.length ? classificadas.length / lista.length * 100 : 0,
            receitaProjetada: this.centavosParaNumero(receitaProjetadaCentavos),
            custoLiquido: this.centavosParaNumero(custoLiquidoCentavos),
            lucroProjetado: this.centavosParaNumero(lucroProjetadoCentavos),
            receitaRealizada: this.centavosParaNumero(receitaRealizadaCentavos),
            lucroRealizado: this.centavosParaNumero(lucroRealizadoCentavos),
            saldoAReceber: this.centavosParaNumero(saldoAReceberCentavos),
            valorForaBalanco: this.centavosParaNumero(valorForaBalancoCentavos),
            margemProjetada: receitaProjetadaCentavos
                ? lucroProjetadoCentavos / receitaProjetadaCentavos * 100
                : 0,
            margemRealizada: receitaRealizadaCentavos
                ? lucroRealizadoCentavos / receitaRealizadaCentavos * 100
                : 0,
            classificadas,
            pendentes
        };
    },

    agruparBalancoPorMes(vendas = null) {
        const classificadas = (vendas || this.getVendas())
            .filter(venda => this.vendaAptaParaBalanco(venda));
        const grupos = new Map();

        classificadas.forEach(venda => {
            const correspondencia = /^(\d{4})-(\d{2})/.exec(String(venda.dataVenda || ''));
            if (!correspondencia) return;
            const chave = `${correspondencia[1]}-${correspondencia[2]}`;
            if (!grupos.has(chave)) grupos.set(chave, []);
            grupos.get(chave).push(venda);
        });

        return [...grupos.entries()]
            .sort(([mesA], [mesB]) => mesA.localeCompare(mesB))
            .map(([mes, registros]) => ({ mes, ...this.calcularBalancoConfiavel(registros) }));
    },

    revisarVendaLegada(id, dados) {
        const venda = this.getVendaById(id);
        if (!venda || venda.excluidaEm) return { ok: false, erro: 'Venda não encontrada.' };

        const hoje = new Date();
        const hojeTexto = [
            hoje.getFullYear(),
            String(hoje.getMonth() + 1).padStart(2, '0'),
            String(hoje.getDate()).padStart(2, '0')
        ].join('-');
        const dataVenda = String(dados?.dataVenda || '');
        const statusVenda = String(dados?.statusVenda || '');
        const statusPagamento = String(dados?.statusPagamento || '');
        const dataPagamento = String(dados?.dataPagamento || '');
        const dataPagamentoDesconhecida = !!dados?.dataPagamentoDesconhecida;
        const valorVenda = this.numeroParaCentavos(venda.valorVenda);
        const valorRecebido = this.numeroParaCentavos(dados?.valorRecebido);
        const erros = [];

        if (!/^\d{4}-\d{2}-\d{2}$/.test(dataVenda) || dataVenda > hojeTexto) {
            erros.push('informe a data original da venda, sem usar uma data futura');
        }
        if (!['emitida', 'cancelada', 'reembolso_parcial', 'reembolso_total'].includes(statusVenda)) {
            erros.push('informe a situação da venda');
        }
        if (!['recebido', 'parcial', 'pendente'].includes(statusPagamento)) {
            erros.push('informe a situação do pagamento');
        }
        if (statusPagamento === 'recebido' && valorRecebido !== valorVenda) {
            erros.push('pagamento recebido deve ter o mesmo valor da venda');
        }
        if (statusPagamento === 'parcial' && (valorRecebido <= 0 || valorRecebido >= valorVenda)) {
            erros.push('pagamento parcial deve ser maior que zero e menor que a venda');
        }
        if (statusPagamento === 'pendente' && valorRecebido !== 0) {
            erros.push('pagamento pendente deve ter valor recebido igual a zero');
        }
        if ((statusPagamento === 'recebido' || statusPagamento === 'parcial') &&
            !dataPagamento && !dataPagamentoDesconhecida) {
            erros.push('informe a data do pagamento ou marque que a data exata é desconhecida');
        }
        if (dataPagamento && (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento) || dataPagamento > hojeTexto)) {
            erros.push('a data do pagamento não pode estar no futuro');
        }
        if (erros.length) return { ok: false, erro: erros.join('; ') + '.' };

        const atualizado = this.updateVenda(id, {
            dataVenda,
            statusVenda,
            statusPagamento,
            valorRecebido: this.centavosParaNumero(valorRecebido),
            dataPagamento: statusPagamento === 'pendente' ? '' : dataPagamento,
            dataPagamentoDesconhecida: statusPagamento === 'pendente' ? false : dataPagamentoDesconhecida,
            revisaoLegacyEm: new Date().toISOString(),
            acaoHistorico: 'revisao_legado'
        });
        return atualizado ? { ok: true, venda: atualizado } : { ok: false, erro: 'Não foi possível salvar a revisão.' };
    },

    analisarIntegridadeVendas() {
        const vendas = this.getVendas();
        const problemas = [];
        const codigos = new Map();

        vendas.forEach(venda => {
            const identificador = this.getCodigosVenda(venda).join(' | ') || venda.numeroCompra || venda.id;
            const adicionar = (tipo, descricao) => problemas.push({
                tipo, vendaId: venda.id, identificador, descricao
            });

            if (!venda.dataVenda) adicionar('data_venda', 'Data original da venda não informada');
            if (!venda.statusVenda) adicionar('status_venda', 'Status da venda não informado');
            if (!venda.statusPagamento || this.normalizarStatusPagamento(venda) === 'nao_informado') {
                adicionar('status_pagamento', 'Status do pagamento não informado');
            }
            const statusPagamento = this.normalizarStatusPagamento(venda);
            if ((statusPagamento === 'recebido' || statusPagamento === 'parcial') &&
                !venda.dataPagamento && !venda.dataPagamentoDesconhecida) {
                adicionar('data_pagamento', 'Data do pagamento não informada');
            }
            if (venda.dataEmbarque && venda.dataVolta && venda.dataVolta < venda.dataEmbarque) {
                adicionar('data_viagem', 'Data de volta anterior à data de ida');
            }
            const vendaCentavos = this.numeroParaCentavos(venda.valorVenda);
            const custoCentavos = this.numeroParaCentavos(venda.valorCusto);
            const recebidoCentavos = this.numeroParaCentavos(venda.valorRecebido);
            const reembolsoCentavos = this.numeroParaCentavos(venda.valorReembolsadoCliente);
            const estornoCentavos = this.numeroParaCentavos(venda.valorEstornadoFornecedor);
            if (recebidoCentavos > vendaCentavos) adicionar('valor_financeiro', 'Valor recebido supera o valor da venda');
            if (reembolsoCentavos > recebidoCentavos) adicionar('valor_financeiro', 'Reembolso supera o valor recebido');
            if (estornoCentavos > custoCentavos) adicionar('valor_financeiro', 'Estorno do fornecedor supera o custo');
            this.getCodigosVenda(venda).forEach(codigo => {
                if (!codigos.has(codigo)) codigos.set(codigo, []);
                codigos.get(codigo).push(venda);
            });
        });

        codigos.forEach((registros, codigo) => {
            if (registros.length < 2) return;
            registros.forEach(venda => problemas.push({
                tipo: 'localizador_duplicado',
                vendaId: venda.id,
                identificador: codigo,
                descricao: `Localizador aparece em ${registros.length} vendas`
            }));
        });

        return problemas;
    },

    normalizarCodigoVenda(valor) {
        return (valor || '').toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    },

    getCodigosVenda(venda) {
        const codigos = [];
        if (Array.isArray(venda.localizadores)) codigos.push(...venda.localizadores);
        else if (venda.localizador) codigos.push(venda.localizador);
        if (venda.localizadorVolta) codigos.push(venda.localizadorVolta);
        if (Array.isArray(venda.passageiros)) {
            venda.passageiros.forEach(p => {
                if (p && p.localizador) codigos.push(p.localizador);
            });
        }
        return [...new Set(codigos.map(c => this.normalizarCodigoVenda(c)).filter(Boolean))];
    },

    // Retorna suspeitas para o usuário decidir. Não bloqueia automaticamente,
    // porque um mesmo PNR pode ser usado legitimamente em vendas separadas.
    findPossiveisVendasDuplicadas(venda, ignorarId = null) {
        const codigosNovos = new Set(this.getCodigosVenda(venda));
        const numeroCompra = this.normalizarCodigoVenda(venda.numeroCompra);

        return this.getVendas()
            .filter(existente => String(existente.id) !== String(ignorarId || ''))
            .map(existente => {
                const codigosIguais = this.getCodigosVenda(existente)
                    .filter(codigo => codigosNovos.has(codigo));
                const compraIgual = numeroCompra &&
                    numeroCompra === this.normalizarCodigoVenda(existente.numeroCompra);
                const motivos = [];
                if (codigosIguais.length) motivos.push(`localizador ${codigosIguais.join(', ')}`);
                if (compraIgual) motivos.push(`número da compra ${numeroCompra}`);
                return motivos.length ? { venda: existente, motivos } : null;
            })
            .filter(Boolean);
    },

    // ========== PESSOAS (CLIENTES, PASSAGEIROS E FORNECEDORES) ==========
    getPessoas() {
        const data = localStorage.getItem(this.KEYS.PESSOAS);
        return data ? JSON.parse(data) : [];
    },

    savePessoas(pessoas) {
        localStorage.setItem(this.KEYS.PESSOAS, JSON.stringify(pessoas));
    },

    normalizarPessoa(pessoa) {
        if (pessoa && pessoa.nome && typeof Utils !== 'undefined' && Utils.formatarNomeProprio) {
            pessoa.nome = Utils.formatarNomeProprio(pessoa.nome);
        }
        return pessoa;
    },

    addPessoa(pessoa) {
        const pessoas = this.getPessoas();
        this.normalizarPessoa(pessoa);
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
            this.normalizarPessoa(pessoaAtualizada);
            pessoas[index] = { ...pessoas[index], ...pessoaAtualizada };
            this.savePessoas(pessoas);
            return pessoas[index];
        }
        return null;
    },

    motivoBloqueioExclusaoPessoa(id) {
        if (id === null || id === undefined || id === '') return '';
        const vinculado = registro => registro.clienteId !== null &&
            registro.clienteId !== undefined && String(registro.clienteId) === String(id);
        const temVendas = this.getTodasVendas().some(vinculado);
        const temCotacoes = this.getCotacoes().some(vinculado);
        if (!temVendas && !temCotacoes) return '';
        return 'Esta pessoa possui cotações ou vendas vinculadas, inclusive arquivadas, e não pode ser excluída. Mantenha o cadastro para preservar o histórico.';
    },

    deletePessoa(id) {
        // A proteção fica na camada de dados para valer também fora da tela Pessoas.
        if (this.motivoBloqueioExclusaoPessoa(id)) return false;
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

    // A cotação só será marcada como convertida depois que a venda for salva.
    converterCotacaoParaVenda(id) {
        return this.getCotacaoById(id) || null;
    },

    concluirConversaoCotacao(id, vendaId) {
        return this.updateCotacao(id, {
            status: 'convertida',
            dataConversao: new Date().toISOString(),
            vendaId
        });
    },

    // ========== UTILIDADES ==========
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // ========== MIGRAÇÃO DE DADOS ANTIGOS ==========
    migrarDadosAntigos() {
        // Essas chaves antigas não identificam o dono. CloudSync preserva uma cópia
        // isolada para recuperação manual; nunca atribuir o legado à conta aberta.
        return false;
    },

    // ========== ESTATÍSTICAS ==========
    numeroParaCentavos(valor) {
        if (typeof valor === 'number') {
            return Number.isFinite(valor) ? Math.round(valor * 100) : 0;
        }

        let texto = (valor || '').toString().trim().replace(/[^\d,.-]/g, '');
        if (!texto) return 0;
        if (texto.includes(',')) texto = texto.replace(/\./g, '').replace(',', '.');
        const numero = Number(texto);
        return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
    },

    centavosParaNumero(centavos) {
        return (parseInt(centavos, 10) || 0) / 100;
    },

    somarCampoEmCentavos(lista, obterValor) {
        return (lista || []).reduce((total, item) =>
            total + this.numeroParaCentavos(obterValor(item)), 0);
    },

    // Calcula estatísticas para um conjunto arbitrário de vendas (ex.: vendas filtradas)
    calcularStatsPeriodo(vendas) {
        const lista = vendas || [];
        const totalVendas = lista.length;
        const resumos = lista.map(v => this.obterResumoFinanceiroVenda(v));
        const vendasCentavos = this.somarCampoEmCentavos(resumos, r => r.receitaProjetada);
        const custosCentavos = this.somarCampoEmCentavos(resumos, r => r.custoLiquido);
        const recebidoCentavos = this.somarCampoEmCentavos(resumos, r => r.receitaRealizada);
        const lucroRealizadoCentavos = this.somarCampoEmCentavos(resumos, r => r.lucroRealizado);
        const valorTotalVendas = this.centavosParaNumero(vendasCentavos);
        const valorTotalCusto = this.centavosParaNumero(custosCentavos);
        const lucroTotal = this.centavosParaNumero(vendasCentavos - custosCentavos);
        const valorRecebido = this.centavosParaNumero(recebidoCentavos);
        const lucroRealizado = this.centavosParaNumero(lucroRealizadoCentavos);
        const margemLucroMedia = valorTotalVendas > 0 ? (lucroTotal / valorTotalVendas * 100) : 0;

        return {
            totalVendas,
            valorTotalVendas,
            valorTotalCusto,
            lucroTotal,
            valorRecebido,
            lucroRealizado,
            pagamentosNaoInformados: resumos.filter(r => r.statusPagamento === 'nao_informado').length,
            vendasCanceladas: resumos.filter(r => r.statusVenda === 'cancelada' || r.statusVenda === 'reembolso_total').length,
            margemLucroMedia
        };
    },

    calcularStatsPacotes(pacotes = null) {
        const todos = pacotes || this.getPacotes();
        const ativos = todos.filter(p => (p.status || '').toString().toLowerCase() !== 'cancelado');
        const vendasCentavos = this.somarCampoEmCentavos(ativos, p => p.financeiro?.valorVenda);
        const custosCentavos = this.somarCampoEmCentavos(ativos, p => p.financeiro?.valorCusto);
        const valorTotalVendas = this.centavosParaNumero(vendasCentavos);
        const valorTotalCusto = this.centavosParaNumero(custosCentavos);
        const lucroTotal = this.centavosParaNumero(vendasCentavos - custosCentavos);

        return {
            totalPacotes: todos.length,
            totalPacotesAtivos: ativos.length,
            totalPacotesCancelados: todos.length - ativos.length,
            valorTotalVendas,
            valorTotalCusto,
            lucroTotal,
            margemLucroMedia: valorTotalVendas > 0 ? (lucroTotal / valorTotalVendas * 100) : 0
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
        const statsGeral = this.calcularStatsPeriodo(vendas);
        const valorTotalGeral = statsGeral.valorTotalVendas;
        const lucroTotalGeral = statsGeral.lucroTotal;

        // ===== VENDAS DO MÊS ATUAL (pela DATA DA VENDA, não do voo) =====
        const now = new Date();
        const mesAtual = now.getMonth();
        const anoAtual = now.getFullYear();

        const parseData = (v) => {
            const raw = v.dataVenda;
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

        const statsMes = this.calcularStatsPeriodo(vendasMesAtual);
        const valorMes = statsMes.valorTotalVendas;
        const lucroMes = statsMes.lucroTotal;
        const margemMes = statsMes.margemLucroMedia;

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

// Tornar disponível globalmente
window.StorageManager = StorageManager;
