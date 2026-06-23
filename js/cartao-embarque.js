// ============================================
// Cartão de Embarque - lógica da página
// ============================================

let _qrcodeObj = null;

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
    // Header
    const sigla = val('f_sigla') || 'GOL';
    setText('pv_logo', sigla.toUpperCase());
    setText('pv_cia', (val('f_cia') || 'GOL').toUpperCase());
    setText('pv_loc', (val('f_localizador') || '').toUpperCase());
    document.getElementById('pv_logo').style.background = val('f_cor') || '#ff6a00';

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
    const link = val('f_link') || 'https://voecomkennedy.tur.br';
    const container = document.getElementById('qrcode');
    container.innerHTML = '';
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

        // Cria o PDF no tamanho do cartão (proporção mantida)
        const { jsPDF } = window.jspdf;
        const larguraMM = 100; // largura fixa em mm
        const alturaMM = (canvas.height / canvas.width) * larguraMM;
        const pdf = new jsPDF({
            orientation: alturaMM > larguraMM ? 'portrait' : 'landscape',
            unit: 'mm',
            format: [larguraMM, alturaMM]
        });
        pdf.addImage(imgData, 'PNG', 0, 0, larguraMM, alturaMM);

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
    atualizarPreview();
}
