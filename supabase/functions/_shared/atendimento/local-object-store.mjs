// Filesystem adapter exclusivo dos testes locais. Sem serviço, rede ou credenciais.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
const pattern=/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/;
export function createLocalObjectStore(root){
    if(!path.isAbsolute(root))throw new Error('Pasta de objetos deve ser absoluta.');
    const target=key=>{if(!pattern.test(key))throw new Error('Caminho de objeto inválido.');return path.join(root,key);};
    const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
    return {mode:'sintetico',digest,
        async put(key,bytes){
            const destination=target(key);await fs.mkdir(path.dirname(destination),{recursive:true});
            const temporary=destination+'.tmp-'+randomUUID();await fs.writeFile(temporary,bytes,{flag:'wx'});
            try{await fs.link(temporary,destination);}
            catch(error){if(error.code!=='EEXIST')throw error;const existing=await fs.readFile(destination);if(digest(existing)!==digest(bytes))throw new Error('Objeto existente com outro checksum.');}
            finally{await fs.unlink(temporary);}
            return {path:key,sha256:digest(bytes)};
        },
        async get(key){return new Uint8Array(await fs.readFile(target(key)));}
    };
}
