// A fresh PostgreSQL cluster per run. Never uses SUPABASE_URL, DATABASE_URL or
// an operational database; no system service is created. PostgreSQL 17 required.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { execFileSync, spawn } = require('node:child_process');
const repo = path.resolve(__dirname, '..');
let stopRequested = false, stopServe = null;
const requestStop = () => { stopRequested = true; if (stopServe) stopServe(); };
process.on('SIGINT', requestStop); process.on('SIGTERM', requestStop);

function executable(name) {
    const dirs = [process.env.VCK_PG_BIN, '/opt/homebrew/opt/postgresql@17/bin', '/usr/lib/postgresql/17/bin', '/usr/local/opt/postgresql@17/bin', ...(process.env.PATH || '').split(path.delimiter)].filter(Boolean);
    const found = dirs.map(dir => path.join(dir, name)).find(file => fs.existsSync(file));
    if (!found) throw new Error('PostgreSQL 17 não encontrado. Defina VCK_PG_BIN com a pasta de initdb, pg_ctl e psql.');
    return found;
}
async function freePort() {
    const server = net.createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    return port;
}
(async () => {
    const dir = fs.mkdtempSync(path.join(repo, '../atendimento-db-'));
    const cluster = path.join(dir, 'data');
    const username = os.userInfo().username;
    let started = false;
    const run = (name, args) => execFileSync(executable(name), args, { cwd: repo, encoding: 'utf8', stdio: 'pipe' });
    try {
        const port = await freePort();
        run('initdb', ['-D', cluster, '--auth=trust', '--no-locale', '-E', 'UTF8', '-U', username]);
        run('pg_ctl', ['-D', cluster, '-l', path.join(dir, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ''`, '-w', 'start']);
        started = true;
        run('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', username, 'vck_central_test']);
        const sqlArgs = ['-X', '-h', '127.0.0.1', '-p', String(port), '-U', username, '-d', 'vck_central_test', '-v', 'ON_ERROR_STOP=1'];
        run('psql', [...sqlArgs, '-f', 'tests/db/bootstrap.sql']);
        const migration = fs.readdirSync(path.join(repo, 'supabase/migrations')).filter(name => name.endsWith('_central_mensagens.sql'));
        if (migration.length !== 1) throw new Error('Migration da Central ambígua.');
        run('psql', [...sqlArgs, '-f', `supabase/migrations/${migration[0]}`]);
        run('psql', [...sqlArgs, '-f', 'tests/atendimento-db/storage-bootstrap.sql']);
        const atendimento = fs.readdirSync(path.join(repo, 'supabase/migrations')).filter(name => name.endsWith('_atendimento_mvp.sql'));
        if (atendimento.length !== 1) throw new Error('Migration de Atendimento ambígua.');
        run('psql', [...sqlArgs, '-f', `supabase/migrations/${atendimento[0]}`]);
        const durable = fs.readdirSync(path.join(repo, 'supabase/migrations')).filter(name => name.endsWith('_atendimento_duravel.sql'));
        if (durable.length !== 1) throw new Error('Migration durável ambígua.');
        run('psql', [...sqlArgs, '-f', `supabase/migrations/${durable[0]}`]);
        run('psql', [...sqlArgs, '-f', 'supabase/migrations/20261013164308_atendimento_encaminhamento_retry.sql']);
        run('psql', [...sqlArgs, '-f', 'supabase/migrations/20261013190000_atendimento_recepcao_privada.sql']);
        run('createdb', ['-h', '127.0.0.1', '-p', String(port), '-U', username, 'vck_atendimento_restore_test']);
        const restoreArgs = sqlArgs.map(value => value === 'vck_central_test' ? 'vck_atendimento_restore_test' : value);
        const restoreBootstrap = path.join(dir, 'restore-bootstrap.sql');
        fs.writeFileSync(restoreBootstrap, fs.readFileSync(path.join(repo, 'tests/db/bootstrap.sql'), 'utf8').replaceAll('vck_central_test', 'vck_atendimento_restore_test'));
        run('psql', [...restoreArgs, '-f', restoreBootstrap]);
        run('psql', [...restoreArgs, '-f', 'tests/atendimento-db/storage-bootstrap.sql']);
        run('psql', [...restoreArgs, '-f', `supabase/migrations/${atendimento[0]}`]);
        run('psql', [...restoreArgs, '-f', `supabase/migrations/${durable[0]}`]);
        run('psql', [...restoreArgs, '-f', 'supabase/migrations/20261013164308_atendimento_encaminhamento_retry.sql']);
        run('psql', [...restoreArgs, '-f', 'supabase/migrations/20261013190000_atendimento_recepcao_privada.sql']);
        const sqlTest = path.join(repo, 'supabase/tests/central-mensagens.sql');
        if (fs.existsSync(sqlTest)) process.stdout.write(run('psql', [...sqlArgs, '-f', sqlTest]));
        const tests = fs.readdirSync(path.join(repo, 'tests/atendimento-db')).filter(name => name.endsWith('.test.cjs')).map(name => path.join('tests/atendimento-db', name));
        const url = `postgresql://${encodeURIComponent(username)}@127.0.0.1:${port}/vck_central_test`;
        const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...tests], {
            cwd: repo, stdio: 'inherit', env: { ...process.env, VCK_TEST_DATABASE_URL: url, VCK_TEST_RESTORE_URL: url.replace('/vck_central_test', '/vck_atendimento_restore_test'), VCK_TEST_OBJECTS_DIR: path.join(dir,'objects') }
        });
        const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
        if (code !== 0) throw new Error(`Testes PostgreSQL falharam (${code}).`);
        const proof = path.join(dir, 'restart-proof.json');
        const worker = path.join('tests', 'atendimento-db', 'restart-worker.cjs');
        const workerEnv = { ...process.env, VCK_TEST_DATABASE_URL: url, VCK_TEST_RESTORE_URL: url.replace('/vck_central_test', '/vck_atendimento_restore_test'), VCK_TEST_OBJECTS_DIR: path.join(dir,'objects'), VCK_TEST_PROOF_FILE: proof };
        const phase = name => execFileSync(process.execPath, [worker, name], { cwd: repo, env: workerEnv, encoding: 'utf8', stdio: 'pipe' });
        process.stdout.write(phase('seed'));
        try { phase('crash'); throw new Error('O worker deveria ter terminado no limite sintético de envio.'); }
        catch (error) { if (error.status !== 41) throw error; process.stdout.write(String(error.stdout)); }
        run('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', 'stop']); started = false;
        run('pg_ctl', ['-D', cluster, '-l', path.join(dir, 'postgres-restart.log'), '-o', `-h 127.0.0.1 -p ${port} -k ''`, '-w', 'start']); started = true;
        process.stdout.write('restart: PostgreSQL local descartável encerrado e iniciado de novo\n');
        process.stdout.write(phase('verify'));
        if (process.argv.includes('--serve')) {
            const { Pool } = require('pg');
            const { randomUUID, randomBytes } = require('node:crypto');
            const [{createPgRepository},{createLocalObjectStore},{DEMO_SOURCE},{createLocalAtendimentoHttpServer}] = await Promise.all([
                import('../supabase/functions/_shared/atendimento/repository.mjs'),
                import('../supabase/functions/_shared/atendimento/local-object-store.mjs'),
                import('../js/atendimento-demo.mjs'),
                import('./atendimento-local-http.mjs')
            ]);
            const pool = new Pool({ connectionString:url });
            let server;
            try {
                const owner = randomUUID();
                await pool.query('insert into auth.users(id) values($1)',[owner]);
                await pool.query('insert into public.dados_app(user_id,conteudo) values($1,$2)',[owner,DEMO_SOURCE]);
                const atendimentoRepo = createPgRepository({pool,owner,objectStore:createLocalObjectStore(path.join(dir,'objects',owner)),financialSummary:sale=>({receitaRealizada:(sale.valorRecebido||0)-(sale.valorReembolsadoCliente||0)})});
                for(const [messageId,phone,message,at] of [
                    ['in-ana-1','+5562999990001','Olá! Quero conferir minha proposta para São Paulo.','2026-10-13T09:00:00Z'],
                    ['in-bruno-1','+5561999990002','Você pode cotar Recife para novembro?','2026-10-13T08:30:00Z'],
                    ['in-ana-2','+5562999990001','Pode incluir a bagagem no PDF?','2026-10-13T09:05:00Z']
                ]) {await atendimentoRepo.enqueue(owner,{type:'message',instance:'mock',messageId,phone,fromMe:false,text:message,at,status:'entregue'});await atendimentoRepo.processNext(owner);}
                const chats=await atendimentoRepo.list(owner);
                await atendimentoRepo.link(owner,chats.find(c=>c.phone.endsWith('0001')).id,{clienteId:'p-ana',cotacaoId:'q-ana',vendaId:'v-ana',origemContato:'Indicação informada pelo contato (exemplo)',etiquetas:['Proposta','Bagagem']});
                await atendimentoRepo.link(owner,chats.find(c=>c.phone.endsWith('0002')).id,{clienteId:'p-bruno',cotacaoId:'q-bruno',etiquetas:['Novo contato']});
                const httpPort=await freePort(),accessCode=randomBytes(18).toString('base64url');
                server=createLocalAtendimentoHttpServer({root:repo,repository:atendimentoRepo,enabled:true,allowedOrigin:`http://127.0.0.1:${httpPort}`,accessCode});
                await new Promise((resolve,reject)=>server.once('error',reject).listen(httpPort,'127.0.0.1',resolve));
                process.stdout.write(`DEMO_LOCAL=http://127.0.0.1:${httpPort}/atendimento.html?demo=persistente\nDEMO_CODIGO=${accessCode}\n`);
                await new Promise(resolve=>{ stopServe = resolve; if (stopRequested) resolve(); });
            } finally { if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await pool.end(); }
        }
    } finally {
        if (started) run('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', 'stop']);
        // Only the randomly-created directory from this run is removed.
        fs.rmSync(dir, { recursive: true, force: true });
    }
})().catch(error => { console.error(error.message); if (error.stderr) console.error(String(error.stderr)); process.exitCode = 1; });
