// Opt-in integration against the disposable, loopback Supabase checkout only.
// Never pass production keys or URLs to this script.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {randomUUID,createHash}=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const {Client:PgClient}=require('pg');

const local='/Volumes/HD externo/Codex-eval-preparation/atendimento-supabase-local';
if(process.env.VCK_LOCAL_TEST!=='1'||fs.readFileSync(path.join(local,'.vck-synthetic-only'),'utf8').trim()!=='synthetic only')
  throw Error('Teste requer marcador e VCK_LOCAL_TEST=1.');
const raw=execFileSync('supabase',['status','--workdir',local,'--output','env'],{encoding:'utf8'});
const values=Object.fromEntries(raw.split('\n').map(line=>line.match(/^([A-Z_]+)="?([^"\n]+)"?$/)).filter(Boolean).map(m=>[m[1],m[2]]));
assert.equal(values.API_URL,'http://127.0.0.1:54321');
assert.equal(values.DB_URL,'postgresql://postgres:postgres@127.0.0.1:54322/postgres');
assert.ok(values.ANON_KEY&&values.SERVICE_ROLE_KEY);
const root=createClient(values.API_URL,values.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const app=key=>createClient(values.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
const check=(result,what)=>{if(result.error)throw Error(`${what}: ${result.error.message}`);return result.data;};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

(async()=>{
  const users=[],objects=[];
  try{
    for(let n=0;n<2;n++){
      const email=`atendimento-local-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID();
      const person=check(await root.auth.admin.createUser({email,password,email_confirm:true}),'criar usuário sintético').user;
      users.push(person.id);
      const session=app(values.ANON_KEY);
      check(await session.auth.signInWithPassword({email,password}),'login local');
      users[n]=[person.id,session];
    }
    const [[a,alice],[b,bob]]=users;
    const event=(owner,id,phone,text)=>({p_owner:owner,p_instancia:'SYNTH_LOCAL',p_id:id,p_phone:phone,p_lid:null,p_nome:'Ana Exemplo',p_tipo:'texto',p_texto:text,p_nome_arquivo:null,p_ocorrido:'2026-10-13T09:00:00Z',p_arquivo:null});
    const one=event(a,'synthetic-1','5562999990001','<script>isolado</script>');
    assert.equal(check(await root.rpc('atendimento_receber_privado',one),'RPC')?.duplicate,false);
    assert.equal(check(await root.rpc('atendimento_receber_privado',one),'duplicata')?.duplicate,true);
    check(await root.rpc('atendimento_receber_privado',event(b,'synthetic-2','5561999990002','Somente B')),'RPC B');
    const table='atendimento_recepcao_mensagens';
    assert.equal(check(await alice.from(table).select('texto'),'leitura A').length,1);
    assert.equal(check(await bob.from(table).select('texto'),'leitura B').length,1);
    assert.ok((await app(values.ANON_KEY).from(table).select('id')).error,'anônimo não lê');
    assert.ok((await alice.from(table).insert({user_id:b,instancia:'SYNTH_LOCAL'})).error,'browser não escreve');

    const {JSDOM}=require('../cotador/node_modules/jsdom');
    const html=fs.readFileSync(path.join(__dirname,'../atendimento-recebidos.html'),'utf8');
    const dom=new JSDOM(html,{url:'http://127.0.0.1:54321/atendimento-recebidos.html'});
    try{
      global.document=dom.window.document;
      const {startReceivedPage}=await import('../js/atendimento-recebidos.mjs');
      await startReceivedPage(alice,{getUser:async()=>({id:a})});
      const screen=dom.window.document;
      assert.equal(screen.getElementById('rec-workspace').hidden,false);
      assert.match(screen.getElementById('rec-messages').textContent,/isolado/);
      assert.doesNotMatch(screen.getElementById('rec-messages').textContent,/Somente B/);
      assert.equal(screen.querySelector('#rec-messages script'),null);
    }finally{delete global.document;dom.window.close();}

    const bucket='atendimento-arquivos';
    const synthetic=Buffer.from('%PDF-synthetic-local');
    const syntheticPath=`${a}/recebidos/${randomUUID()}.pdf`;
    check(await root.storage.from(bucket).upload(syntheticPath,synthetic,{contentType:'application/pdf'}),'upload sintético');objects.push(syntheticPath);
    const mine=check(await alice.storage.from(bucket).download(syntheticPath),'download proprietário');
    assert.equal(sha(Buffer.from(await mine.arrayBuffer())),sha(synthetic));
    assert.ok((await bob.storage.from(bucket).download(syntheticPath)).error,'outro usuário não baixa');

    if(process.env.VCK_LOCAL_STORAGE_BACKUP){
      const backup=process.env.VCK_LOCAL_STORAGE_BACKUP;
      const manifest=JSON.parse(fs.readFileSync(path.join(backup,'storage-manifest.json'),'utf8'));
      assert.equal(manifest.object_count,3);
      for(const file of manifest.files){
        const relative=file.path||file.name||file.key;
        assert.ok(typeof relative==='string'&&/^[0-9a-f-]+\/[0-9a-f-]+\/[0-9a-f-]+\.pdf$/.test(relative));
        const objectPath=relative;
        const bytes=fs.readFileSync(path.join(backup,'storage',bucket,relative));
        assert.equal(sha(bytes),file.sha256);
        check(await root.storage.from(bucket).upload(objectPath,bytes,{contentType:'application/pdf'}),'restaurar bytes');objects.push(objectPath);
        const restored=check(await root.storage.from(bucket).download(objectPath),'ler restauração');
        assert.equal(sha(Buffer.from(await restored.arrayBuffer())),file.sha256);
      }
      process.stdout.write('3 objetos: restauração isolada e SHA-256 conferidos\n');
    }
    process.stdout.write('Auth, RLS, UI e Storage locais: OK\n');
  }finally{
    for(const object of objects)await root.storage.from('atendimento-arquivos').remove([object]);
    const pg=new PgClient({connectionString:values.DB_URL});await pg.connect();
    try{
      for(const row of users){const id=Array.isArray(row)?row[0]:row;
        await pg.query('delete from public.atendimento_recepcao_eventos where user_id=$1',[id]);
        await pg.query('delete from public.atendimento_recepcao_arquivos where user_id=$1',[id]);
        await pg.query('delete from public.atendimento_recepcao_mensagens where user_id=$1',[id]);
        await pg.query('delete from public.atendimento_recepcao_identidades where user_id=$1',[id]);
        await pg.query('delete from public.atendimento_recepcao_conversas where user_id=$1',[id]);
        await root.auth.admin.deleteUser(id);
      }
    }finally{await pg.end();}
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
