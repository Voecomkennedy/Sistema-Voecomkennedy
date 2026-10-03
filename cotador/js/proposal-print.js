/* Fixed A4 pages. Move whole blocks to a continuation rather than clipping them. */
(async function(){
  'use strict';
  const button=document.getElementById('print-proposal');
  const status=document.getElementById('print-status');
  try {
    if(document.fonts)await document.fonts.ready;
    await Promise.all([...document.images].map(img=>img.decode().catch(()=>{img.hidden=true;})));
    const first=document.querySelector('.page');
    const template=first.cloneNode(true);
    template.classList.add('continuation');
    template.querySelector('.page-content').replaceChildren();
    const blocks=[...first.querySelector('.page-content').children];
    // Long observations are split only at word boundaries; nothing is discarded.
    const queue=blocks.flatMap(block=>{
      if(!block.classList.contains('notes')||block.textContent.length<1000)return [block];
      return [...block.children].flatMap(p=>{
        const words=p.textContent.split(/\s+/),chunks=[];let text='';
        for(const word of words){if(text.length+word.length>850&&text){chunks.push(text);text='';}text+=(text?' ':'')+word;}
        if(text)chunks.push(text);
        return chunks.map(text=>{const section=document.createElement('section');section.className='block notes';const part=document.createElement('p');part.className=p.className;part.textContent=text;section.append(part);return section;});
      });
    });
    first.querySelector('.page-content').replaceChildren();
    const pages=[first];let page=first;
    const fits=()=>page.querySelector('.page-content').scrollHeight<=page.querySelector('.page-content').clientHeight+1;
    function nextPage(){const n=template.cloneNode(true);page.after(n);page=n;pages.push(n);return n.querySelector('.page-content');}
    for(const block of queue){
      let content=page.querySelector('.page-content');content.append(block);
      if(!fits()){
        block.remove();
        // Keep an itinerary heading with the first flight on the next page.
        const last=content.lastElementChild;
        const heading=last&&last.children.length===1&&last.firstElementChild.classList.contains('sec')?last:null;
        content=nextPage();if(heading)content.append(heading);content.append(block);
        if(!fits())throw new Error('Um bloco está maior que a área A4. Reduza o texto desse bloco e gere novamente.');
      }
    }
    pages.forEach((p,i)=>{p.querySelector('.page-number').textContent=pages.length>1?(i+1)+' / '+pages.length:'';});
    status.textContent=pages.length+' página'+(pages.length>1?'s':'')+' A4 · impressão em 100%, sem margens e sem cabeçalho/rodapé do navegador.';
    document.documentElement.dataset.printReady='true';
    button.disabled=false;button.addEventListener('click',()=>window.print());
  }catch(error){status.textContent='Não foi possível preparar o PDF: '+error.message;document.documentElement.dataset.printReady='error';}
})();
