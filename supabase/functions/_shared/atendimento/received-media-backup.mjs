const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const sha=async bytes=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const encode=bytes=>{let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.slice(i,i+32768));return btoa(text);};
const decode=text=>Uint8Array.from(atob(text),x=>x.charCodeAt(0));
const validate=(owner,file)=>uuid(owner)&&uuid(file.id)&&file.caminho===`${owner}/recebidos/${file.id}.pdf`&&
  Number.isInteger(Number(file.tamanho))&&Number(file.tamanho)>=5&&Number(file.tamanho)<=5242880&&/^[0-9a-f]{64}$/.test(file.sha256);

// Backup do banco continua separado; este manifesto contém os bytes dos objetos privados.
export async function exportReceivedMedia({owner,rows,get}){
  const files=[];
  for(const row of rows){
    if(!validate(owner,row))throw new Error('Metadados de PDF inválidos.');
    const bytes=await get(row.caminho);
    if(!(bytes instanceof Uint8Array)||bytes.length!==Number(row.tamanho)||await sha(bytes)!==row.sha256)throw new Error('PDF ausente ou corrompido; exportação abortada.');
    files.push({id:row.id,path:row.caminho,size:bytes.length,sha256:row.sha256,base64:encode(bytes)});
  }
  return {version:1,owner,files};
}

export async function restoreReceivedMedia({pack,owner,rows,get,put}){
  if(pack?.version!==1||pack.owner!==owner||!Array.isArray(pack.files)||pack.files.length!==rows.length)throw new Error('Manifesto incompatível.');
  const indexed=new Map(rows.map(r=>[r.id,r]));if(indexed.size!==rows.length)throw new Error('Metadados duplicados.');
  const decoded=[];
  for(const file of pack.files){
    const row=indexed.get(file.id);
    if(!row||!validate(owner,row)||file.path!==row.caminho||file.sha256!==row.sha256||file.size!==Number(row.tamanho)||typeof file.base64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64))throw new Error('Manifesto inválido.');
    const bytes=decode(file.base64);
    if(bytes.length!==file.size||await sha(bytes)!==file.sha256)throw new Error('PDF corrompido no backup.');
    decoded.push({path:file.path,bytes,sha256:file.sha256});indexed.delete(file.id);
  }
  if(indexed.size)throw new Error('PDF ausente no manifesto.');
  for(const file of decoded){
    const prior=await get(file.path);
    if(prior){if(prior.length!==file.bytes.length||await sha(prior)!==file.sha256)throw new Error('Destino ocupado por PDF divergente.');continue;}
    await put(file.path,file.bytes);
    const saved=await get(file.path);
    if(!saved||saved.length!==file.bytes.length||await sha(saved)!==file.sha256)throw new Error('Restauração do PDF não confirmada.');
  }
  return {files:decoded.length,verified:true};
}
