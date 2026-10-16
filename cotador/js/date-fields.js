/* Strict civil dates, shared by the panel and proposal editor. Never repairs input. */
(function (root) {
  'use strict';
  function parse(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const [year, month, day] = value.split('-').map(Number);
    const d = new Date(0); d.setUTCFullYear(year, month - 1, day); d.setUTCHours(0, 0, 0, 0);
    return year >= 1900 && year <= 9999 && d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
      ? { year, month, day } : null;
  }
  function today(now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(now).map(p => [p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  const display = value => String(value).split('-').reverse().join('/');
  function yearHint(value) {
    const match = /^(\d{1,4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match || Number(match[1]) >= 1900) return '';
    const suggested = `${2000 + Number(match[1]) % 100}-${match[2]}-${match[3]}`;
    return parse(suggested) ? ` Se quis dizer ${display(suggested)}, digite o ano completo e confira.` : '';
  }
  function setError(el, message) {
    if (!el) return false;
    el.setCustomValidity(message);
    el.setAttribute('aria-invalid', String(!!message));
    const id = `${el.id}-date-error`;
    let note = el.ownerDocument.getElementById(id);
    if (!note && message) {
      note = el.ownerDocument.createElement('small'); note.id = id;
      note.className = 'date-field-error'; note.style.cssText = 'display:block;color:#b42318;margin-top:5px';
      note.setAttribute('aria-live','polite'); el.after(note);
      el.setAttribute('aria-describedby', [el.getAttribute('aria-describedby'),id].filter(Boolean).join(' '));
    }
    if (note) { note.textContent = message; note.hidden = !message; }
    return !message;
  }
  function validate(el, {required = el.required, min = '', max = '', label = 'A data'} = {}) {
    let error = '';
    if (el.validity.badInput) error = 'Complete uma data válida com ano de quatro dígitos.';
    else if (!el.value && required) error = 'Informe a data completa, com ano de quatro dígitos.';
    else if (el.value && !parse(el.value)) error = 'Use uma data válida e ano de quatro dígitos, entre 1900 e 9999.' + yearHint(el.value);
    else if (el.value && min && el.value < min) error = `${label} deve ser a partir de ${display(min)}.`;
    else if (el.value && max && el.value > max) error = `${label} deve ser até ${display(max)}.`;
    return setError(el, error);
  }
  function order(el, before, message) {
    if (!el || el.validationMessage || !parse(el.value) || !parse(before)) return !el?.validationMessage;
    if (el.value >= before) return true;
    const next = `${Number(before.slice(0,4)) + 1}${el.value.slice(4)}`;
    const hint = el.value.slice(0,4) === before.slice(0,4) && parse(next)
      ? ` Se a viagem cruza o ano, confira se a data correta é ${display(next)}.` : '';
    return setError(el, message + hint);
  }
  function focus(el) {
    el.closest('details')?.setAttribute('open','');
    const view = el.ownerDocument.defaultView;
    try { view.frameElement?.closest('details')?.setAttribute('open',''); } catch (_) { /* Cross-origin host. */ }
    const reveal = () => el.scrollIntoView?.({block:'center', behavior:'instant'});
    el.focus({preventScroll:true}); el.reportValidity(); reveal();
    view.requestAnimationFrame?.(reveal);
    return false;
  }
  const api = {parse, today, display, validate, setError, order, focus};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DateFields = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
