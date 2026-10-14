// Dedicated temporary PostgreSQL cluster only. Never accepts a DB URL.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net');
const {execFileSync}=require('node:child_process'),{Client}=require('pg');
const repo=path.resolve(__dirname,'../..'),bin='/opt/homebrew/opt/postgresql@17/bin';
exports.withDatabase=async callback=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vck-compact-pg-')),cluster=path.join(dir,'data'),user=os.userInfo().username;
 const run=(name,args)=>execFileSync(path.join(bin,name),args,{encoding:'utf8',stdio:'pipe',timeout:30000});
 let started=false;const clients=[];
 try{
  const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
  run('initdb',['-D',cluster,'--auth=trust','--no-locale','-E','UTF8','-U',user]);
  run('pg_ctl',['-D',cluster,'-l',path.join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k '' -c shared_buffers=32MB`,'-w','start']);started=true;
  run('createdb',['-h','127.0.0.1','-p',String(port),'-U',user,'vck_central_test']);
  const args=['-X','-h','127.0.0.1','-p',String(port),'-U',user,'-d','vck_central_test','-v','ON_ERROR_STOP=1'];
  const apply=file=>run('psql',[...args,'-f',path.join(repo,file)]);
  apply('tests/db/bootstrap.sql');apply('supabase/migrations/20261014170118_integridade_historico.sql');
  const config={host:'127.0.0.1',port,user,database:'vck_central_test'};
  async function connect(role,owner){const c=new Client(config);await c.connect();clients.push(c);if(role)await c.query('set role '+role);if(owner)await c.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);return c;}
  const admin=await connect();
  return await callback({admin,connect,applyCompact:()=>apply('supabase/migrations/20261014201423_integridade_historico_compacto.sql')});
 }finally{
  await Promise.allSettled(clients.map(c=>c.end()));
  if(started)run('pg_ctl',['-D',cluster,'-m','immediate','-w','stop']);
  fs.rmSync(dir,{recursive:true,force:true});
 }
};
