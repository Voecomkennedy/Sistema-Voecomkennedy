const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const P=require('../js/proposal-pdf');
const d={cliente:'Cliente Exemplo',orig:'GRU — São Paulo',dest:'LAS — Las Vegas',cia:'American Airlines',ciaVolta:'American Airlines',classe:'Econômica',totalPax:2,adultos:2,dataIdaISO:'2027-02-22',dataVoltaISO:'2027-03-09',depIda:'23:10',chegIda:'11:03',depVolta:'08:00',chegVolta:'08:30',timing:{fields:{'p-data-chegada-ida':'2027-02-23','p-data-chegada-volta':'2027-03-10'}},valPix:'R$ 3.665,89',valTotalPix:'R$ 7.331,78',valCartaoBase:'R$ 7.331,78',valCartaoFinal:'R$ 8.097,84',valParcela:'R$ 809,78',parcelas:'10',comJuros:true};
const bag={bagAdd:{ativo:true,opcaoSelecionada:'sem',bagRes:{baseTotal:'7331.78',basePP:'3665.89',comTotal:'8731.78',comPP:'4365.89'}}};
test('local calendar arrival indicators cover same day, next day, +2 and date line',()=>{
 assert.equal(P.dayDelta('2027-02-22','2027-02-23'),1);
 assert.equal(P.dayDelta('2027-02-22','2027-02-24'),2);
 assert.equal(P.dayDelta('2027-02-22','2027-02-21'),-1);
 assert.equal(P.dayDelta('2027-02-22','2027-02-22'),0);
 assert.equal(P.dayDelta('2027-02-22',''),null);
 assert.equal((P.render(d).match(/<sup>\+1<\/sup>/g)||[]).length,2);
});
test('operator is omitted only when it matches the marketing carrier',()=>{
 assert.doesNotMatch(P.render({...d,ciaOperadoraIda:'AMERICAN AIRLINES'}),/Operado por/);
 assert.match(P.render({...d,ciaOperadoraIda:'GOL'}),/Operado por GOL/);
});
test('comparison replaces the standard payment block and preserves option totals',()=>{
 const html=P.render({...d,calc:bag},{cardDivisor:.9054});
 assert.equal((html.match(/data-price-mode="comparison"/g)||[]).length,1);
 assert.doesNotMatch(html,/data-price-mode="standard"/);
 assert.equal(P.options({...d,calc:bag})[1].total,8731.78);
 assert.match(html,/964,41/);
 assert.match(html,/conforme opção escolhida/);
});
test('four tariff choices retain all choices without duplicated standard values',()=>{
 const calc={compAtivo:true,compOpcaoSelecionada:'a'};
 for(const [i,k]of ['A','B','C','D'].entries())calc['compOpt'+k]=JSON.stringify({label:k,total:1000+i*100,porPessoa:500+i*50});
 const html=P.render({...d,calc});
 assert.equal(P.options({...d,calc}).length,4);
 assert.equal((html.match(/data-price-mode="comparison"/g)||[]).length,2);
 assert.doesNotMatch(html,/data-price-mode="standard"/);
});
test('invalid and simultaneous comparison inputs stop generation',()=>{
 assert.throws(()=>P.render({...d,calc:{...bag,compAtivo:true}}),/apenas um/);
 assert.throws(()=>P.render({...d,calc:{compAtivo:true}}),/Recalcule/);
 assert.throws(()=>P.render({...d,calc:{bagAdd:{ativo:true,bagRes:{baseTotal:'NaN'}}}}),/inválidos/);
});
test('negotiated card values are never extrapolated to a different baggage choice',()=>{
 const manual={...d,valCartaoBase:'R$ 7.900,00'};
 assert.equal(P.cardForOption(manual,{total:8731.78,selected:false},{cardDivisor:.9054}),null);
 assert.deepEqual(P.cardForOption(manual,{total:7331.78,selected:true},{cardDivisor:.9054}),{label:'10x de R$ 809,78',sub:'total R$ 8.097,84'});
 const noInterest=P.cardForOption({...d,comJuros:false},{total:8000},{cardDivisor:.9054});
 assert.match(noInterest.label,/800,00/);assert.match(noInterest.sub,/sem juros/);
});
test('all connections, flights and airport transfers survive the template change',()=>{
 const html=P.render({...d,somenteIda:true,paradaIda:'3escalas',escalaCidadeIda:'MIA',escalaCidade2Ida:'DFW',escalaCidade3Ida:'LAX',escalaTempo3Ida:'2h 10m',vooIda:'AA1',vooIda2:'AA2',vooIda3:'AA3',vooIda4:'AA4',trocaIda2:true,trocaIda2Dest:'DAL'});
 for(const text of ['MIA','DFW','LAX','2h 10m','AA1','AA2','AA3','AA4','DAL','Troca de aeroporto'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/data-direction="Volta"/);
});
test('customer strings and hotel URLs cannot inject active markup',()=>{
 const html=P.render({...d,cliente:'<script>alert(1)</script>',obs:'<img onerror=alert(1)>',hotelNome:'Hotel',linkHotel:'javascript:alert(1)'});
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<img onerror/);assert.doesNotMatch(html,/href="javascript:/);
});
test('known airline assets are local and unknown carriers retain readable text',()=>{
 assert.ok(P.getLogo('American Airlines'));
 const unknown=P.render({...d,cia:'Companhia Exemplo',ciaVolta:'Companhia Exemplo'});
 assert.match(unknown,/Companhia Exemplo/);assert.doesNotMatch(unknown,/class="airline-logo"/);
 for(const file of Object.values(require('../js/airline-logos')))assert.ok(fs.existsSync(path.join(__dirname,'../assets/airlines',file)),file);
});
