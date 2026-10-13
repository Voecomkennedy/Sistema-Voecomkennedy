// Entrypoint exclusivamente local e injetável. Desativado por padrão, sem serviço externo.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createDurableHandler } from '../supabase/functions/_shared/atendimento/durable-handler.mjs';
import { createDurableBackup } from '../supabase/functions/_shared/atendimento/backup.mjs';
const staticFiles=new Map([
    ['/atendimento.html','text/html; charset=utf-8'],
    ['/css/atendimento.css','text/css; charset=utf-8'],
    ['/js/atendimento-page.mjs','text/javascript; charset=utf-8'],
    ['/js/atendimento-persistente.mjs','text/javascript; charset=utf-8'],
    ['/js/atendimento-http-client.mjs','text/javascript; charset=utf-8'],
    ['/js/atendimento-domain.mjs','text/javascript; charset=utf-8'],
    ['/js/atendimento-demo.mjs','text/javascript; charset=utf-8'],
    ['/js/atendimento-adapters.mjs','text/javascript; charset=utf-8'],
    ['/js/messages-domain.mjs','text/javascript; charset=utf-8'],
    ['/js/storage.js','text/javascript; charset=utf-8'],
    ['/favicon-32.png','image/png']
]);
export function createLocalAtendimentoHttpServer({root,repository,enabled=false,allowedOrigin,transport}){
    if(!path.isAbsolute(root)||!allowedOrigin||new URL(allowedOrigin).hostname!=='127.0.0.1')throw new Error('Servidor sintético exige origem de loopback explícita.');
    const handler=createDurableHandler({enabled,allowedOrigin,
        verifyUser:authorization=>authorization==='Synthetic local' ? {id:repository.owner}:null,
        repositoryFor:()=>repository,backupFor:createDurableBackup,
        transport:transport||{mode:'sintetico',send:(_payload,{outcome})=>outcome==='failure'?{definitelyNotSent:true}:outcome==='uncertain'?{}:{providerId:crypto.randomUUID()}}
    });
    return createServer(async(req,res)=>{
        try{
            const url=new URL(req.url,allowedOrigin);
            if(url.pathname==='/atendimento-api'){
                if(!['127.0.0.1','::1'].includes(req.socket.remoteAddress?.replace(/^::ffff:/,''))){res.writeHead(403);res.end();return;}
                if(req.method!=='POST'){res.writeHead(405);res.end();return;}
                let size=0;const chunks=[];
                for await(const chunk of req){size+=chunk.length;if(size>20*1024*1024){res.writeHead(413);res.end();return;}chunks.push(chunk);}
                const request=new Request(allowedOrigin+'/atendimento-api',{method:req.method,headers:{origin:req.headers.origin||'',authorization:req.headers.authorization||'','content-type':req.headers['content-type']||'application/json'},body:Buffer.concat(chunks)});
                const answer=await handler(request);res.writeHead(answer.status,Object.fromEntries(answer.headers));res.end(Buffer.from(await answer.arrayBuffer()));return;
            }
            if(req.method!=='GET'||!staticFiles.has(url.pathname)){res.writeHead(404);res.end();return;}
            const bytes=await readFile(path.join(root,url.pathname.slice(1)));
            res.writeHead(200,{'content-type':staticFiles.get(url.pathname),'cache-control':'no-store'});res.end(bytes);
        }catch{res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({erro:'Servidor sintético indisponível.'}));}
    });
}
