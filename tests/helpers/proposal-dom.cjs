const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, ResourceLoader, VirtualConsole } = require('../../cotador/node_modules/jsdom');

const root = path.resolve(__dirname, '../..');
const person = { id: 'client-1', tipo: 'cliente', nome: 'Cliente sintético' };

class LocalResources extends ResourceLoader {
    constructor(authenticated = true) { super(); this.authenticated = authenticated; }
    fetch(url) {
        const parsed = new URL(url);
        if (parsed.hostname === 'qa.local') {
            const stubs = {
                '/js/auth.js': `window.Auth={proteger:async()=>${this.authenticated},logout(){}};`,
                '/js/cloud-sync.js': 'window.CloudSync={init:async()=>true,agendarBackup(){window.__syncs=(window.__syncs||0)+1}};',
                '/js/supabase-config.js': `window.getSupabaseClient=()=>({auth:{getUser:async()=>({data:{user:{id:'test-user',user_metadata:{}}}}),onAuthStateChange(){}}});`
            };
            if (stubs[parsed.pathname]) return Promise.resolve(Buffer.from(stubs[parsed.pathname]));
            const file = path.join(root, decodeURIComponent(parsed.pathname));
            return Promise.resolve(fs.existsSync(file) && fs.statSync(file).isFile() ? fs.readFileSync(file) : Buffer.alloc(0));
        }
        if (parsed.pathname.includes('bootstrap.bundle')) {
            return Promise.resolve(Buffer.from('window.bootstrap={Modal:class{show(){}hide(){}}};'));
        }
        return Promise.resolve(Buffer.alloc(0));
    }
}

async function page(name, entries = {}, authenticated = true) {
    const errors = [];
    const console = new VirtualConsole();
    console.on('jsdomError', e => errors.push(e.message));
    const dom = new JSDOM(fs.readFileSync(path.join(root, name + '.html'), 'utf8'), {
        url: `https://qa.local/${name}.html${name === 'vendas' ? '?from_cotacao=true' : ''}`,
        runScripts: 'dangerously', resources: new LocalResources(authenticated), virtualConsole: console,
        beforeParse(w) {
            w.fetch = () => { throw new Error('NETWORK FORBIDDEN'); };
            w.HTMLElement.prototype.scrollIntoView = () => {};
            w.confirm = () => true;
            w.alert = () => {};
            for (const [key, value] of Object.entries(entries)) w.localStorage.setItem(key, JSON.stringify(value));
        }
    });
    const waitFor = async condition => {
        const until = Date.now() + 10000;
        while (!condition()) {
            if (Date.now() > until) throw new Error('DOM fixture timed out: ' + JSON.stringify({errors, ready: dom.window.document.readyState, auth: !!dom.window.Auth, app: !!dom.window.AppBootstrap}));
            await new Promise(resolve => setTimeout(resolve, 25));
        }
    };
    if (authenticated) await waitFor(() => dom.window.document.documentElement.dataset.appAutenticado === 'true');
    else await waitFor(() => !!dom.window.AppBootstrap);
    if (name === 'cotacoes' && authenticated) await waitFor(() => typeof dom.window.document.querySelector('#quadroProposta').contentWindow?.coletarDadosProposta === 'function');
    return { dom, window: dom.window, waitFor, errors };
}


module.exports = {page,person};
