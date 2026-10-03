const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/flight-time.js');
const zones = require('../js/airport-timezones.js');
const at = (code,date,time) => ({date,time,zone:zones[code]});
const duration = (a,b) => F.elapsed(a,b).text;
test('GRU/GYN to Las Vegas in February: 16h53, including all connections',()=>{
 for(const origin of ['GRU','GYN']) assert.equal(duration(at(origin,'2027-02-22','23:10'),at('LAS','2027-02-23','11:03')),'16h 53m');
});
test('US daylight saving changes the offset, not a fixed subtraction',()=>{
 assert.equal(duration(at('GRU','2027-07-22','23:10'),at('LAS','2027-07-23','11:03')),'15h 53m');
});
test('Europe winter and summer',()=>{
 assert.equal(duration(at('GRU','2027-02-22','23:00'),at('CDG','2027-02-23','14:00')),'11h 00m');
 assert.equal(duration(at('GRU','2027-07-22','23:00'),at('CDG','2027-07-23','15:00')),'11h 00m');
});
test('Japan and a multi-day itinerary',()=>{
 assert.equal(duration(at('GRU','2027-02-22','23:00'),at('HND','2027-02-24','12:00')),'25h 00m');
});
test('Date-line crossing with arrival on the previous calendar day',()=>{
 assert.equal(duration(at('AKL','2027-02-23','01:00'),at('LAX','2027-02-22','16:00')),'12h 00m');
});
test('Half-hour and quarter-hour zones',()=>{
 assert.equal(duration(at('DEL','2027-02-22','10:00'),at('KTM','2027-02-22','11:45')),'1h 30m');
});
test('Domestic overnight and multi-day connections',()=>{
 assert.equal(duration(at('GYN','2027-02-22','23:10'),at('GRU','2027-02-23','00:50')),'1h 40m');
 assert.equal(duration(at('MIA','2027-02-23','05:30'),at('MIA','2027-02-24','08:10')),'26h 40m');
});
test('Airport transfers across time zones use both airports',()=>{
 assert.equal(duration(at('MIA','2027-02-23','05:30'),at('LAS','2027-02-23','08:10')),'5h 40m');
});
test('Connection across spring DST shift',()=>{
 assert.equal(duration(at('MIA','2027-03-14','01:30'),at('MIA','2027-03-14','03:30')),'1h 00m');
});
test('Do not guess nonexistent or ambiguous DST clock readings',()=>{
 assert.throws(()=>F.localInstant('2027-03-14','02:30',zones.MIA),/inexistente/);
 assert.throws(()=>F.localInstant('2027-11-07','01:30',zones.MIA),/repetido/);
});
test('Incomplete, invalid, and reversed dates are rejected',()=>{
 assert.throws(()=>duration(at('GRU','','23:10'),at('LAS','2027-02-23','11:03')),/Preencha/);
 assert.throws(()=>duration(at('GRU','2027-02-22','23:10'),at('LAS','2027-02-22','11:03')),/posterior/);
 assert.throws(()=>F.localInstant('2027-02-30','10:00',zones.GRU),/inválida/);
 assert.throws(()=>F.localInstant('2027-02-22','25:10',zones.GRU),/inválida/);
 assert.throws(()=>duration(at('ZZZ','2027-02-22','23:10'),at('LAS','2027-02-23','11:03')),/Aeroporto/);
});
test('IATA extraction does not guess free-text city names',()=>{
 assert.equal(F.airportCode('gru — São Paulo'),'GRU');
 assert.equal(F.airportCode('Las Vegas'),'');
 assert.equal(F.airportCode('San Francisco'),'');
 assert.equal(F.airportCode('São Paulo'),'');
 assert.equal(F.airportCode('Miami'),'');
});
test('Manual duration requires an explicit, positive unit',()=>{
 for(const [input,result]of [['16h 53m',1013],['55 min',55],['2h',120],['1h 75m',null],['0h',null],['-1h',null],['12:03',null]]) assert.equal(F.parseDuration(input),result);
});
