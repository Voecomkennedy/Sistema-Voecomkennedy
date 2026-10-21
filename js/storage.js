// Storage Manager - Funções para gerenciar LocalStorage
const StorageManager = {
    validarOrigemComercial(tipo, valor) {
        const comuns = ['nao_informado', 'indicacao', 'instagram', 'outro'];
        const opcoes = [...comuns, ...(tipo === 'cliente' ? ['grupo_promocoes'] : ['alerta_grupo', 'atendimento_direto'])];
        if (!opcoes.includes(valor)) throw new Error('Origem comercial inválida. Selecione uma opção.');
    },
    _editores: new Map(),
    abrirEditor(name, id) {
        if (id != null) this._editores.set(this.KEYS[name] + ':' + String(id),
            this._read(this.KEYS[name]).find(item => String(item.id) === String(id)) || null);
    },
    _read(key) {
        if (globalThis.window?.IntegrityStore?.configured && !window.IntegrityStore.ready) window.IntegrityStore._check();
        if (globalThis.window?.IntegrityStore?.ready) return window.IntegrityStore.read(key);
        return JSON.parse(localStorage.getItem(key) || '[]');
    },
    _write(key, records) {
        if (globalThis.window?.IntegrityStore?.configured && !window.IntegrityStore.ready) window.IntegrityStore._check();
        if (globalThis.window?.IntegrityStore?.ready) return window.IntegrityStore.write(key, records);
        localStorage.setItem(key, JSON.stringify(records));
    },
    gravar(method, args, options = {}) {
        const store = globalThis.window?.IntegrityStore;
        if (store?.configured && !store.ready) store._check();
        if (!store?.ready) return this[method](...args);
        const names = { Venda: this.KEYS.VENDAS, Pessoa: this.KEYS.PESSOAS, Pacote: this.KEYS.PACOTES, Cotacao: this.KEYS.COTACOES };
        const name = Object.keys(names).find(name => method.includes(name));
        const editing = /^(update|delete|restaurar|revisar|salvarConversao)/.test(method);
        const editorKey = names[name] + ':' + String(args[0]);
        const expected = editing && name ? [{ key: names[name], id: args[0],
            value: Object.hasOwn(options, 'expectedRecord') ? options.expectedRecord : this._editores.has(editorKey)
                ? this._editores.get(editorKey) : this._read(names[name]).find(item => String(item.id) === String(args[0])) || null }] : [];
        return store.transact(() => this[method](...args), { label: method, expected, resultKey: names[name] }).then(result => {
            if (expected.length && store.canonical(this._editores.get(editorKey) ?? null) === store.canonical(expected[0].value)) this._editores.delete(editorKey);
            return result;
        });
    },
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
        return this._read(this.KEYS.VENDAS);
    },

    // Por padrão, telas e relatórios recebem apenas vendas ativas. As arquivadas
    // continuam armazenadas e podem ser restauradas, evitando perda de histórico.
    getVendas(incluirArquivadas = false) {
        const vendas = this.getTodasVendas();
        return incluirArquivadas ? vendas : vendas.filter(v => !v.excluidaEm);
    },

    saveVendas(vendas) {
        this._write(this.KEYS.VENDAS, vendas);
    },

    addVenda(venda) {
        if (Object.hasOwn(venda, 'origemVenda')) this.validarOrigemComercial('venda', venda.origemVenda);
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
        if (Object.hasOwn(vendaAtualizada, 'origemVenda')) this.validarOrigemComercial('venda', vendaAtualizada.origemVenda);
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
        return this._read(this.KEYS.PESSOAS);
    },

    savePessoas(pessoas) {
        this._write(this.KEYS.PESSOAS, pessoas);
    },

    normalizarPessoa(pessoa) {
        if (pessoa && Object.hasOwn(pessoa, 'origemCliente')) this.validarOrigemComercial('cliente', pessoa.origemCliente);
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
        return this._read(this.KEYS.PACOTES);
    },

    savePacotes(pacotes) {
        this._write(this.KEYS.PACOTES, pacotes);
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
        return this._read(this.KEYS.COTACOES);
    },

    saveCotacoes(cotacoes) {
        this._write(this.KEYS.COTACOES, cotacoes);
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

    concluirConversaoCotacao(id, vendaId, clienteId = undefined) {
        return this.updateCotacao(id, {
            status: 'convertida',
            dataConversao: new Date().toISOString(),
            vendaId,
            ...(clienteId === undefined ? {} : { clienteId })
        });
    },

    salvarConversaoCotacao(id, dadosVenda) {
        const cotacao = this.getCotacaoById(id);
        if (!cotacao) throw new Error('Cotação não encontrada. Reabra a lista antes de converter.');
        const cliente = this.getPessoas().find(item => String(item.id) === String(dadosVenda.clienteId));
        if (!cliente) throw new Error('Selecione um cliente cadastrado antes de converter a cotação.');
        if (cotacao.clienteId && String(cotacao.clienteId) !== String(cliente.id)) {
            throw new Error('O cliente da venda deve ser o cliente vinculado à cotação.');
        }
        const vendas = this.getTodasVendas();
        const vinculadas = vendas.filter(venda => String(venda.cotacaoOrigemId || '') === String(id));
        if (vinculadas.length > 1) throw new Error('Há mais de uma venda vinculada à cotação. Revise os registros antes de continuar.');
        if (cotacao.status === 'convertida') {
            const concluida = vendas.find(venda => venda.id === cotacao.vendaId);
            if (!concluida || String(concluida.clienteId) !== String(cliente.id)) {
                throw new Error('O vínculo da conversão está incompleto. Revise a venda indicada pela cotação.');
            }
            return { venda: concluida, retomada: true };
        }
        let vendaSalva = vinculadas[0];
        const retomada = !!vendaSalva;
        if (vendaSalva && (vendaSalva.excluidaEm || String(vendaSalva.clienteId) !== String(cliente.id))) {
            throw new Error('A venda já vinculada foi arquivada ou mudou de cliente. Revise o vínculo antes de continuar.');
        }
        if (!vendaSalva) {
            // A quote identifies this conversion, irrespective of retries or the
            // number of alternative quotes for the same commercial contact.
            const vendaId = `cotacao-${String(id)}`;
            if (vendas.some(venda => String(venda.id) === vendaId)) throw new Error('O identificador da conversão já pertence a outra venda.');
            const agora = new Date().toISOString();
            vendaSalva = {
                ...JSON.parse(JSON.stringify(dadosVenda)), id: vendaId,
                cotacaoOrigemId: id, clienteId: cliente.id, statusVenda: 'emitida',
                dataCadastro: agora, dataAtualizacao: agora,
                historicoAlteracoes: [{data: agora, acao: 'criacao_por_cotacao', campos: []}]
            };
            this.saveVendas([...vendas, vendaSalva]);
        }
        try {
            // A legacy quote has a name but no contact identity. Bind only the
            // registered contact explicitly selected for this sale, in the same
            // write that completes conversion. Never infer it from the name.
            if (!this.concluirConversaoCotacao(id, vendaSalva.id, cliente.id)) throw new Error('Não foi possível vincular a cotação.');
        } catch (cause) {
            const erro = new Error(`A venda #${vendaSalva.id} ficou salva neste aparelho, mas o vínculo com a cotação não foi concluído. Tente novamente para concluir sem criar outra venda.`);
            erro.code = 'CONVERSION_PENDING';
            erro.vendaId = vendaSalva.id;
            erro.cause = cause;
            throw erro;
        }
        // A retry finishes the link to the sale already stored. It never silently
        // replaces that sale with a later form or creates another one.
        return { venda: vendaSalva, retomada };
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

// Inline form handlers surface transaction failures and keep the form open.
if (typeof document !== 'undefined') document.addEventListener('app:ready', () => {
    const names = ['salvarPessoa', 'excluirPessoa', 'salvarCadastroClienteRapido', 'salvarCadastroPassageiroRapido',
        'salvarVenda', 'excluirVenda', 'restaurarVenda', 'salvarMovimentoFinanceiro', 'salvarCotacao', 'marcarComoPerdida',
        'excluirCotacao', 'salvarPacote', 'excluirPacote', 'salvarRevisao'];
    for (const name of names) {
        const original = window[name]; if (typeof original !== 'function' || original._integrityWrapped) continue;
        let pending = null;
        const handler = async function (...args) {
            if (pending) return pending;
            pending = (async () => {
                try { return await original.apply(this, args); }
                catch (cause) { if (typeof Utils !== 'undefined') Utils.showError(cause.message || 'Não foi possível salvar. Os dados do formulário foram mantidos.'); }
                finally { pending = null; }
            })();
            return pending;
        };
        handler._integrityWrapped = true; window[name] = handler;
    }
});
