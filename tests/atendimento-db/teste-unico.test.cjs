const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {pool,session}=require('../db/helpers.cjs');
test.after(()=>pool.end());

test('reserva única real só pode ser gravada pelo servidor',async()=>{
  const owner=randomUUID();await pool.query('insert into auth.users(id) values($1)',[owner]);
  const table='public.atendimento_teste_envio_unico';
  assert.equal((await pool.query('select relrowsecurity from pg_class where oid=$1::regclass',[table])).rows[0].relrowsecurity,true);
  for(const role of ['anon','authenticated']){
    await assert.rejects(session(role,owner,c=>c.query(`select * from ${table}`)),{code:'42501'});
    await assert.rejects(session(role,owner,c=>c.query(`insert into ${table}(chave,user_id,instancia,estado) values('piloto_texto_1',$1,'mock','reservado')`,[owner])),{code:'42501'});
  }
  const insert=()=>session('service_role',null,c=>c.query(`insert into ${table}(chave,user_id,instancia,estado) values('piloto_texto_1',$1,'mock','reservado')`,[owner]));
  const results=await Promise.allSettled([insert(),insert()]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'23505');
  assert.equal((await session('service_role',null,c=>c.query(`select estado from ${table}`))).rows[0].estado,'reservado');
});
