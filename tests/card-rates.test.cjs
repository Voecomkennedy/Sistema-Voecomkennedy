const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/card-rates.js');

test('all twelve provided rates protect the net base down to cents, including 0%', () => {
    assert.deepEqual(Object.values(R.DEFAULTS), [5.49,10.89,11.99,12.59,13.29,13.99,14.99,15.59,16.19,16.89,17.89,18.29]);
    for (const base of [0.01, 999.99, 1500, 54321.12]) for (let n = 1; n <= 12; n++) {
        const q = R.calculate(base, n, R.DEFAULTS);
        assert.ok(q.total * q.divisor >= base - 1e-9);
        assert.ok((q.total - 0.01) * q.divisor < base + 1e-9);
        assert.equal(q.parcela, q.total / n);
    }
    assert.equal(R.calculate(1000, 1, {...R.DEFAULTS, 1: 0}).total, 1000);
    assert.equal(R.calculate(1000, 1, R.DEFAULTS).total, 1058.09);
});
test('invalid and partial tables cannot silently become default rates', () => {
    assert.equal(R.validate({...R.DEFAULTS, 1: '5,49'})[1], 5.49);
    for (const value of ['', null, '-1', '100', '1.001', '1e1', '5%']) assert.throws(() => R.validate({...R.DEFAULTS, 1: value}));
    assert.throws(() => R.validate({1: 5.49}));
    assert.throws(() => R.calculate(10, 13, R.DEFAULTS));
    assert.throws(() => R.calculate(NaN, 1, R.DEFAULTS));
});
function account() {
    let remote = {id:'a',user_metadata:{unrelated:'preserved'}}; const listeners = []; const writes = [];
    const client = {auth:{
        async getUser() { return {data:{user:structuredClone(remote)}}; },
        async updateUser(payload) { writes.push(payload); remote.user_metadata = {...remote.user_metadata,...payload.data}; return {data:{user:structuredClone(remote)}}; },
        onAuthStateChange(fn) { listeners.push(fn); }
    }};
    return {client,writes,remote:()=>remote,switch:()=>{remote={id:'b',user_metadata:{}};listeners.forEach(fn=>fn('SIGNED_IN',{user:remote}));},logout:()=>listeners.forEach(fn=>fn('SIGNED_OUT',null))};
}
test('two independent devices read saved cloud rates, preserving unrelated metadata and excluding credentials', async () => {
    const a = account(), first=R.createStore(a.client), second=R.createStore(a.client);
    await first.load(); await second.load();
    const oldRevision = second.revision;
    await first.save({...R.DEFAULTS, 12: 19.25}, first.revision);
    assert.equal(a.remote().user_metadata.unrelated, 'preserved');
    assert.deepEqual(Object.keys(a.writes[0]), ['data']);
    assert.deepEqual(Object.keys(a.writes[0].data), [R.KEY]);
    await assert.rejects(second.save(R.DEFAULTS, oldRevision), /outro dispositivo/);
    assert.equal(a.writes.length, 1);
    await second.load(); assert.equal(second.rates()[12], 19.25);
});
test('logout/account change invalidates rates and stale load responses', async () => {
    const a = account(), s=R.createStore(a.client); await s.load();
    a.switch(); assert.equal(s.ready, false); assert.throws(()=>s.rates());
    await s.load(); assert.equal(s.owner,'b'); assert.equal(s.rates()[12],18.29);
    let release; a.client.auth.getUser=()=>new Promise(resolve=>{release=resolve;});
    const load=s.load(); a.logout(); release({data:{user:{id:'a',user_metadata:{}}}});
    await assert.rejects(load,/sessão mudou/); assert.equal(s.ready,false);
});
test('offline or invalid cloud data never yields a success or default fallback', async () => {
    const a=account(),s=R.createStore(a.client); await s.load();
    a.client.auth.updateUser=async()=>({error:{message:'offline'}});
    await assert.rejects(s.save(R.DEFAULTS,s.revision),/salvar na nuvem/);
    a.client.auth.getUser=async()=>({error:{message:'offline'}});
    await assert.rejects(s.load()); assert.equal(s.ready,false);
    a.client.auth.getUser=async()=>({data:{user:{id:'a',user_metadata:{[R.KEY]:{schema:1,revision:'x',rates:{1:5}}}}}});
    await assert.rejects(s.load(),/12 taxas/); assert.equal(s.ready,false);
});

test('cloud JSONB property order does not produce a false save failure', async () => {
    const a=account(), s=R.createStore(a.client);
    const original=a.client.auth.updateUser;
    a.client.auth.updateUser=async payload=>{
        const result=await original(payload);
        const v=result.data.user.user_metadata[R.KEY];
        result.data.user.user_metadata[R.KEY]={updatedAt:v.updatedAt, revision:v.revision, rates:v.rates, schema:v.schema};
        return result;
    };
    await s.load(); await s.save(R.DEFAULTS,s.revision);
    assert.equal(s.rates()[12],18.29);
});
