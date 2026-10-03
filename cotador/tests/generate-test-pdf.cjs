const fs = require('node:fs');
const path = require('node:path');
const pdfMake = require('../assets/vendor/pdfmake.min.js');
pdfMake.addVirtualFileSystem(require('../assets/vendor/vfs_fonts.js'));
global.ProposalPDF = require('../js/proposal-pdf.js');
const {definition,fontDefinitions,fontFiles} = require('../js/proposal-download.js');
pdfMake.addVirtualFileSystem(Object.fromEntries(fontFiles.map(file=>[file,fs.readFileSync(path.resolve(__dirname,'../assets/fonts/pdf',file)).toString('base64')])));
pdfMake.addFonts(fontDefinitions);
const d = {
  cliente:'Cotação de teste', adultos:2, criancas:0, bebes:0, totalPax:2,
  orig:'BSB — Brasília', dest:'POA — Porto Alegre', cia:'LATAM', ciaVolta:'LATAM',
  classe:'Econômica Light', dataIdaISO:'2026-10-27', dataVoltaISO:'2026-11-02',
  depIda:'10:10', chegIda:'12:45', durIda:'2h 35m', paradaIda:'direto',
  depVolta:'05:15', chegVolta:'07:45', durVolta:'2h 30m', paradaVolta:'direto',
  timing:{fields:{'p-data-chegada-ida':'2026-10-27','p-data-chegada-volta':'2026-11-02'}},
  bagMao:'Inclusa conforme tarifa Light',bagDespIda:'Não inclusa',bagDespVolta:'Não inclusa',
  valPix:'R$ 2.389,22',valTotalPix:'4778,43',valCartaoBase:'5277,70',
  valCartaoFinal:'R$ 5.277,70',valParcela:'R$ 527,77',parcelas:'10',comJuros:false,
  geradoEm:new Intl.DateTimeFormat('pt-BR',{dateStyle:'long'}).format(new Date())
};
const out=path.resolve(__dirname,'../output/pdf/Cotacao_de_teste_BSB_POA_2026.pdf');
fs.mkdirSync(path.dirname(out),{recursive:true});
const logo='data:image/png;base64,'+fs.readFileSync(path.resolve(__dirname,'../assets/airlines/LA.png')).toString('base64');
pdfMake.createPdf(definition(d,{logos:{Ida:logo,Volta:logo}})).getBuffer(buffer=>{fs.writeFileSync(out,buffer);console.log(out);});
