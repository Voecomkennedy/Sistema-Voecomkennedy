const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, ResourceLoader, VirtualConsole } = require('../../cotador/node_modules/jsdom');

const root = path.resolve(__dirname, '../..');
const person = { id: 'client-conversion', tipo: 'cliente', nome: 'Cliente sintético' };
const other = { id: 'client-independent', tipo: 'cliente', nome: 'Outro cliente sintético' };
const quote = {
    id: 'quote-conversion', status: 'aberta', clienteId: person.id, nomeCliente: person.nome,
    origem: 'BSB', destino: 'POA', dataSaidaIda: '2027-10-27', horaSaidaIda: '10:10',
    tipoViagem: 'so-ida', companhiaAerea: 'LATAM', valorTotalPix: 1500, adultos: 1
};

class LocalResources extends ResourceLoader {
    fetch(url) {
        const parsed = new URL(url);
        if (parsed.hostname === 'qa.local') {
            const stubs = {
                '/js/auth.js': 'window.Auth={proteger:async()=>true,logout(){}};',
                '/js/cloud-sync.js': 'window.CloudSync={init:async()=>true,agendarBackup(){}};',
                '/js/supabase-config.js': 'window.getSupabaseClient=()=>({});'
            };
            if (stubs[parsed.pathname]) return Promise.resolve(Buffer.from(stubs[parsed.pathname]));
            const file = path.join(root, decodeURIComponent(parsed.pathname));
            return Promise.resolve(fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file) : Buffer.alloc(0));
        }
        if (parsed.pathname.includes('bootstrap.bundle')) {
            return Promise.resolve(Buffer.from('window.bootstrap={Modal:class{constructor(el){this.el=el;}show(){}hide(){this.el.dispatchEvent(new Event("hidden.bs.modal"));}}};'));
        }
        return Promise.resolve(Buffer.alloc(0)); // No requests to real services.
    }
}

async function fixture({ storedQuote = quote, storedQuotes = null, transfer = quote, sales = [] } = {}) {
    const dom = new JSDOM(fs.readFileSync(path.join(root, 'vendas.html'), 'utf8'), {
        url: 'https://qa.local/vendas.html?from_cotacao=true',
        runScripts: 'dangerously', resources: new LocalResources(), virtualConsole: new VirtualConsole(),
        beforeParse(w) {
            w.fetch = () => { throw new Error('NETWORK FORBIDDEN'); };
            w.confirm = () => true;
            w.alert = () => {};
            w.HTMLElement.prototype.scrollIntoView = () => {};
            for (const [key, value] of Object.entries({
                emissao_pessoas: [person, other], emissao_cotacoes: storedQuotes || (storedQuote ? [storedQuote] : []),
                emissao_vendas: sales, cotacao_para_venda: transfer
            })) w.localStorage.setItem(key, JSON.stringify(value));
        }
    });
    const w = dom.window;
    const waitFor = async predicate => {
        const deadline = Date.now() + 10000;
        while (!predicate()) {
            if (Date.now() > deadline) throw new Error('Sales page did not reach expected state');
            await new Promise(resolve => setTimeout(resolve, 15));
        }
    };
    await waitFor(() => w.document.documentElement.dataset.appAutenticado === 'true');
    w.__errors = [];
    w.Utils.showError = message => w.__errors.push(message);
    return { dom, w, waitFor };
}

function completeSale(w, clientId = person.id) {
    const d = w.document;
    w.definirClientePorId(clientId);
    for (const [id, value] of Object.entries({
        origem: 'BSB', destino: 'POA', dataEmbarque: '2027-10-27', horaEmbarque: '10:10',
        quantidadePassageiros: '1', valorVenda: 'R$ 1.500,00', valorLucro: 'R$ 100,00',
        formaPagamento: 'pix', statusPagamento: 'pendente', valorRecebido: 'R$ 0,00', dataPagamento: ''
    })) d.getElementById(id).value = value;
    const carrier = [...d.getElementById('companhiaAerea').options].find(o => /LATAM/i.test(o.text));
    if (carrier) d.getElementById('companhiaAerea').value = carrier.value;
    d.getElementById('clienteViaja').checked = true;
    w.gerarCamposPassageiros();
    d.getElementById('localizador_1').value = 'SINT123';
    w.calcularMargem();
    w.validarValoresFinanceiros();
    assert.deepEqual([...d.getElementById('formVenda').elements].filter(el => !el.checkValidity()).map(el => el.id), []);
}


module.exports={fixture,completeSale,person,quote};
