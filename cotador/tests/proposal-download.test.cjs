const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const pdfMake=require('../assets/vendor/pdfmake.min.js');
const {definition,fontDefinitions,fontFiles}=require('../js/proposal-download.js');
pdfMake.addVirtualFileSystem(require('../assets/vendor/vfs_fonts.js'));
pdfMake.addVirtualFileSystem(Object.fromEntries(fontFiles.map(file=>[file,fs.readFileSync(path.resolve(__dirname,'../assets/fonts/pdf',file)).toString('base64')])));
pdfMake.addFonts(fontDefinitions);
test('infant PDF preserves traveler composition, separate fee and exact group/card totals',async()=>{
 for(const [mode,fee,total] of [['isento','',2000],['valor','200,00',2200]]){
  const d={cliente:'Teste sintético de bebê',orig:'BSB',dest:'POA',adultos:2,bebes:1,totalPax:3,
    babyPricing:{mode,valorPorBebe:fee},valPix:'R$ 1.000,00',valTotalPix:String(total),
    valCartaoBase:String(total),valCartaoFinal:String(total),valParcela:String(total/10),parcelas:10,comJuros:false};
  const doc=definition(d),text=JSON.stringify(doc.content);
  assert.equal(doc.pageSize,'A4');
  assert.match(JSON.stringify(doc.header(1)),/2 adultos · 1 bebê/);
  assert.match(text,/2 na tarifa principal/);
  assert.match(text,mode==='isento'?/1 bebê isento/:/Tarifa de bebê/);
  assert.match(text,/R\$\s1.000,00/);
  const bytes=await new Promise(resolve=>pdfMake.createPdf(doc).getBuffer(resolve));
  assert.equal(bytes.subarray(0,4).toString(),'%PDF');
  assert.match(bytes.toString('latin1'),/\/FontFile2\b/);
 }
});
test('PDF is generated as selectable A4 bytes with all quoted amounts',async()=>{
 const d={cliente:'Cotação de teste',orig:'BSB — Brasília',dest:'POA — Porto Alegre',cia:'LATAM',classe:'Econômica Light',adultos:2,totalPax:2,
 dataIdaISO:'2026-10-27',dataVoltaISO:'2026-11-02',depIda:'10:10',chegIda:'12:45',durIda:'2h 35m',depVolta:'05:15',chegVolta:'07:45',durVolta:'2h 30m',
 valPix:'R$ 2.389,22',valTotalPix:'4778,43',valCartaoBase:'5277,70',valCartaoFinal:'R$ 5.277,70',valParcela:'R$ 527,77',parcelas:'10',comJuros:false};
 const doc=definition(d);
 assert.equal(doc.pageSize,'A4');
 assert.match(JSON.stringify(doc),/R\$\s4.778,43/);
 assert.match(JSON.stringify(doc),/R\$\s5.277,70/);
 const buffer=await new Promise(resolve=>pdfMake.createPdf(doc).getBuffer(resolve));
 assert.equal(buffer.subarray(0,4).toString(),'%PDF');
 assert.ok(buffer.length>10000);
});
test('a repeated click waits for the first PDF and an error allows a retry',async()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace(/<script src="(?:js|assets)\/[^"]+"><\/script>/g,'');
 const dom=new JSDOM(html,{url:'http://localhost:8765',runScripts:'dangerously',beforeParse(w){w.HTMLElement.prototype.scrollIntoView=()=>{};w.alert=()=>{};}});
 const w=dom.window;
 try{
  w.ProposalPDF={};let calls=0,release;
  w.ProposalDownload={download:()=>{calls++;return new Promise(resolve=>{release=resolve;});}};
  const first=w.abrirProposta({cliente:'Teste'}),second=await w.abrirProposta({cliente:'Teste'});
  assert.equal(second,false);assert.equal(calls,1);
  release();assert.equal(await first,true);
  w.ProposalDownload.download=()=>{throw new Error('falha de teste');};
  assert.equal(await w.abrirProposta({cliente:'Teste'}),false);
  w.ProposalDownload.download=()=>{calls++;return Promise.resolve();};
  assert.equal(await w.abrirProposta({cliente:'Teste'}),true);
  assert.equal(calls,2);
 }finally{dom.window.close();}
});
test('long A4 proposal continues onto multiple pages with embedded fonts and links',async()=>{
 const d={cliente:'Teste sintético',orig:'BSB',dest:'POA',cia:'LATAM',dataIdaISO:'2026-10-27',
  depIda:'10:10',chegIda:'12:45',valPix:'100',valTotalPix:'100',linkAereo:'https://example.com/voo',
  obs:Array.from({length:120},(_,i)=>`Linha ${i+1} de condições sintéticas para revisão.`).join('\n')};
 const buffer=await new Promise(resolve=>pdfMake.createPdf(definition(d)).getBuffer(resolve));
 const bytes=buffer.toString('latin1');
 assert.equal(buffer.subarray(0,4).toString(),'%PDF');
 assert.ok((bytes.match(/\/Type\s*\/Page\b/g)||[]).length>=2);
 assert.match(bytes,/\/URI\b/);
 assert.match(bytes,/\/FontFile2\b/);
});
