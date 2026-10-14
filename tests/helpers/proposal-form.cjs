// Diagnostic tests: production HTML/JS in an isolated synthetic DOM. No real network.
const assert = require('node:assert/strict');
const {page,person} = require('./proposal-dom.cjs');
const frame = w => w.document.querySelector('#quadroProposta').contentWindow;
function fill(w, label, pax=1) {
  w.selecionarContatoProposta(person.id);
  const f=frame(w);
  for (const [id,value] of Object.entries({
    'p-orig':'BSB','p-dest':'POA','p-data-ida':'2027-10-27',
    'p-hora-dep':'10:10','p-hora-cheg':'12:45','p-data-volta':'2027-11-02',
    'p-hora-dep-v':'05:15','p-hora-cheg-v':'07:45','p-cia':'LATAM',
    'p-classe':'Economica Light','p-adultos':String(pax),'p-val-total-pix':String(pax*1000),
    'p-val-pix-pessoa':'1000','p-val-cartao':String(pax*1100),'p-parcelas':'10','p-obs':label
  })) {
    const el=f.document.getElementById(id); el.value=value;
    el.dispatchEvent(new f.Event('input',{bubbles:true}));
    el.dispatchEvent(new f.Event('change',{bubbles:true}));
  }
  if (!f.abrirProposta.busy) assert.ok(f.coletarDadosProposta(), 'valid synthetic proposal');
}
async function fixture(){return page('cotacoes',{emissao_pessoas:[person]});}

module.exports = {fixture,fill,frame};
