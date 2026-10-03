/* Pure proposal renderer: keep presentation independent from the quotation form. */
(function(root){
  'use strict';
  const logos = typeof module === 'object' && module.exports ? require('./airline-logos.js') : root.AIRLINE_LOGOS;
  const esc = x => String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = x => String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const money = n => Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  function number(x){if(typeof x==='number')return x;const s=String(x??'').replace(/R\$|\s/g,'');return s.includes(',')?Number(s.replace(/\./g,'').replace(',','.')):Number(s);}
  function date(iso,format={day:'2-digit',month:'2-digit',year:'numeric'}){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||''))return '';
    return new Intl.DateTimeFormat('pt-BR',{...format,timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
  }
  function dayDelta(start,end){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(end||''))return null;
    return Math.round((Date.parse(end+'T12:00:00Z')-Date.parse(start+'T12:00:00Z'))/86400000);
  }
  function airport(x){const s=String(x||'').trim(),parts=s.split(/\s*[—–]\s*/);return {code:parts[0],city:parts[1]||''};}
  function getLogo(name){return Object.entries(logos||{}).find(([n])=>norm(n)===norm(name))?.[1]||'';}
  function safeLink(x){try{const u=new URL(x);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return '';}}
  function options(d){
    const c=d.calc||{};
    if(c.compAtivo && c.bagAdd?.ativo)throw new Error('Ative apenas um comparativo de bagagem antes de gerar a proposta.');
    let rows=[];
    if(c.compAtivo){
      rows=['A','B','C','D'].flatMap(key=>{
        if(!c['compOpt'+key]){if(key==='A'||key==='B')throw new Error('Recalcule o comparativo de tarifas antes de gerar.');return [];}
        let o;try{o=typeof c['compOpt'+key]==='string'?JSON.parse(c['compOpt'+key]):c['compOpt'+key];}catch{throw new Error('Comparativo inválido. Recalcule as tarifas.');}
        return [{key:key.toLowerCase(),label:o.label,total:number(o.total??o.totalFmt),pp:number(o.porPessoa??o.porPessoaFmt),detail:'',selected:c.compOpcaoSelecionada===key.toLowerCase()}];
      });
    }else if(c.bagAdd?.ativo){
      const b=c.bagAdd.bagRes;if(!b)throw new Error('Recalcule o adicional de bagagem antes de gerar.');
      rows=[{key:'sem',label:'Sem mala despachada',total:number(b.baseTotal),pp:number(b.basePP),detail:'Tarifa base da proposta'},
        {key:'com',label:'Com mala despachada',total:number(b.comTotal),pp:number(b.comPP),detail:[b.detalhe,b.trechoLabel,number(b.custoBagPP)>0?'+ '+money(number(b.custoBagPP))+' por pessoa':''].filter(Boolean).join(' · ')}]
        .map(o=>({...o,selected:c.bagAdd.opcaoSelecionada===o.key}));
    }
    for(const r of rows)if(!Number.isFinite(r.total)||!Number.isFinite(r.pp)||r.total<=0||r.pp<=0)throw new Error('Há valores inválidos no comparativo. Recalcule antes de gerar.');
    return rows;
  }
  function cardForOption(d,o,config){
    const base=number(d.valCartaoBase),pix=number(d.valTotalPix);
    if(!d.valCartaoBase||!Number.isFinite(base)||base<=0)return null;
    // Existing calculator applies the chosen Pix total as the card base. Do not
    // extrapolate a manually negotiated card base to the other options.
    if(Math.abs(base-pix)>.02){
      if(!o.selected||Math.abs(o.total-pix)>.02)return null;
      return cardFromForm(d);
    }
    const n=Number(d.parcelas);if(!Number.isInteger(n)||n<1||n>10)return null;
    const divisor=d.comJuros===false?1:Number(config.cardDivisor);
    if(!(divisor>0&&divisor<=1))return null;
    const total=o.total/divisor;
    return {label:n>1?n+'x de '+money(total/n):money(total),sub:'total '+money(total)+(d.comJuros===false?' · sem juros':'')};
  }
  function cardFromForm(d){
    if(!d.valCartaoBase)return null;
    const n=Number(d.parcelas);
    if(n>1&&d.valParcela)return {label:n+'x de '+d.valParcela,sub:'total '+(d.valCartaoFinal||d.valCartaoBase)+(d.comJuros===false?' · sem juros':'')};
    return {label:d.valCartaoFinal||d.valCartaoBase,sub:'à vista no cartão'};
  }
  function render(d,config={}){
    const base=String(config.baseUrl||'./');
    const rows=options(d),comparison=rows.length>0;
    const out=airport(d.orig),dest=airport(d.dest);
    const backOut=d.multitrecho&&d.origVolta?airport(d.origVolta):dest;
    const backDest=d.multitrecho&&d.destVolta?airport(d.destVolta):out;
    const pax=Number(d.totalPax)||1;
    const paxLabel=[d.adultos?d.adultos+' adulto'+(d.adultos>1?'s':''):'',d.criancas?d.criancas+' criança'+(d.criancas>1?'s':''):'',d.bebes?d.bebes+' bebê'+(d.bebes>1?'s':''):''].filter(Boolean).join(' · ')||pax+' passageiro'+(pax>1?'s':'');
    function connections(key){
      const count=Number(String(d['parada'+key]||'').match(/\d/)?.[0]||0);
      return Array.from({length:count},(_,i)=>{
        const n=i+1,s=i?String(n):'',city=d['escalaCidade'+s+key],wait=d['escalaTempo'+s+key];
        const transfer=d['troca'+key+n],next=d['troca'+key+n+'Dest'];
        return [transfer?'Troca de aeroporto: '+(city||'a confirmar')+' → '+(next||'a confirmar'):'Conexão em '+(city||'a confirmar'),wait?'espera '+wait:''].filter(Boolean).join(' · ');
      });
    }
    function leg(key,a,b){
      const cia=key==='Volta'?(d.ciaVolta||d.cia):d.cia;
      const operator=d['ciaOperadora'+key];
      const operated=operator&&norm(operator)!==norm(cia)?'<div class="operated">Operado por '+esc(operator)+'</div>':'';
      const depISO=d['data'+key+'ISO'];
      const arrISO=d.timing?.fields?.['p-data-chegada-'+key.toLowerCase()];
      const delta=dayDelta(depISO,arrISO),badge=delta?'<sup>'+esc((delta>0?'+':'')+delta)+'</sup>':'';
      const connection=connections(key),logo=getLogo(cia);
      const baggage=comparison?'Bagagem despachada conforme opção escolhida':(d['bagDesp'+key]?'Bagagem despachada: '+d['bagDesp'+key]:'');
      const flightNumbers=[1,2,3,4].slice(0,connection.length+1).map(n=>d['voo'+key+(n===1?'':n)]).filter(Boolean).join(' · ');
      return `<section class="block leg" data-direction="${key}">
        <div class="date"><span class="tag ${key==='Volta'?'v':''}">${key.toUpperCase()}</span><div class="d">${esc(date(depISO,{day:'2-digit'})||'—')}</div><div class="m">${esc(date(depISO,{month:'short',year:'numeric'}).replace(' de ',' ').replace('.','').toUpperCase())}</div><div class="w">${esc(date(depISO,{weekday:'long'}).replace('-feira',''))}</div></div>
        <div class="fl"><div class="pt"><div class="t">${esc(d['dep'+key]||'—')}</div><div class="c">${esc(a.code)}</div><div class="n">${esc(a.city)}</div></div>
          <div class="path"><div class="dur">${esc(d['dur'+key]||'')} ${d['dur'+key]?'de viagem':''}</div><div class="line">${connection.length?'<b></b>':''}</div><div class="stop">${connection.length?connection.map(esc).join('<br>'):'Voo direto'}</div></div>
          <div class="pt r"><div class="t">${esc(d['cheg'+key]||'—')}${badge}</div><div class="c">${esc(b.code)}</div><div class="n">${esc(b.city)}</div>${arrISO?'<div class="arr">chega '+esc(date(arrISO,{weekday:'short',day:'2-digit',month:'2-digit'}))+'</div>':''}</div></div>
        <div class="det">${logo?'<img class="airline-logo" src="'+esc(base+'assets/airlines/'+logo)+'" alt="'+esc(cia)+'">':''}<div class="al">${esc(cia||'Companhia a confirmar')}</div>${operated}<span>${esc(d.classe||'')}</span>${flightNumbers?'<span>'+esc(flightNumbers)+'</span>':''}<span>${connection.length?(connection.length===1?'1 conexão':connection.length+' conexões'):'Direto'}</span>${d.bagMao?'<div class="bag">Bagagem de mão: '+esc(d.bagMao)+'</div>':''}${baggage?'<div class="bag">'+esc(baggage)+'</div>':''}</div>
      </section>`;
    }
    function title(t,sub=''){return '<div class="sec"><h2>'+esc(t)+'</h2><i></i><em>'+esc(sub)+'</em></div>';}
    function option(r,i){const card=cardForOption(d,r,config);return `<article class="opt ${r.selected?'selected':''}"><div class="ot">Opção ${i+1}${r.selected?' · selecionada':''}</div><div class="on">${esc(r.label)}</div><div class="os">${esc(r.detail)}</div><div class="big">${money(r.pp)}<small>por pessoa no Pix</small></div><div class="rows"><div class="row"><span>Total no Pix · ${pax} pessoa${pax>1?'s':''}</span><b>${money(r.total)}</b></div>${card?'<div class="row"><span>Cartão de crédito</span><b>'+esc(card.label)+'<small>'+esc(card.sub)+'</small></b></div>':''}</div></article>`;}
    const card=cardFromForm(d);
    const values=comparison?Array.from({length:Math.ceil(rows.length/2)},(_,i)=>'<section class="block price-section" data-price-mode="comparison">'+title(i?'Investimento · outras opções':'Investimento','valores em reais')+'<div class="opts">'+rows.slice(i*2,i*2+2).map((r,k)=>option(r,i*2+k)).join('')+'</div></section>').join(''):
      '<section class="block price-section" data-price-mode="standard">'+title('Investimento','valores em reais')+'<div class="one">'+
      (d.valPix?'<div><div class="ot">Por pessoa no Pix</div><div class="v xl">'+esc(d.valPix)+'</div><div class="s">'+pax+' passageiro'+(pax>1?'s':'')+'</div></div>':'')+
      (d.valTotalPix?'<div><div class="ot">Total no Pix</div><div class="v">'+esc(d.valTotalPix)+'</div><div class="s">Todos os passageiros</div></div>':'')+
      (card?'<div><div class="ot">Cartão de crédito</div><div class="v">'+esc(card.label)+'</div><div class="s">'+esc(card.sub)+'</div></div>':'')+'</div></section>';
    const hotel=d.hotelNome?'<section class="block">'+title('Hospedagem')+'<div class="hotel"><h3>'+esc(d.hotelNome)+'</h3>'+[d.hotelCheckin?'Check-in: '+(date(d.hotelCheckin)||d.hotelCheckin):'',d.hotelCheckout?'Check-out: '+(date(d.hotelCheckout)||d.hotelCheckout):'',d.hotelNoites?d.hotelNoites+' noite(s)':'',d.hotelRegime].filter(Boolean).map(esc).join(' · ')+(safeLink(d.linkHotel)?'<br><a href="'+esc(safeLink(d.linkHotel))+'">Ver fotos e detalhes do hotel</a>':'')+'</div></section>':'';
    const observations=String(d.obs||'').split(/\n+/).filter(Boolean).map(x=>'<p class="user-note">'+esc(x)+'</p>').join('');
    const note='<section class="block notes">'+observations+(safeLink(d.linkAereo)?'<p><a href="'+esc(safeLink(d.linkAereo))+'">Ver detalhes dos voos</a></p>':'')+'<p><b>Validade.</b> Valores e disponibilidade sujeitos a alteração até a emissão.</p><p><b>Documentação.</b> Confira os documentos e requisitos de entrada e trânsito aplicáveis ao seu itinerário.</p></section>';
    const range=[date(d.dataIdaISO),!d.somenteIda?date(d.timing?.fields?.['p-data-chegada-volta']||d.dataVoltaISO):''].filter(Boolean).join(' a ');
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Proposta · ${esc(d.cliente)}</title><link rel="stylesheet" href="${esc(base+'assets/proposal-a4.css')}"></head><body>
      <div class="print-tools"><button id="print-proposal" type="button" disabled>Salvar / imprimir PDF</button><span id="print-status">Preparando páginas A4…</span></div>
      <div class="page"><header class="top"><div class="bar"><div class="brand">VOECOMKENNEDY<small>PASSAGENS AÉREAS</small></div><div class="meta">Proposta comercial<b>${esc(d.geradoEm?'Emitida em '+d.geradoEm:'')}</b></div></div><div class="hero"><div><div class="eyebrow">${d.somenteIda?'Somente ida':d.multitrecho?'Múltiplos destinos':'Ida e volta'}</div><div class="route">${esc(out.city||out.code)}<span>→</span>${esc(dest.city||dest.code)}</div><div class="codes">${esc(out.code)} · ${esc(dest.code)}</div></div><div class="client"><span class="eyebrow">Preparada para</span><div class="name">${esc(d.cliente)}</div></div></div><div class="chips">${[paxLabel,range,d.cia,d.classe].filter(Boolean).map(x=>'<div class="chip">'+esc(x)+'</div>').join('')}</div></header>
      <main><div class="page-content"><div class="block">${title('Itinerário','horários locais de cada aeroporto')}</div>${leg('Ida',out,dest)}${d.somenteIda?'':leg('Volta',backOut,backDest)}${hotel}${values}
      <section class="block">${title('Próximos passos')}<div class="steps"><div class="step"><div class="k">1</div><div><b>Confirme a opção</b><p>Informe a opção escolhida e a forma de pagamento pelo WhatsApp.</p></div></div><div class="step"><div class="k">2</div><div><b>Confira os dados</b><p>Envie os dados dos passageiros como constam no documento de viagem.</p></div></div><div class="step"><div class="k">3</div><div><b>Receba sua emissão</b><p>Após a confirmação, enviamos os bilhetes e localizadores.</p></div></div></div></section>${note}</div></main>
      <footer><div class="fb">VOECOMKENNEDY<small>CNPJ 56.913.032/0001-32</small></div><div class="fc"><span>Atendimento</span>WhatsApp (62) 99644-8671<div class="page-number"></div></div></footer></div>
      <script src="${esc(base+'js/proposal-print.js')}"></script></body></html>`;
  }
  const api={render,options,dayDelta,cardForOption,getLogo};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ProposalPDF=api;
})(typeof globalThis!=='undefined'?globalThis:this);
