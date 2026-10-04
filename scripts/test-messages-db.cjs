// A fresh PostgreSQL cluster per run. Never uses SUPABASE_URL, DATABASE_URL or
// an operational database; no system service is created. PostgreSQL 17 required.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { execFileSync, spawn } = require('node:child_process');
const repo = path.resolve(__dirname, '..');

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
    const dir = fs.mkdtempSync(path.join(repo, '../messages-db-'));
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
        const sqlTest = path.join(repo, 'supabase/tests/central-mensagens.sql');
        if (fs.existsSync(sqlTest)) process.stdout.write(run('psql', [...sqlArgs, '-f', sqlTest]));
        const tests = fs.readdirSync(path.join(repo, 'tests/db')).filter(name => name.endsWith('.test.cjs')).map(name => path.join('tests/db', name));
        const url = `postgresql://${encodeURIComponent(username)}@127.0.0.1:${port}/vck_central_test`;
        const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...tests], {
            cwd: repo, stdio: 'inherit', env: { ...process.env, VCK_TEST_DATABASE_URL: url }
        });
        const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
        if (code !== 0) throw new Error(`Testes PostgreSQL falharam (${code}).`);
    } finally {
        if (started) run('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', 'stop']);
        // Only the randomly-created directory from this run is removed.
        fs.rmSync(dir, { recursive: true, force: true });
    }
})().catch(error => { console.error(error.message); if (error.stderr) console.error(String(error.stderr)); process.exitCode = 1; });
