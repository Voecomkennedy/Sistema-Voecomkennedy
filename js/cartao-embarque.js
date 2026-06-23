// ============================================
// Cartão de Embarque - lógica da página
// ============================================

let _qrcodeObj = null;

// Configuração de cada companhia: logo, cor e como montar o link de check-in
const COMPANHIAS = {
    GOL: {
        nome: 'GOL',
        logo: 'logos/gol.svg',
        cor: '#FF7A00',
        // GOL: automático — usa localizador + origem da ida + sobrenome
        montarLink(d) {
            const sobrenome = ultimoSobrenome(d.passNome);
            return `https://b2c.voegol.com.br/minhas-viagens/encontrar-viagem?codigoReserva=${encodeURIComponent(d.localizador)}&origem=${encodeURIComponent(d.idaOrigemSigla)}&sobrenome=${encodeURIComponent(sobrenome)}`;
        }
    },
    LATAM: {
        nome: 'LATAM',
        logo: 'logos/latam.svg',
        cor: '#1B0088',
        // LATAM: manual — o link é colado pelo usuário (orderId não vem no bilhete)
        montarLink(d) {
            return (d.latamLink || '').trim();
        }
    },
    AZUL: {
        nome: 'AZUL',
        logo: 'logos/azul.svg',
        cor: '#003DA5',
        // Azul: automático — usa pnr (localizador) + origem da ida
        montarLink(d) {
            return `https://www.voeazul.com.br/br/pt/home/minhas-viagens?pnr=${encodeURIComponent(d.localizador)}&origin=${encodeURIComponent(d.idaOrigemSigla)}`;
        }
    },
    OUTRA: {
        nome: '',
        logo: '',
        cor: '#002071',
        montarLink(d) { return (d.link || '').trim(); }
    }
};

// Pega só o último sobrenome em MAIÚSCULO (ex: "Ana Lucia Izidro dos Santos" -> "SANTOS")
function ultimoSobrenome(nomeCompleto) {
    if (!nomeCompleto) return '';
    const partes = nomeCompleto.trim().split(/\s+/);
    return (partes[partes.length - 1] || '').toUpperCase();
}

function companhiaAtual() {
    const cia = val('f_cia') || 'GOL';
    return COMPANHIAS[cia] || COMPANHIAS.OUTRA;
}

// Quando muda a companhia no dropdown: troca logo/cor e mostra/esconde campos
function aoMudarCompanhia() {
    const cia = val('f_cia');
    document.getElementById('grupoCiaOutra').style.display = (cia === 'OUTRA') ? '' : 'none';
    document.getElementById('grupoCiaCor').style.display = (cia === 'OUTRA') ? '' : 'none';
    document.getElementById('grupoLatamLink').style.display = (cia === 'LATAM') ? '' : 'none';
    atualizarPreview();
}

// Converte "2026-09-22" em "TERÇA, 22 SET. 2026"
function formatarDataExtenso(dateStr) {
    if (!dateStr) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) return dateStr;
    const d = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
    const semana = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'];
    const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    return `${semana[d.getDay()]}, ${parseInt(m[3])} ${meses[d.getMonth()]}. ${m[1]}`;
}

function val(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function setText(id, texto) {
    const el = document.getElementById(id);
    if (el) el.textContent = texto;
}

// Atualiza toda a pré-visualização do cartão
function atualizarPreview() {
    // Header — logo da companhia
    const cia = companhiaAtual();
    const ciaKey = val('f_cia');
    const logoImg = document.getElementById('pv_logoImg');
    const logoBox = document.getElementById('pv_logoBox');
    if (ciaKey === 'OUTRA' || !cia.logo) {
        // "Outra": mostra o nome escrito em vez de logo
        const nomeOutra = (val('f_ciaOutraNome') || 'COMPANHIA').toUpperCase();
        logoImg.style.display = 'none';
        logoBox.innerHTML = `<span style="font-weight:800;font-size:18px;color:${val('f_cor') || '#002071'}">${nomeOutra}</span>`;
    } else {
        logoBox.innerHTML = `<img id="pv_logoImg" src="${cia.logo}" alt="${cia.nome}" style="height:26px;width:auto;display:block;" />`;
    }
    setText('pv_loc', (val('f_localizador') || '').toUpperCase());

    // Passageiro
    setText('pv_passNome', val('f_passNome') || '');
    setText('pv_passDoc', val('f_passDoc') || '');

    // Ida
    setText('pv_idaData', formatarDataExtenso(val('f_idaData')));
    setText('pv_idaHoraSaida', val('f_idaHoraSaida') || '');
    setText('pv_idaOrigemSigla', (val('f_idaOrigemSigla') || '').toUpperCase());
    setText('pv_idaOrigemCidade', val('f_idaOrigemCidade') || '');
    setText('pv_idaHoraChegada', val('f_idaHoraChegada') || '');
    setText('pv_idaDestinoCidade', val('f_idaDestinoCidade') || '');
    setText('pv_idaDestinoSigla', (val('f_idaDestinoSigla') || '').toUpperCase());
    setText('pv_idaVoo', (val('f_idaVoo') || '').toUpperCase());
    setText('pv_idaDuracao', val('f_idaDuracao') || '');

    // Volta
    const temVolta = document.getElementById('f_temVolta').checked;
    document.getElementById('grupoVolta').style.display = temVolta ? '' : 'none';
    document.getElementById('pv_blocoVolta').style.display = temVolta ? '' : 'none';
    setText('pv_trechos', temVolta ? 'Ida e volta · 2 trechos' : 'Somente ida · 1 trecho');

    if (temVolta) {
        setText('pv_voltaData', formatarDataExtenso(val('f_voltaData')));
        setText('pv_voltaHoraSaida', val('f_voltaHoraSaida') || '');
        setText('pv_voltaOrigemSigla', (val('f_voltaOrigemSigla') || '').toUpperCase());
        setText('pv_voltaOrigemCidade', val('f_voltaOrigemCidade') || '');
        setText('pv_voltaHoraChegada', val('f_voltaHoraChegada') || '');
        setText('pv_voltaDestinoCidade', val('f_voltaDestinoCidade') || '');
        setText('pv_voltaDestinoSigla', (val('f_voltaDestinoSigla') || '').toUpperCase());
        setText('pv_voltaVoo', (val('f_voltaVoo') || '').toUpperCase());
        setText('pv_voltaDuracao', val('f_voltaDuracao') || '');
    }

    // Bagagens
    atualizarBagagens(temVolta);

    // Mensagem e valor
    setText('pv_mensagem', val('f_mensagem') || '');
    const valor = val('f_valor').trim();
    setText('pv_valor', valor || 'R$ 0,00');

    // QR Code
    gerarQRCode();
}

function atualizarBagagens(temVolta) {
    const itens = [
        { nome: 'Item pessoal', peso: '10kg', qtd: parseInt(val('f_bagPessoal')) || 0, icon: 'bi-handbag' },
        { nome: 'Mala de mão', peso: '10kg', qtd: parseInt(val('f_bagMao')) || 0, icon: 'bi-bag' },
        { nome: 'Despachada', peso: '23kg', qtd: parseInt(val('f_bagDesp')) || 0, icon: 'bi-suitcase' },
        { nome: 'Especial', peso: '45kg', qtd: parseInt(val('f_bagEsp')) || 0, icon: 'bi-box' }
    ];
    const grid = document.getElementById('pv_bagGrid');
    grid.innerHTML = itens.map(it => `
        <div class="bag-item">
            <i class="bi ${it.icon}"></i>
            <div class="bag-nome">${it.nome}</div>
            <div class="bag-peso">${it.peso}</div>
            <div class="bag-qtd">${it.qtd}</div>
        </div>
    `).join('');

    // Total de itens (conta as quantidades; x2 se tiver volta)
    const totalTrecho = itens.reduce((s, it) => s + it.qtd, 0);
    const total = temVolta ? totalTrecho * 2 : totalTrecho;
    setText('pv_bagTotal', total + (total === 1 ? ' item' : ' itens'));
}

function gerarQRCode() {
    const link = montarLinkAtual();
    const container = document.getElementById('qrcode');
    container.innerHTML = '';
    if (!link) {
        // Sem link (ex: LATAM sem link colado): mostra aviso no lugar do QR
        container.innerHTML = '<div style="font-size:8px;color:#c00;text-align:center;width:60px;">Sem link</div>';
        return;
    }
    try {
        _qrcodeObj = new QRCode(container, {
            text: link,
            width: 60,
            height: 60,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    } catch (e) {
        console.warn('Erro ao gerar QR Code:', e);
    }
}

// Monta o link de check-in conforme a companhia escolhida
function montarLinkAtual() {
    const cia = companhiaAtual();
    const dados = {
        localizador: (val('f_localizador') || '').toUpperCase(),
        idaOrigemSigla: (val('f_idaOrigemSigla') || '').toUpperCase(),
        passNome: val('f_passNome'),
        latamLink: val('f_latamLink'),
        link: val('f_link')
    };
    try { return cia.montarLink(dados); } catch (e) { return ''; }
}

// ===== PUXAR DE UMA VENDA JÁ CADASTRADA =====
let _vendasCache = [];

function carregarVendasCache() {
    try {
        _vendasCache = StorageManager.getVendas().slice().sort((a, b) => {
            const ta = a.dataCadastro ? new Date(a.dataCadastro).getTime() : 0;
            const tb = b.dataCadastro ? new Date(b.dataCadastro).getTime() : 0;
            return tb - ta; // mais recentes primeiro
        });
    } catch (e) { _vendasCache = []; }
}

function _nomeClienteDaVenda(venda) {
    try {
        const c = StorageManager.getClienteById(venda.clienteId);
        return c ? c.nome : '';
    } catch (e) { return ''; }
}

function _localizadorDaVenda(venda) {
    if (Array.isArray(venda.localizadores) && venda.localizadores.length) return venda.localizadores[0];
    return venda.localizador || '';
}

function buscarVenda(termo) {
    if (!_vendasCache.length) carregarVendasCache();
    const lista = document.getElementById('resultadoVenda');
    const termoNorm = _normalizarCartao(termo).trim();

    let resultados = _vendasCache;
    if (termoNorm) {
        resultados = _vendasCache.filter(v => {
            const cliente = _nomeClienteDaVenda(v);
            const loc = _localizadorDaVenda(v);
            return _normalizarCartao(loc).includes(termoNorm) ||
                   _normalizarCartao(cliente).includes(termoNorm) ||
                   _normalizarCartao(v.origem).includes(termoNorm) ||
                   _normalizarCartao(v.destino).includes(termoNorm);
        });
    }
    resultados = resultados.slice(0, 30);

    if (resultados.length === 0) {
        lista.innerHTML = '<div class="list-group-item text-muted">Nenhuma venda encontrada</div>';
        lista.style.display = 'block';
        return;
    }
    lista.innerHTML = resultados.map(v => {
        const cliente = _nomeClienteDaVenda(v) || 'Cliente';
        const loc = _localizadorDaVenda(v) || 'S/Loc';
        const rota = `${v.origem || '?'} → ${v.destino || '?'}`;
        const data = v.dataEmbarque ? Utils.formatDate(v.dataEmbarque) : '';
        return `<button type="button" class="list-group-item list-group-item-action"
                        onclick="preencherDeVenda('${v.id}')">
            <strong>${loc}</strong> · ${cliente}<br>
            <small class="text-muted">${rota} ${data ? '· ' + data : ''}</small>
        </button>`;
    }).join('');
    lista.style.display = 'block';
}

// Preenche o formulário do cartão com os dados de uma venda
function preencherDeVenda(vendaId) {
    const venda = _vendasCache.find(v => String(v.id) === String(vendaId));
    if (!venda) return;

    const cliente = StorageManager.getClienteById(venda.clienteId);
    const loc = _localizadorDaVenda(venda);

    // Localizador
    document.getElementById('f_localizador').value = (loc || '').toUpperCase();

    // Companhia: tenta detectar pelo nome salvo na venda
    const ciaTxt = _normalizarCartao(venda.companhiaAerea || '');
    let ciaKey = 'OUTRA';
    if (ciaTxt.includes('gol')) ciaKey = 'GOL';
    else if (ciaTxt.includes('latam') || ciaTxt.includes('tam')) ciaKey = 'LATAM';
    else if (ciaTxt.includes('azul')) ciaKey = 'AZUL';
    document.getElementById('f_cia').value = ciaKey;
    if (ciaKey === 'OUTRA' && venda.companhiaAerea) {
        document.getElementById('f_ciaOutraNome').value = venda.companhiaAerea;
    }

    // Passageiro principal (cliente ou primeiro passageiro)
    let passNome = cliente ? cliente.nome : '';
    let passDoc = cliente && cliente.cpf ? Utils.formatCPF(cliente.cpf) : '';
    if (!venda.clienteViaja && Array.isArray(venda.passageiros) && venda.passageiros.length) {
        passNome = venda.passageiros[0].nome || passNome;
        passDoc = venda.passageiros[0].cpf ? Utils.formatCPF(venda.passageiros[0].cpf) : passDoc;
    }
    document.getElementById('f_passNome').value = passNome;
    document.getElementById('f_passDoc').value = passDoc;
    document.getElementById('f_buscaPassageiro').value = passNome;

    // Voo de ida (origem/destino podem ser cidade ou sigla)
    document.getElementById('f_idaData').value = venda.dataEmbarque || '';
    document.getElementById('f_idaHoraSaida').value = venda.horaEmbarque || '';
    document.getElementById('f_idaOrigemCidade').value = venda.origem || '';
    document.getElementById('f_idaOrigemSigla').value = (venda.origem || '').toUpperCase().slice(0, 3);
    document.getElementById('f_idaDestinoCidade').value = venda.destino || '';
    document.getElementById('f_idaDestinoSigla').value = (venda.destino || '').toUpperCase().slice(0, 3);
    document.getElementById('f_idaVoo').value = (venda.numeroVoo || '').toUpperCase();
    document.getElementById('f_idaHoraChegada').value = '';
    document.getElementById('f_idaDuracao').value = '';

    // Volta (se houver)
    const temVolta = !!(venda.dataVolta);
    document.getElementById('f_temVolta').checked = temVolta;
    if (temVolta) {
        document.getElementById('f_voltaData').value = venda.dataVolta || '';
        document.getElementById('f_voltaHoraSaida').value = venda.horaVolta || '';
        // volta = inverso da ida
        document.getElementById('f_voltaOrigemCidade').value = venda.destino || '';
        document.getElementById('f_voltaOrigemSigla').value = (venda.destino || '').toUpperCase().slice(0, 3);
        document.getElementById('f_voltaDestinoCidade').value = venda.origem || '';
        document.getElementById('f_voltaDestinoSigla').value = (venda.origem || '').toUpperCase().slice(0, 3);
        document.getElementById('f_voltaVoo').value = (venda.localizadorVolta || '').toUpperCase();
        document.getElementById('f_voltaHoraChegada').value = '';
        document.getElementById('f_voltaDuracao').value = '';
    }

    // Valor
    if (venda.valorVenda) {
        document.getElementById('f_valor').value = Utils.formatCurrency(venda.valorVenda);
    }

    document.getElementById('resultadoVenda').style.display = 'none';
    document.getElementById('f_buscaVenda').value = `${loc} - ${passNome}`;

    aoMudarCompanhia();
    Utils.showSuccess('Dados da venda carregados! Confira e ajuste o que precisar (horas de chegada, duração).');
}

// Fecha a lista de vendas ao clicar fora
document.addEventListener('click', (e) => {
    const lista = document.getElementById('resultadoVenda');
    const input = document.getElementById('f_buscaVenda');
    if (lista && e.target !== input && !lista.contains(e.target)) {
        lista.style.display = 'none';
    }
});

// ===== Busca de passageiro cadastrado (autocomplete) =====
let _passCacheCartao = [];

function carregarPassageirosCartao() {
    try {
        const pessoas = StorageManager.getPessoas();
        _passCacheCartao = pessoas
            .filter(p => p.tipo === 'passageiro' || p.tipo === 'cliente')
            .slice()
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
    } catch (e) { _passCacheCartao = []; }
}

function _normalizarCartao(txt) {
    return (txt || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function buscarPassageiroCartao(termo) {
    if (!_passCacheCartao.length) carregarPassageirosCartao();
    const lista = document.getElementById('resultadoPassageiroCartao');
    const termoNorm = _normalizarCartao(termo).trim();

    let resultados = _passCacheCartao;
    if (termoNorm) {
        resultados = _passCacheCartao.filter(p =>
            _normalizarCartao(p.nome).includes(termoNorm) ||
            _normalizarCartao(p.cpf).includes(termoNorm)
        );
    }
    resultados = resultados.slice(0, 50);

    if (resultados.length === 0) {
        lista.innerHTML = '<div class="list-group-item text-muted">Nenhum passageiro encontrado</div>';
        lista.style.display = 'block';
        return;
    }
    lista.innerHTML = resultados.map(p =>
        `<button type="button" class="list-group-item list-group-item-action"
                 onclick="selecionarPassageiroCartao('${p.id}')">
            <strong>${p.nome}</strong>${p.cpf ? ` <small class="text-muted">- ${Utils.formatCPF(p.cpf)}</small>` : ''}
        </button>`
    ).join('');
    lista.style.display = 'block';
}

function selecionarPassageiroCartao(id) {
    const p = _passCacheCartao.find(x => String(x.id) === String(id));
    if (!p) return;
    document.getElementById('f_passNome').value = p.nome;
    document.getElementById('f_passDoc').value = p.cpf ? Utils.formatCPF(p.cpf) : (p.passaporte || '');
    document.getElementById('f_buscaPassageiro').value = p.nome;
    document.getElementById('resultadoPassageiroCartao').style.display = 'none';
    atualizarPreview();
}

// Fecha a lista ao clicar fora
document.addEventListener('click', (e) => {
    const lista = document.getElementById('resultadoPassageiroCartao');
    const input = document.getElementById('f_buscaPassageiro');
    if (lista && e.target !== input && !lista.contains(e.target)) {
        lista.style.display = 'none';
    }
});

// ===== Gerar PDF =====
async function gerarPDF() {
    const ticket = document.getElementById('ticketCartao');
    const btn = event.target.closest('button');
    const textoOriginal = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Gerando...'; }

    try {
        // Captura o cartão como imagem em alta resolução
        const canvas = await html2canvas(ticket, {
            scale: 3,
            useCORS: true,
            backgroundColor: '#002071',
            logging: false
        });
        const imgData = canvas.toDataURL('image/png');

        // Cria o PDF em A4 retrato e centraliza o cartão na página, ajustando
        // a escala para caber inteiro (sem cortar) com uma margem.
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const a4Largura = 210;
        const a4Altura = 297;
        const margem = 12;

        const maxLargura = a4Largura - margem * 2;
        const maxAltura = a4Altura - margem * 2;

        // proporção da imagem do cartão
        const ratio = canvas.width / canvas.height;
        let larguraMM = maxLargura;
        let alturaMM = larguraMM / ratio;
        if (alturaMM > maxAltura) {
            alturaMM = maxAltura;
            larguraMM = alturaMM * ratio;
        }
        // centraliza
        const x = (a4Largura - larguraMM) / 2;
        const y = (a4Altura - alturaMM) / 2;
        pdf.addImage(imgData, 'PNG', x, y, larguraMM, alturaMM);

        const nome = (val('f_passNome') || 'passageiro').replace(/[^a-zA-Z0-9]/g, '_');
        const loc = (val('f_localizador') || 'cartao').toUpperCase();
        pdf.save(`cartao-embarque-${loc}-${nome}.pdf`);

        Utils.showSuccess('Cartão de embarque gerado com sucesso!');
    } catch (e) {
        console.error('Erro ao gerar PDF:', e);
        alert('Erro ao gerar o PDF. Tente novamente.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = textoOriginal; }
    }
}

// Inicialização
function inicializarCartao() {
    carregarPassageirosCartao();
    carregarVendasCache();
    aoMudarCompanhia();
    atualizarPreview();
}
