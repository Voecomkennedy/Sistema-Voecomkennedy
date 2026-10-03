/* Convert airport-local schedules to elapsed time without using the device timezone. */
(function (root) {
  'use strict';
  const formatters = new Map();
  const cache = new Map();
  function formatter(zone) {
    if (!formatters.has(zone)) formatters.set(zone, new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, calendar: 'gregory', numberingSystem: 'latn',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }));
    return formatters.get(zone);
  }
  function wallTime(instant, zone) {
    const parts = {};
    for (const p of formatter(zone).formatToParts(new Date(instant))) parts[p.type] = p.value;
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  }
  function localInstant(date, time, zone) {
    if (!date || !time) throw new Error('Preencha as datas e horas locais de saída e chegada.');
    if (!zone) throw new Error('Aeroporto não reconhecido. Selecione o código IATA ou informe a duração manual conferida.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('Data ou hora inválida.');
    const [y, m, d] = date.split('-').map(Number), [h, min] = time.split(':').map(Number);
    const wall = Date.UTC(y, m - 1, d, h, min);
    if (y < 1900 || h > 23 || min > 59 || new Date(wall).toISOString().slice(0, 10) !== date) throw new Error('Data ou hora inválida.');
    const key = [date, time, zone].join('|');
    if (cache.has(key)) return cache.get(key);
    // Sample both sides of DST/date-line changes; accept only exact round trips.
    // Never silently choose an offset for a duplicated or nonexistent wall time.
    const offsets = new Set();
    try {
      for (let hours = -48; hours <= 48; hours += 6) {
        const sample = wall + hours * 3600000;
        offsets.add(wallTime(sample, zone) - sample);
      }
    } catch { throw new Error('Fuso indisponível neste navegador. Atualize-o ou informe a duração manual conferida.'); }
    const candidates = [...offsets].map(offset => wall - offset).filter(t => wallTime(t, zone) === wall);
    if (candidates.length === 0) throw new Error('Horário local inexistente na mudança de fuso. Confira o bilhete.');
    if (candidates.length !== 1) throw new Error('Horário local repetido na mudança de fuso. Informe a duração manual conferida no bilhete.');
    if (cache.size > 2000) cache.clear();
    cache.set(key, candidates[0]);
    return candidates[0];
  }
  function airportCode(value) {
    return String(value || '').trim().toUpperCase().match(/^([A-Z]{3})(?:$|\s*[—–-])/)?.[1] || '';
  }
  function elapsed(start, end) {
    const departure = localInstant(start.date, start.time, start.zone);
    const arrival = localInstant(end.date, end.time, end.zone);
    const minutes = (arrival - departure) / 60000;
    if (minutes <= 0) throw new Error('A chegada deve ser posterior à saída considerando os fusos. Confira as datas locais.');
    return { minutes, departure, arrival, text: format(minutes) };
  }
  function format(minutes) { return Math.floor(minutes / 60) + 'h ' + String(minutes % 60).padStart(2, '0') + 'm'; }
  function parseDuration(text) {
    const m = String(text).trim().match(/^(?:(\d+)\s*h(?:oras?)?)?\s*(?:(\d+)\s*(?:m|min|minutos?))?$/i);
    if (!m || (!m[1] && !m[2])) return null;
    const minutes = +(m[1] || 0) * 60 + +(m[2] || 0);
    return minutes > 0 && (!m[1] || +(m[2] || 0) < 60) ? minutes : null;
  }
  const api = { localInstant, airportCode, elapsed, format, parseDuration };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FlightTime = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
