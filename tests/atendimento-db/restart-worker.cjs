// Child process used only by the disposable database runner. Each phase opens a new pool.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {Pool}=require('pg');
const source=new URL(process.env.VCK_TEST_DATABASE_URL||'http://invalid');
const target=new URL(process.env.VCK_TEST_RESTORE_URL||'http://invalid');
const proof=process.env.VCK_TEST_PROOF_FILE;
if(source.protocol!=='postgresql:'||source.hostname!=='127.0.0.1'||source.pathname!=='/vck_central_test'||target.protocol!=='postgresql:'||target.hostname!=='127.0.0.1'||target.pathname!=='/vck_atendimento_restore_test'||!path.isAbsolute(proof||'')||!path.isAbsolute(process.env.VCK_TEST_OBJECTS_DIR||''))throw new Error('Prova aceita somente o cluster descartável do runner.');
const phase=process.argv[2];
(async()=>{
    const [{createPgRepository},{createLocalObjectStore},{createDurableBackup},{demoPdf}]=await Promise.all([
        import('../../supabase/functions/_shared/atendimento/repository.mjs'),
        import('../../supabase/functions/_shared/atendimento/local-object-store.mjs'),
        import('../../supabase/functions/_shared/atendimento/backup.mjs'),
        import('../../js/atendimento-demo.mjs')]);
    const db=new Pool({connectionString:source.href});
    try{
        if(phase==='seed'){
            const owner=randomUUID();
            await db.query('insert into auth.users(id) values($1)',[owner]);
            const store=createLocalObjectStore(path.join(process.env.VCK_TEST_OBJECTS_DIR,owner));
            const repo=createPgRepository({pool:db,owner,objectStore:store});
            const base={type:'message',instance:'mock',messageId:'restart-in',phone:'+5562999990001',lid:'1234567@lid',fromMe:false,text:'Mensagem sintética',at:'2026-10-13T09:00:00Z',status:'entregue'};
            await repo.enqueue(owner,base);await repo.processNext(owner);
            const chatId=(await repo.list(owner))[0].id;
            await repo.read(owner,chatId);
            const file=await repo.archive(owner,chatId,{name:'prova.pdf',bytes:demoPdf(),requestId:'restart-file'});
            await repo.compose(owner,chatId,{text:'Resposta sem confirmação',requestId:'restart-lost'});
            await repo.compose(owner,chatId,{text:'Resposta pendente',attachmentId:file.id,requestId:'restart-pending'});
            await repo.enqueue(owner,{...base,messageId:'restart-late',at:'2026-10-13T07:00:00Z'});
            const started=(await db.query('select pg_postmaster_start_time() started')).rows[0].started.toISOString();
            fs.writeFileSync(proof,JSON.stringify({owner,chatId,fileId:file.id,started,seedPid:process.pid}));
            process.stdout.write('seed: mensagem, PDF, entrada pendente e dois envios sintéticos persistidos\n');
        }else if(phase==='crash'){
            const state=JSON.parse(fs.readFileSync(proof));
            const repo=createPgRepository({pool:db,owner:state.owner,objectStore:createLocalObjectStore(path.join(process.env.VCK_TEST_OBJECTS_DIR,state.owner))});
            const job=await repo.claim(state.owner);
            assert.ok(job?.id&&job?.token);
            assert.equal((await db.query('select estado from public.atendimento_outbox where id=$1',[job.id])).rows[0].estado,'tentativa');
            // The fake network boundary has been crossed. Deliberately omit finish(), then kill this worker.
            fs.writeFileSync(proof,JSON.stringify({...state,claimedId:job.id,crashPid:process.pid,mockSendCalls:1}));
            process.stdout.write('crash: reserva commitada; uma chamada sintética; sem confirmação\n');
            process.exit(41);
        }else if(phase==='verify'){
            const state=JSON.parse(fs.readFileSync(proof));
            const store=createLocalObjectStore(path.join(process.env.VCK_TEST_OBJECTS_DIR,state.owner));
            const repo=createPgRepository({pool:db,owner:state.owner,objectStore:store});
            const started=(await db.query('select pg_postmaster_start_time() started')).rows[0].started.toISOString();
            assert.notEqual(started,state.started,'PostgreSQL precisa ter reiniciado de fato');
            assert.notEqual(process.pid,state.seedPid);assert.notEqual(process.pid,state.crashPid);
            assert.deepEqual((await repo.file(state.owner,state.fileId)).bytes,Array.from(demoPdf()));
            assert.equal((await repo.messages(state.owner,state.chatId)).length,3);
            assert.equal((await repo.processNext(state.owner)).state,'processado');
            assert.equal((await repo.list(state.owner))[0].unread,1);
            assert.equal((await repo.recoverUncertain(state.owner,0)).uncertain,1);
            let calls=0;
            const transport={mode:'sintetico',send:()=>{calls++;return{providerId:'restart-only-pending'};}};
            assert.equal((await repo.dispatchNext(state.owner,transport)).result,'simulada');
            assert.equal(await repo.dispatchNext(state.owner,transport),null);
            assert.equal(calls,1,'envio anterior incerto jamais deve ser repetido automaticamente');
            const out=(await db.query('select estado,count(*)::int n from public.atendimento_outbox where user_id=$1 group by estado',[state.owner])).rows;
            assert.equal(out.find(r=>r.estado==='incerto')?.n,1);
            assert.equal(out.find(r=>r.estado==='simulada')?.n,1);
            const packageService=createDurableBackup(repo),pack=await packageService.exportPackage(state.owner);
            const restoreDb=new Pool({connectionString:target.href});
            try{
                await restoreDb.query('insert into auth.users(id) values($1)',[state.owner]);
                const restored=createPgRepository({pool:restoreDb,owner:state.owner,objectStore:createLocalObjectStore(path.join(process.env.VCK_TEST_OBJECTS_DIR,'restart-restored',state.owner))});
                assert.equal((await createDurableBackup(restored).restorePackage(state.owner,pack)).files,1);
                assert.deepEqual((await restored.file(state.owner,state.fileId)).bytes,Array.from(demoPdf()));
                assert.equal((await restored.messages(state.owner,state.chatId)).length,4);
                assert.equal((await restored.list(state.owner))[0].unread,1);
                assert.equal(await restored.dispatchNext(state.owner,transport),null);
            }finally{await restoreDb.end();}
            assert.equal(calls,1);
            process.stdout.write(JSON.stringify({pgRestarted:true,workerRestarted:true,committedInboxSurvived:true,uncertainNotResent:true,mockCallsBeforeCrash:state.mockSendCalls,mockCallsAfterRestart:calls,ownerIsolationVerifiedBySuite:true,attachmentRestoredWithBytes:true,restoredMessages:4})+'\n');
        }else throw new Error('Fase inválida.');
    }finally{if(phase!=='crash')await db.end();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
