const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
async function app() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM(html.replace(/<script src="js\/[^\"]+"><\/script>/g, ''), {
    url: 'http://localhost:8765', runScripts: 'dangerously',
    beforeParse(w) { w.HTMLElement.prototype.scrollIntoView = () => {}; w.alert = () => {}; }
  });
  const {window:w} = dom;
  for(const file of ['airport-timezones.js','flight-time.js','timing-form.js']) w.eval(fs.readFileSync(path.join(root,'js',file),'utf8'));
  if(w.document.readyState === 'loading') await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  const el=id=>w.document.getElementById(id);
  const set=(id,v)=>{if(el(id).type==='checkbox')el(id).checked=v;else el(id).value=v;el(id).dispatchEvent(new w.Event('input',{bubbles:true}));el(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
  return {dom,w,el,set};
}
function route(a) {
 for(const [id,v]of Object.entries({'p-orig':'GRU — São Paulo','p-dest':'LAS — Las Vegas','p-data-ida':'2027-02-22','p-data-chegada-ida':'2027-02-23','p-hora-dep':'23:10','p-hora-cheg':'11:03','p-somente-ida':true})) a.set(id,v);
}
test('complete proposal calculates, clears stale result, validates, and ignores device timezone',async()=>{
 const a=await app();try{route(a);assert.equal(a.el('p-duracao-ida').value,'16h 53m');assert.equal(a.w.TimingUI.validate('proposta'),true);
 a.set('p-data-chegada-ida','');assert.equal(a.el('p-duracao-ida').value,'');assert.equal(a.w.TimingUI.validate('proposta'),false);
 a.set('p-data-chegada-ida','2027-02-23');a.set('p-dest','ZZZ');assert.equal(a.el('p-duracao-ida').value,'');assert.equal(a.w.TimingUI.validate('proposta'),false);
 }finally{await Promise.resolve();a.dom.window.close();}
});
test('manual override is explicit, survives unrelated edits, and expires when route changes',async()=>{
 const a=await app();try{route(a);a.set('p-duracao-ida-manual',true);a.set('p-duracao-ida','17h 00m');assert.equal(a.w.TimingUI.validate('proposta'),true);
 a.set('p-cliente','Cliente de teste');assert.equal(a.el('p-duracao-ida').value,'17h 00m');
 a.set('p-dest','MIA');assert.equal(a.el('p-duracao-ida-manual').checked,false);assert.equal(a.el('p-duracao-ida').value,'13h 53m');
 }finally{await Promise.resolve();a.dom.window.close();}
});
test('connections calculate overnight and reject schedules outside the itinerary',async()=>{
 const a=await app();try{route(a);a.set('p-parada-ida','1escala');a.set('p-escala-cidade','MIA');
 for(const [k,v]of Object.entries({'chegada-data':'2027-02-23','chegada-hora':'05:30','saida-data':'2027-02-23','saida-hora':'08:10'}))a.set('p-conexao-ida1-'+k,v);
 assert.equal(a.el('p-escala-tempo').value,'2h 40m');assert.equal(a.w.TimingUI.validate('proposta'),true);
 a.set('p-conexao-ida1-saida-data','2027-02-24');assert.equal(a.w.TimingUI.validate('proposta'),false);
 }finally{await Promise.resolve();a.dom.window.close();}
});
test('connection airport transfers use the departure airport timezone',async()=>{
 const a=await app();try{route(a);a.set('p-parada-ida','1escala');a.set('p-escala-cidade','MIA');a.set('p-troca-ida1',true);a.set('p-troca-ida1-dest','LAS');
 for(const [k,v]of Object.entries({'chegada-data':'2027-02-23','chegada-hora':'05:30','saida-data':'2027-02-23','saida-hora':'08:10'}))a.set('p-conexao-ida1-'+k,v);
 assert.equal(a.el('p-escala-tempo').value,'5h 40m');
 }finally{await Promise.resolve();a.dom.window.close();}
});
test('return itinerary reverses airports and respects multitrecho',async()=>{
 const a=await app();try{route(a);a.set('p-somente-ida',false);a.set('p-data-volta','2027-03-01');a.set('p-data-chegada-volta','2027-03-02');a.set('p-hora-dep-v','12:00');a.set('p-hora-cheg-v','08:00');
 assert.equal(a.el('p-duracao-volta').value,'15h 00m');
 a.set('p-multitrecho',true);a.set('p-orig-volta','MIA');a.set('p-dest-volta','GYN');assert.equal(a.el('p-duracao-volta').value,'18h 00m');
 }finally{await Promise.resolve();a.dom.window.close();}
});
test('snapshot stores dates and reviewed manual values; old records cannot retain bad durations',async()=>{
 const a=await app();try{route(a);a.set('p-duracao-ida-manual',true);a.set('p-duracao-ida','17h 00m');const saved=a.w.TimingUI.snapshot('proposta');
 a.w.TimingUI.restore('proposta',JSON.parse(JSON.stringify(saved)));assert.equal(a.el('p-data-chegada-ida').value,'2027-02-23');assert.equal(a.el('p-duracao-ida').value,'17h 00m');assert.equal(a.w.TimingUI.validate('proposta'),true);
 a.w.restaurarProposta({orig:'GRU',dest:'LAS',somenteIda:true,dataIdaISO:'2027-02-22',depIda:'23:10',chegIda:'11:03',durIda:'11h 53m'});
 assert.equal(a.el('p-duracao-ida').value,'');assert.equal(a.el('p-somente-ida').checked,true);assert.equal(a.w.TimingUI.validate('proposta'),false);
 a.w.limparProposta();assert.equal(a.el('p-data-chegada-ida').value,a.el('p-data-ida').value);assert.equal(a.el('p-duracao-ida-manual').checked,false);
 }finally{await Promise.resolve();a.dom.window.close();}
});
test('voucher legs and wait use their own airports and dates; hotel-only voucher stays valid',async()=>{
 const a=await app();try{assert.equal(a.w.TimingUI.validate('voucher'),true);
 const vals={'v-ida-orig1':'GRU','v-ida-dest1':'MIA','v-ida-data-dep1':'2027-02-22','v-ida-hora-dep1':'23:10','v-ida-data-cheg1':'2027-02-23','v-ida-hora-cheg1':'05:30','v-ida-parada':'escala','v-ida-orig2':'MIA','v-ida-dest2':'LAS','v-ida-data-dep2':'2027-02-23','v-ida-hora-dep2':'08:10','v-ida-data-cheg2':'2027-02-23','v-ida-hora-cheg2':'11:03'};
 for(const [k,v]of Object.entries(vals))a.set(k,v);
 assert.equal(a.el('v-ida-dur1').value,'8h 20m');assert.equal(a.el('v-ida-dur2').value,'5h 53m');assert.equal(a.el('v-ida-esc-tempo').value,'2h 40m');assert.equal(a.w.TimingUI.validate('voucher'),true);
 a.set('v-ida-data-dep2','2027-02-22');assert.equal(a.w.TimingUI.validate('voucher'),false);
 }finally{await Promise.resolve();a.dom.window.close();}
});
test('restoring a voucher without ISO dates never borrows dates from the last voucher',async()=>{
 const a=await app();try{
 for(const [k,v]of Object.entries({'v-ida-orig1':'GRU','v-ida-dest1':'MIA','v-ida-data-dep1':'2027-02-22','v-ida-hora-dep1':'23:10','v-ida-data-cheg1':'2027-02-23','v-ida-hora-cheg1':'05:30'}))a.set(k,v);
 a.w.restaurarVoucher({idaOrig1:'GRU',idaDest1:'LAS',idaHoraDep1:'23:10',idaHoraCheg1:'11:03',idaDur1:'11h 53m'});
 assert.equal(a.el('v-ida-data-dep1').value,'');assert.equal(a.el('v-ida-data-cheg1').value,'');assert.equal(a.el('v-ida-dur1').value,'');assert.equal(a.w.TimingUI.validate('voucher'),false);
 }finally{await Promise.resolve();a.dom.window.close();}
});
test('all three stops in each direction are available and a manual stop is cleared on route edit',async()=>{
 const a=await app();try{route(a);a.set('p-somente-ida',false);a.set('p-parada-ida','3escalas');a.set('p-parada-volta','3escalas');
 for(const id of ['p-escala-tempo','p-escala-tempo2','p-escala-tempo3','p-escala-tempo-v','p-escala-tempo-v2','p-escala-tempo-v3'])assert.equal(a.el(id).disabled,false);
 a.set('p-escala-tempo3-manual',true);a.set('p-escala-tempo3','1h 30m');assert.equal(a.el('p-escala-tempo3').value,'1h 30m');
 a.set('p-escala-cidade3','MIA');assert.equal(a.el('p-escala-tempo3-manual').checked,false);assert.equal(a.el('p-escala-tempo3').value,'');
 a.set('p-parada-ida','direto');assert.equal(a.el('p-escala-tempo3').disabled,true);
 }finally{await Promise.resolve();a.dom.window.close();}
});
test('date-line round trip can start its return on the previous local calendar day',async()=>{
 const a=await app();try{
 for(const [k,v] of Object.entries({'p-orig':'AKL','p-dest':'LAX','p-data-ida':'2027-02-23','p-data-chegada-ida':'2027-02-22','p-hora-dep':'01:00','p-hora-cheg':'16:00','p-data-volta':'2027-02-22','p-data-chegada-volta':'2027-02-24','p-hora-dep-v':'23:00','p-hora-cheg-v':'12:00'}))a.set(k,v);
 assert.equal(a.el('p-data-volta').min,'');assert.equal(a.w.TimingUI.validate('proposta'),true);
 a.set('p-hora-dep-v','15:00');assert.equal(a.w.TimingUI.validate('proposta'),false);
 }finally{await Promise.resolve();a.dom.window.close();}
});
test('fresh and reset proposal dates use the device local day, while manual and restored dates stay owned',async()=>{
 const a=await app();try{
 const now=new Date(), today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 assert.equal(a.el('p-data-ida').value,today);
 assert.equal(a.el('p-data-volta').value,today);
 a.set('p-data-ida','2027-01-10');
 assert.equal(a.el('p-data-chegada-ida').value,'2027-01-10');
 assert.equal(a.el('p-data-volta').value,'2027-01-10');
 a.set('p-data-volta','2027-01-20');
 a.set('p-data-ida','2027-01-12');
 assert.equal(a.el('p-data-volta').value,'2027-01-20');
 a.w.limparProposta();
 assert.equal(a.el('p-data-ida').value,today);
 a.w.restaurarProposta({cliente:'Antiga',dataIdaISO:'2027-02-10',dataVoltaISO:'2027-02-18',somenteIda:false});
 assert.equal(a.el('p-data-ida').value,'2027-02-10');
 assert.equal(a.el('p-data-volta').value,'2027-02-18');
 assert.equal(a.el('p-data-chegada-ida').value,'');
 }finally{a.dom.window.close();}
});
test('direct overnight date is inferred, and connection defaults never fabricate times or activate an empty wait',async()=>{
 const a=await app();try{
 for(const [id,v] of Object.entries({'p-orig':'BSB','p-dest':'POA','p-data-ida':'2026-10-27','p-hora-dep':'23:10','p-hora-cheg':'01:45','p-somente-ida':true}))a.set(id,v);
 assert.equal(a.el('p-data-chegada-ida').value,'2026-10-28');
 a.set('p-parada-ida','2escalas');
 assert.equal(a.el('p-conexao-ida1-chegada-data').value,'2026-10-27');
 assert.equal(a.el('p-conexao-ida1-chegada-hora').value,'');
 assert.equal(a.el('p-conexao-ida2-saida-hora').value,'');
 assert.equal(a.w.TimingUI.validate('proposta'),true);
 a.set('p-conexao-ida1-chegada-data','2026-10-27');
 assert.equal(a.w.TimingUI.validate('proposta'),false);
 }finally{a.dom.window.close();}
});
