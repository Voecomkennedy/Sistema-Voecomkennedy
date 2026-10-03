/* Flight/connection schedules. All dates and times are local to their airport. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const value = id => $(id)?.value.trim() || '';
  const checked = id => !!$(id)?.checked;
  const groups = [];
  const addedFields = { proposta: [], voucher: [] };
  const dates = new Map();
  let restoring = false;
  const localToday = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-'); };
  function setAuto(id, next) {
    const el = $(id); if (!el || !next || restoring) return;
    const state = dates.get(id);
    if ((!state && !el.value) || (state?.source === 'auto' && el.value === state.value)) {
      el.value = next; dates.set(id, { source: 'auto', value: next });
    }
  }
  function trackDate(event) {
    const el = event.target;
    if (el?.type === 'date' && el.id && !restoring) dates.set(el.id, { source: 'manual', value: el.value });
  }
  function autoDates() {
    const ida = value('p-data-ida');
    for (const direction of ['ida', 'volta']) {
      const departure = value('p-data-' + direction);
      const arrivalId = 'p-data-chegada-' + direction;
      let inferred = departure;
      const suffix = direction === 'ida' ? '' : '-v';
      const [from,to] = proposalRoute(direction);
      const depTime = value('p-hora-dep' + suffix), arrTime = value('p-hora-cheg' + suffix);
      if (departure && depTime && arrTime && zone(from) && zone(to)) {
        const choices = [-1,0,1,2].flatMap(delta => {
          const d = new Date(departure + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + delta);
          const candidate = d.toISOString().slice(0,10);
          try { const result = FlightTime.elapsed(point(from,departure,depTime),point(to,candidate,arrTime));
            return result.minutes <= 18*60 ? [{date:candidate,minutes:result.minutes}] : [];
          } catch { return []; }
        });
        if (choices.length) inferred = choices.sort((a,b) => a.minutes-b.minutes)[0].date;
      }
      setAuto(arrivalId, inferred);
    }
    const chegadaIda = value('p-data-chegada-ida');
    setAuto('p-data-volta', chegadaIda || ida);
    setAuto('p-data-chegada-volta', value('p-data-volta'));
    for (const direction of ['ida', 'volta']) {
      let known = value('p-data-' + direction);
      for (let n = 1; n <= 3; n++) {
        const prefix = 'p-conexao-' + direction + n;
        setAuto(prefix + '-chegada-data', known);
        setAuto(prefix + '-saida-data', value(prefix + '-chegada-data'));
        known = value(prefix + '-saida-data') || known;
      }
    }
    for (const direction of ['ida', 'volta']) {
      const p = 'v-' + direction;
      // Flight dates are seeded only when a flight itself has been entered.
      const hasFirst = [1,2].some(n => value(p+'-orig'+n) || value(p+'-dest'+n) || value(p+'-hora-dep'+n) || value(p+'-hora-cheg'+n));
      if (!hasFirst) continue;
      setAuto(p+'-data-dep1', direction === 'ida' ? ida : value('v-ida-data-cheg2') || value('v-ida-data-cheg1') || chegadaIda || ida);
      setAuto(p+'-data-cheg1', value(p+'-data-dep1'));
      if (value(p+'-parada') === 'escala') {
        setAuto(p+'-data-dep2', value(p+'-data-cheg1'));
        setAuto(p+'-data-cheg2', value(p+'-data-dep2'));
      }
    }
  }
  const zone = airport => window.AIRPORT_TIMEZONES?.[FlightTime.airportCode(airport)];
  function field(parent, id, label, type, section) {
    const wrap = document.createElement('div'); wrap.className = 'field';
    const lab = document.createElement('label'); lab.htmlFor = id; lab.textContent = label;
    const input = document.createElement('input'); input.id = id; input.type = type;
    wrap.append(lab, input); parent.append(wrap); addedFields[section].push(id);
  }
  function point(airport, date, time) { return { airport, date, time, zone: zone(airport) }; }
  function addGroup(config) {
    const output = $(config.id);
    output.readOnly = true; output.placeholder = 'Aguardando horários locais';
    delete output.dataset.manual;
    const label = document.createElement('label'); label.className = 'timing-manual';
    const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.id = config.id + '-manual';
    label.append(toggle, document.createTextNode('Informar duração manual conferida no bilhete'));
    const status = document.createElement('p'); status.id = config.id + '-status'; status.className = 'timing-status';
    output.setAttribute('aria-describedby', status.id);
    output.after(label, status);
    const g = { ...config, output, toggle, status, signature: null, manualSignature: null, result: null, valid: false };
    groups.push(g);
    toggle.addEventListener('change', () => {
      output.value = ''; g.manualSignature = null;
      refresh();
      if (toggle.checked) output.focus();
    });
    output.addEventListener('input', () => {
      if (toggle.checked) g.manualSignature = signature(g);
    });
  }
  function signature(g) { return JSON.stringify([g.points(), g.context?.()]); }
  function refreshGroup(g) {
    const sig = signature(g);
    if (g.signature !== null && g.signature !== sig && g.toggle.checked) {
      g.toggle.checked = false; g.output.value = ''; g.manualSignature = null;
    }
    g.signature = sig; g.result = null; g.valid = false;
    g.output.readOnly = !g.toggle.checked;
    g.output.disabled = !g.active(); g.toggle.disabled = !g.active();
    if (!g.active()) { g.output.value = ''; g.toggle.checked = false; g.manualSignature = null; g.status.textContent = ''; return; }
    if (g.toggle.checked) {
      const mins = FlightTime.parseDuration(g.output.value);
      g.valid = mins !== null && g.manualSignature === sig;
      g.status.textContent = g.valid ? 'Duração manual conferida. Alterar a rota ou os horários exige nova conferência.' : 'Digite a duração conferida, por exemplo: 16h 53m ou 55 min.';
    } else {
      g.output.value = '';
      const [a, b] = g.points();
      try {
        g.result = FlightTime.elapsed(a, b); g.output.value = g.result.text; g.valid = true;
        g.status.textContent = 'Calculado pelos fusos dos aeroportos ' + FlightTime.airportCode(a.airport) + ' → ' + FlightTime.airportCode(b.airport) + (g.total ? '. Inclui as conexões.' : '.');
      } catch (error) { g.status.textContent = g.connection && ![a, b].some(p => p.date || p.time) ? 'Abra os horários da conexão para calcular, ou informe a espera manual conferida. Sem esses dados, a espera não será exibida.' : error.message; }
    }
    g.output.setAttribute('aria-invalid', g.valid ? 'false' : 'true');
  }
  function refresh() { groups.forEach(refreshGroup); }
  function proposalRoute(direction) {
    if (direction === 'ida') return [value('p-orig'), value('p-dest')];
    return checked('p-multitrecho') ? [value('p-orig-volta'), value('p-dest-volta')] : [value('p-dest'), value('p-orig')];
  }
  function initProposal() {
    for (const direction of ['ida', 'volta']) {
      const suffix = direction === 'ida' ? '' : '-v';
      const active = () => direction === 'ida' || !checked('p-somente-ida');
      const arrivalDate = 'p-data-chegada-' + direction;
      const row = document.createElement('div'); row.className = 'field-row timing-dates';
      field(row, arrivalDate, 'Data local de chegada — ' + direction, 'date', 'proposta');
      const note = document.createElement('p'); note.className = 'timing-status';
      note.textContent = 'Use a data mostrada no bilhete no destino: pode ser no mesmo dia, no dia seguinte ou até antes no calendário. Não usamos a data do seu computador.';
      row.append(note);
      const output = $('p-duracao-' + direction);
      output.closest('.field-row').before(row);
      const hint = document.querySelector('label[for="p-duracao-' + direction + '"] .label-hint');
      if (hint) hint.textContent = 'com fusos e conexões';
      const mainPoints = () => {
        const [a, b] = proposalRoute(direction);
        return [point(a, value('p-data-' + direction), value('p-hora-dep' + suffix)), point(b, value(arrivalDate), value('p-hora-cheg' + suffix))];
      };
      addGroup({ id: output.id, section: 'proposta', active, total: true, points: mainPoints,
        context: () => [checked('p-somente-ida'), checked('p-multitrecho'), value('p-parada-' + direction)] });
      for (let n = 1; n <= 3; n++) {
        const tail = (direction === 'ida' ? '' : '-v') + (n === 1 ? '' : n);
        const id = 'p-escala-tempo' + tail;
        const prefix = 'p-conexao-' + direction + n;
        const detail = document.createElement('details'); detail.className = 'timing-connection';
        const summary = document.createElement('summary'); summary.textContent = 'Calcular espera pelos horários da conexão'; detail.append(summary);
        const dates = document.createElement('div'); dates.className = 'field-row';
        field(dates, prefix + '-chegada-data', 'Data de chegada à conexão', 'date', 'proposta');
        field(dates, prefix + '-chegada-hora', 'Hora de chegada à conexão', 'time', 'proposta');
        field(dates, prefix + '-saida-data', 'Data de saída do próximo voo', 'date', 'proposta');
        field(dates, prefix + '-saida-hora', 'Hora de saída do próximo voo', 'time', 'proposta');
        detail.append(dates); $(id).closest('.field-row').after(detail);
        addGroup({ id, section: 'proposta', direction, connection: n,
          active: () => active() && Number(value('p-parada-' + direction).match(/\d/)?.[0] || 0) >= n,
          context: () => [mainPoints(), checked('p-troca-' + direction + n)],
          points: () => {
            const airport = value('p-escala-cidade' + tail);
            const next = checked('p-troca-' + direction + n) ? value('p-troca-' + direction + n + '-dest') : airport;
            return [point(airport, value(prefix + '-chegada-data'), value(prefix + '-chegada-hora')),
              point(next, value(prefix + '-saida-data'), value(prefix + '-saida-hora'))];
          }
        });
      }
    }
  }
  function initVoucher() {
    for (const direction of ['ida', 'volta']) {
      const p = 'v-' + direction;
      const isConnection = () => value(p + '-parada') === 'escala';
      const points = n => [point(value(p + '-orig' + n), value(p + '-data-dep' + n), value(p + '-hora-dep' + n)),
        point(value(p + '-dest' + n), value(p + '-data-cheg' + n), value(p + '-hora-cheg' + n))];
      const hasFlight = () => [1, 2].some(n => (n === 1 || isConnection()) && points(n).some(x => x.airport || x.time));
      for (const n of [1, 2]) addGroup({ id: p + '-dur' + n, section: 'voucher',
        active: () => hasFlight() && (n === 1 || isConnection()), points: () => points(n), context: isConnection });
      addGroup({ id: p + '-esc-tempo', section: 'voucher', direction, connection: 1,
        active: () => hasFlight() && isConnection(), points: () => [points(1)[1], points(2)[0]], context: () => [points(1), points(2)] });
    }
  }
  function snapshot(section) {
    return { version: 1,
      fields: Object.fromEntries(addedFields[section].map(id => [id, value(id)])),
      manual: Object.fromEntries(groups.filter(g => g.section === section && g.toggle.checked && g.valid)
        .map(g => [g.id, { value: g.output.value, signature: signature(g) }])) };
  }
  function restore(section, saved) {
    restoring = true;
    const data = saved?.version === 1 ? saved : null;
    const nativeDates = section === 'proposta' ? ['p-data-ida','p-data-volta'] :
      ['v-ida-data-dep1','v-ida-data-cheg1','v-ida-data-dep2','v-ida-data-cheg2',
        'v-volta-data-dep1','v-volta-data-cheg1','v-volta-data-dep2','v-volta-data-cheg2'];
    nativeDates.forEach(id => dates.set(id, {source:'restored',value:value(id)}));
    addedFields[section].forEach(id => { $(id).value = typeof data?.fields?.[id] === 'string' ? data.fields[id] : ''; dates.set(id, {source:'restored',value:$(id).value}); });
    groups.filter(g => g.section === section).forEach(g => {
      g.signature = null; g.toggle.checked = false; g.manualSignature = null; g.output.value = '';
      const manual = data?.manual?.[g.id];
      if (manual && manual.signature === signature(g) && FlightTime.parseDuration(manual.value) !== null) {
        g.toggle.checked = true; g.output.value = manual.value; g.manualSignature = manual.signature;
      }
    });
    restoring = false; refresh();
  }
  function reset(section) {
    restore(section);
    if (section === 'proposta') { dates.clear(); setAuto('p-data-ida', localToday()); autoDates(); refresh(); }
  }
  function validate(section) {
    refresh();
    const active = groups.filter(g => g.section === section && g.active());
    // A connection may be omitted entirely. Partial schedules must never produce a guessed wait.
    const invalid = active.find(g => !g.valid && (!g.connection || g.toggle.checked ||
      g.points().some(p => p.time) ||
      (g.section === 'proposta' && ['chegada','saida'].some(part =>
        dates.get('p-conexao-'+g.direction+g.connection+'-'+part+'-data')?.source === 'manual'))));
    if (invalid) return fail(invalid, 'Confira a duração: ' + invalid.status.textContent);
    // Verify the chronological order of explicit connection schedules in the complete itinerary.
    if (section === 'proposta') for (const direction of ['ida', 'volta']) {
      const total = active.find(g => g.id === 'p-duracao-' + direction);
      if (!total?.result) continue;
      let previous = total.result.departure;
      for (const g of active.filter(g => g.direction === direction && g.result)) {
        if (g.result.departure <= previous || g.result.arrival >= total.result.arrival) {
          return fail(g, 'A conexão está fora da ordem ou do período da viagem. Confira as datas e horas locais.');
        }
        previous = g.result.arrival;
      }
    }
    if (section === 'proposta') {
      const ida = active.find(g => g.id === 'p-duracao-ida');
      const volta = active.find(g => g.id === 'p-duracao-volta');
      if (ida?.result && volta?.result && volta.result.departure <= ida.result.arrival) {
        return fail(volta, 'A volta deve sair depois da chegada da ida, considerando os fusos. Confira as datas locais.');
      }
    }
    return true;
  }
  function fail(g, message) {
    showToast(message); g.status.textContent = message;
    g.output.closest('details')?.setAttribute('open', '');
    g.output.scrollIntoView({ block: 'center', behavior: 'smooth' });
    g.output.focus(); return false;
  }
  window.TimingUI = { refresh, snapshot, restore, reset, validate };
  document.addEventListener('DOMContentLoaded', () => {
    initProposal(); initVoucher(); setAuto('p-data-ida', localToday()); autoDates(); refresh(); window.TimingUI.ready = true;
    document.addEventListener('input', event => { trackDate(event); autoDates(); refresh(); });
    document.addEventListener('change', event => { trackDate(event); autoDates(); refresh(); });
  });
})();
