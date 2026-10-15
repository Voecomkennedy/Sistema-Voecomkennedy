const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('../cotador/node_modules/jsdom');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/client-picker.js'), 'utf8');
function fixture(items) {
    const dom = new JSDOM('<label for="client">Cliente</label><select id="client"><option value="">Selecione</option></select>', { runScripts: 'outside-only' });
    const w = dom.window;
    w.HTMLElement.prototype.scrollIntoView = () => {};
    w.eval(source);
    const select = w.document.querySelector('select');
    const picker = w.ClientPicker.attach(select);
    picker.refresh(items);
    const input = w.document.querySelector('input');
    const search = text => { input.value = text; input.dispatchEvent(new w.Event('input', { bubbles: true })); };
    const key = value => input.dispatchEvent(new w.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
    return { w, dom, select, picker, input, search, key, options: () => [...w.document.querySelectorAll('[role="option"]')] };
}
test('keyboard search ignores accents and commits the original numeric ID', () => {
    const f = fixture([{ id: 41, nome: 'Contato Demonstração' }]);
    try {
        f.search('demonstracao');
        assert.equal(f.options().length, 1);
        f.key('ArrowDown');
        assert.equal(f.input.getAttribute('aria-activedescendant'), f.options()[0].id);
        f.key('Enter');
        assert.equal(f.select.value, '41');
        assert.equal(f.input.value, 'Contato Demonstração');
        assert.equal(f.input.getAttribute('aria-expanded'), 'false');
        assert.equal(f.w.document.querySelector('label').htmlFor, f.input.id);
    } finally { f.dom.window.close(); }
});
test('homonyms remain separate and phone digits and email locate the correct ID', () => {
    const f = fixture([{ id: 'a', nome: 'Cliente Exemplo', telefone: '(61) 99999-1001' }, { id: 'b', nome: 'Cliente Exemplo', email: 'teste@example.invalid' }]);
    try {
        f.search('cliente');
        assert.equal(f.options().length, 2);
        assert.match(f.options()[0].textContent, /ID: a/);
        assert.match(f.options()[1].textContent, /ID: b/);
        f.key('ArrowUp'); f.key('Enter');
        assert.equal(f.select.value, 'b');
        f.search('999991001'); f.key('ArrowDown'); f.key('Enter');
        assert.equal(f.select.value, 'a');
        f.search('teste@'); f.key('ArrowDown'); f.key('Enter');
        assert.equal(f.select.value, 'b');
    } finally { f.dom.window.close(); }
});
test('editing the display text clears the saved link and Escape and Tab preserve free text', () => {
    const f = fixture([{ id: 'a', nome: 'Cliente Exemplo' }]);
    try {
        let changes = 0; f.select.addEventListener('change', () => changes++);
        f.picker.select('a'); f.search('Outro contato');
        assert.equal(f.select.value, '');
        assert.equal(changes, 2);
        f.key('Escape');
        assert.equal(f.input.getAttribute('aria-expanded'), 'false');
        assert.equal(f.input.value, 'Outro contato');
        f.search('cliente'); f.input.dispatchEvent(new f.w.Event('blur'));
        assert.equal(f.input.getAttribute('aria-expanded'), 'false');
        assert.equal(f.select.value, '');
    } finally { f.dom.window.close(); }
});
test('large lists render 20 results and a refined search reaches every client', () => {
    const f = fixture(Array.from({ length: 1200 }, (_, i) => ({ id: 'id-' + i, nome: 'Contato ' + String(i).padStart(4, '0') })));
    try {
        f.search('');
        assert.equal(f.options().length, 20);
        assert.match(f.w.document.querySelector('[role="status"]').textContent, /20 de 1200/);
        assert.equal(f.select.options.length, 1);
        f.search('1199'); f.key('ArrowDown'); f.key('Enter');
        assert.equal(f.select.value, 'id-1199');
        assert.equal(f.select.options.length, 2);
    } finally { f.dom.window.close(); }
});
const homonyms = () => Array.from({ length: 21 }, (_, i) => ({
    id: 'homonimo-' + String(i + 1).padStart(2, '0'), nome: 'Cliente Exemplo',
    cpf: String(i + 1).padStart(11, '0'), telefone: '(61) 99999-1001'
}));
test('21 homonyms sharing a phone and no email remain reachable by keyboard and displayed ID', () => {
    const clients = homonyms();
    const original = JSON.stringify(clients);
    const f = fixture(clients);
    try {
        f.search('Cliente Exemplo');
        assert.equal(f.options().length, 20);
        for (let i = 0; i < 21; i++) f.key('ArrowDown');
        assert.equal(f.options().length, 1);
        const active = f.w.document.getElementById(f.input.getAttribute('aria-activedescendant'));
        assert.match(active.textContent, /ID: homonimo-21/);
        assert.equal(active.getAttribute('aria-posinset'), '21');
        assert.equal(active.getAttribute('aria-setsize'), '21');
        assert.equal(active.getAttribute('aria-selected'), 'true');
        assert.match(f.w.document.querySelector('[role="status"]').textContent, /21 a 21 de 21/);
        f.key('ArrowUp');
        assert.equal(f.options().length, 20);
        assert.equal(f.w.document.getElementById(f.input.getAttribute('aria-activedescendant')).getAttribute('aria-posinset'), '20');
        f.key('ArrowDown'); f.key('Enter');
        assert.equal(f.select.value, 'homonimo-21');
        f.search('homonimo-21');
        assert.equal(f.options().length, 1);
        f.key('ArrowDown'); f.key('Enter');
        assert.equal(f.select.value, 'homonimo-21');
        assert.equal(JSON.stringify(clients), original);
    } finally { f.dom.window.close(); }
});
test('page controls stay reachable on focus and move to the remaining homonym', () => {
    const f = fixture(homonyms());
    try {
        f.input.focus(); f.search('Cliente Exemplo');
        const next = [...f.w.document.querySelectorAll('button')].find(el => el.textContent === 'Próximos');
        next.focus();
        assert.equal(f.input.getAttribute('aria-expanded'), 'true');
        next.click();
        assert.equal(f.w.document.activeElement, f.input);
        assert.equal(f.options().length, 1);
        f.key('Enter');
        assert.equal(f.select.value, 'homonimo-21');
        f.search('Cliente Exemplo'); f.key('ArrowUp'); f.key('Enter');
        assert.equal(f.select.value, 'homonimo-21');
    } finally { f.dom.window.close(); }
});
test('refresh preserves selected ID and safely clears a removed contact', () => {
    const f = fixture([{ id: 'a', nome: 'Cliente Exemplo' }]);
    try {
        f.picker.select('a');
        f.picker.refresh([{ id: 'a', nome: 'Nome atualizado' }]);
        assert.equal(f.select.value, 'a');
        assert.equal(f.input.value, 'Nome atualizado');
        f.picker.refresh([]);
        assert.equal(f.select.value, '');
        assert.equal(f.input.value, '');
        f.search('');
        assert.match(f.w.document.querySelector('[role="status"]').textContent, /Nenhum cliente cadastrado/);
    } finally { f.dom.window.close(); }
});
test('client names and contact details render as inert text and pointer selection keeps ID', () => {
    const f = fixture([{ id: 'a', nome: '<img src=x onerror=alert(1)>', email: '<script>unsafe</script>' }]);
    try {
        f.search('img');
        assert.equal(f.w.document.querySelector('img,script'), null);
        f.options()[0].click();
        assert.equal(f.select.value, 'a');
        f.w.document.querySelector('.client-picker-clear').click();
        assert.equal(f.select.value, '');
    } finally { f.dom.window.close(); }
});
