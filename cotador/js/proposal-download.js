/* Vector A4 export of the existing proposal-a4.css composition. */
(function (root) {
  'use strict';
  const N='#0A1931', B='#1A3D63', S='#4A7FA7', K='#B3CFE5', P='#F6FAFD', M='#677787', L='#DCE6ED';
  const T=(value,extra={})=>({text:Array.isArray(value)?value:String(value??''),...extra});
  const brl=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const moneyInput=value=>{
    if(!value)return '';
    const raw=String(value).replace(/R\$|\s/g,'');
    const amount=Number(raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw);
    return Number.isFinite(amount)?brl(amount):String(value);
  };
  const locationPart=value=>{const parts=String(value||'').split(/\s*[—–]\s*/);return {code:parts[0],city:parts[1]||parts[0]};};
  const safeLink=value=>{try{const u=new URL(value);return /^https?:$/.test(u.protocol)?u.href:'';}catch{return '';}};
  const date=(iso,format={day:'2-digit',month:'2-digit',year:'numeric'})=>
    /^\d{4}-\d{2}-\d{2}$/.test(iso||'')?new Intl.DateTimeFormat('pt-BR',{...format,timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z')):'';
  const shadeLayout={hLineColor:()=>L,vLineColor:()=>L,hLineWidth:()=>.65,vLineWidth:()=>.65,
    paddingLeft:()=>0,paddingRight:()=>0,paddingTop:()=>0,paddingBottom:()=>0};
  const noBorders={hLineWidth:()=>0,vLineWidth:()=>0,paddingLeft:()=>0,paddingRight:()=>0,paddingTop:()=>0,paddingBottom:()=>0};
  function section(title,sub='') {
    return {table:{widths:[title.length*7+12,'*',125],body:[[
      T(title.toUpperCase(),{font:'MontserratBold',fontSize:7.6,color:B,characterSpacing:1.6}),
      {canvas:[{type:'line',x1:0,y1:5,x2:235,y2:5,lineWidth:.6,lineColor:L}]},
      T(sub,{font:'Inter',fontSize:7,color:M,alignment:'right'})
    ]]},layout:noBorders,margin:[0,12,0,10]};
  }
  function lineGraphic(stops) {
    const marks=stops?'<rect x="80" y="5" width="7" height="7" fill="'+K+'"/>':'';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="166" height="15" viewBox="0 0 166 15">'+
      '<line x1="4" y1="8" x2="162" y2="8" stroke="'+K+'" stroke-width="1.2"/>'+
      '<circle cx="5" cy="8" r="4" fill="white" stroke="'+S+'" stroke-width="1.2"/>'+
      '<circle cx="161" cy="8" r="4" fill="'+S+'" stroke="'+S+'" stroke-width="1.2"/>'+marks+'</svg>';
  }
  function connections(d,key) {
    const count=Number(String(d['parada'+key]||'').match(/\d/)?.[0]||0);
    return Array.from({length:count},(_,i)=>{
      const n=i+1,s=i?String(n):'',city=d['escalaCidade'+s+key]||'a confirmar';
      const transfer=d['troca'+key+n],next=d['troca'+key+n+'Dest'];
      return (transfer?'Troca de aeroporto: '+city+' → '+(next||'a confirmar'):'Conexão em '+city)+
        (d['escalaTempo'+s+key]?' · espera '+d['escalaTempo'+s+key]:'');
    });
  }
  function leg(d,key,from,to,logo) {
    const stops=connections(d,key),dep=d['data'+key+'ISO'];
    const arr=d.timing?.fields?.['p-data-chegada-'+key.toLowerCase()];
    const cia=key==='Volta'?d.ciaVolta||d.cia:d.cia;
    const operator=d['ciaOperadora'+key];
    const flights=[1,2,3,4].slice(0,stops.length+1).map(n=>d['voo'+key+(n===1?'':n)]).filter(Boolean).join(' · ');
    const info=[cia||'Companhia a confirmar',
      operator&&operator.toLowerCase()!==String(cia||'').toLowerCase()?'Operado por '+operator:'',
      d.classe,flights,stops.length?(stops.length===1?'1 conexão':stops.length+' conexões'):'Direto',
      d.bagMao?'Bagagem de mão: '+d.bagMao:'',
      d['bagDesp'+key]?'Bagagem despachada: '+d['bagDesp'+key]:''].filter(Boolean);
    const logoBlock=logo?[{[logo.trimStart().startsWith('<svg')?'svg':'image']:logo,fit:[70,22],margin:[0,0,0,2]}]:[];
    const dateStack=[
      {table:{body:[[{text:key.toUpperCase(),font:'InterBold',fontSize:6.4,color:'#FFFFFF',characterSpacing:1.4,
        alignment:'center',fillColor:key==='Volta'?S:B}]]},
        layout:{hLineWidth:()=>0,vLineWidth:()=>0,paddingLeft:()=>6,paddingRight:()=>6,paddingTop:()=>2,paddingBottom:()=>2},margin:[7,3,7,6]},
      T(date(dep,{day:'2-digit'}),{font:'MontserratBold',fontSize:20,alignment:'center'}),
      T(date(dep,{month:'short',year:'numeric'}).replace(' de ',' ').replace('.','').toUpperCase(),
        {font:'InterSemi',fontSize:6.6,color:B,alignment:'center',characterSpacing:.7}),
      T(date(dep,{weekday:'long'}).replace('-feira',''),{font:'Inter',fontSize:6.6,color:M,alignment:'center',margin:[0,3,0,0]})
    ];
    const pt=(time,airport,right=false,arrival=false)=>({stack:[
      T(time||'—',{font:'MontserratBold',fontSize:16,alignment:right?'right':'left'}),
      T(airport.code,{font:'InterBold',fontSize:8,color:B,characterSpacing:.6,alignment:right?'right':'left',margin:[0,5,0,1]}),
      T(airport.city,{font:'Inter',fontSize:6.8,color:M,alignment:right?'right':'left'}),
      ...(arrival&&arr?[T('chega '+date(arr,{weekday:'short',day:'2-digit',month:'2-digit'}),
        {font:'InterSemi',fontSize:6.4,color:S,alignment:'right',margin:[0,4,0,0]})]:[])
    ]});
    const route={columns:[
      {width:68,...pt(d['dep'+key],from)},
      {width:166,stack:[
        T((d['dur'+key]||'')+(d['dur'+key]?' de viagem':''),{font:'InterSemi',fontSize:7,color:B,alignment:'center'}),
        {svg:lineGraphic(stops.length),width:166,margin:[0,5,0,1]},
        T(stops.length?stops.join('\n'):'Voo direto',{font:'Inter',fontSize:6.5,color:M,alignment:'center',lineHeight:1.2})
      ]},
      {width:68,...pt(d['cheg'+key],to,true,true)}
    ],columnGap:7,margin:[10,20,10,0]};
    const detail={stack:[...logoBlock,...info.map((s,i)=>{const bag=s.startsWith('Bagagem');
      return T(s,{font:i===0?'InterBold':bag?'InterSemi':'Inter',
        fontSize:i===0?7.4:bag?6.4:6.7,color:bag?B:i===0?N:M,margin:[0,i?2:0,0,0]});})],margin:[9,9,8,6]};
    return {table:{widths:[60,340,115],heights:()=>108,body:[[
      {stack:dateStack,fillColor:P},
      route,
      detail
    ]]},layout:shadeLayout,margin:[0,0,0,9],dontBreakRows:true};
  }
  function priceCard(label,amount,sub,large=false) {
    return {stack:[
      T(label.toUpperCase(),{font:'InterBold',fontSize:6.8,color:S,characterSpacing:1.3}),
      T(amount||'—',{font:'MontserratBold',fontSize:large?20:13,color:N,margin:[0,9,0,2]}),
      T(sub,{font:'Inter',fontSize:7,color:M})
    ],fillColor:P,margin:[12,12,12,12]};
  }
  function options(d,config) {
    const rows=root.ProposalPDF?.options?root.ProposalPDF.options(d):[];
    if(!rows.length) {
      const pax=Number(d.totalPax)||1;
      const card=d.valCartaoBase?(Number(d.parcelas)>1&&d.valParcela?
        d.parcelas+'x de '+moneyInput(d.valParcela):moneyInput(d.valCartaoFinal||d.valCartaoBase)):'';
      const sub=d.valCartaoBase?'total '+moneyInput(d.valCartaoFinal||d.valCartaoBase)+(d.comJuros===false?' · sem juros':''):'';
      return [{table:{widths:[171,171,173],heights:()=>79,body:[[
        priceCard('Por pessoa no Pix',moneyInput(d.valPix),pax+' passageiro'+(pax>1?'s':''),true),
        priceCard('Total no Pix',moneyInput(d.valTotalPix),'Todos os passageiros'),
        priceCard('Cartão de crédito',card,sub)
      ]]},layout:{...shadeLayout,hLineColor:()=>K,vLineColor:()=>K}}];
    }
    const cards=[];
    for(let i=0;i<rows.length;i+=2) {
      const cells=rows.slice(i,i+2).map((o,j)=>{
        const card=root.ProposalPDF.cardForOption(d,o,{cardDivisor:config.cardDivisor});
        return {stack:[
          T('OPÇÃO '+(i+j+1)+(o.selected?' · SELECIONADA':''),{font:'InterBold',fontSize:6.8,color:S,characterSpacing:1.2}),
          T(o.label,{font:'MontserratBold',fontSize:10,color:N,margin:[0,5,0,2]}),
          T(o.detail,{font:'Inter',fontSize:7,color:M}),
          T(brl(o.pp),{font:'MontserratBold',fontSize:19,color:N,margin:[0,8,0,0]}),
          T('por pessoa no Pix',{font:'Inter',fontSize:7,color:M}),
          T('Total no Pix · '+brl(o.total),{font:'InterBold',fontSize:8,color:N,margin:[0,8,0,0]}),
          ...(card?[T('Cartão · '+card.label+' · '+card.sub,{font:'InterSemi',fontSize:7,color:B,margin:[0,4,0,0]})]:[])
        ],fillColor:P,margin:[13,12,13,12]};
      });
      if(cells.length===1)cells.push({text:''});
      cards.push({table:{widths:[257,258],heights:()=>145,body:[cells],dontBreakRows:true},layout:{...shadeLayout,hLineColor:()=>K,vLineColor:()=>K},margin:[0,0,0,8]});
    }
    return cards;
  }
  function step(n,title,description) {
    return {columns:[
      {width:18,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="9" cy="9" r="9" fill="'+N+'"/><text x="9" y="12" text-anchor="middle" fill="white" font-size="9" font-weight="bold">'+n+'</text></svg>'},
      {width:139,stack:[
        T(title,{font:'InterBold',fontSize:7.8,color:N}),
        T(description,{font:'Inter',fontSize:7,color:M,lineHeight:1.4,margin:[0,2,0,0]})
      ]}
    ],columnGap:6};
  }
  function header(d,page) {
    const from=locationPart(d.orig),to=locationPart(d.dest),pax=Number(d.totalPax)||1;
    const paxItem=(count,singular,plural)=>count?count+' '+(count>1?plural:singular):'';
    const paxLabel=[paxItem(d.adultos,'adulto','adultos'),paxItem(d.criancas,'criança','crianças'),
      paxItem(d.bebes,'bebê','bebês')].filter(Boolean).join(' · ')||pax+' passageiros';
    const range=[date(d.dataIdaISO),!d.somenteIda?date(d.timing?.fields?.['p-data-chegada-volta']||d.dataVoltaISO):''].filter(Boolean).join(' a ');
    const chips=[paxLabel,range,d.cia,d.classe].filter(Boolean);
    const top={columns:[
      {width:'*',stack:[
        T('VOECOMKENNEDY',{font:'MontserratBold',fontSize:11.8,color:'#FFFFFF',characterSpacing:2}),
        T('PASSAGENS AÉREAS',{font:'InterMedium',fontSize:6.8,color:K,characterSpacing:2,margin:[0,3,0,0]})
      ]},
      {width:190,stack:[
        T('PROPOSTA COMERCIAL',{font:'InterSemi',fontSize:7,color:K,characterSpacing:1,alignment:'right'}),
        T(d.geradoEm?'Emitida em '+d.geradoEm:'',{font:'InterSemi',fontSize:8,color:'#FFFFFF',alignment:'right',margin:[0,3,0,0]})
      ]}
    ],margin:[40,25,40,0]};
    if(page!==1)return {stack:[top,T('CONTINUAÇÃO DA PROPOSTA',{font:'InterSemi',fontSize:7,color:K,characterSpacing:1.4,margin:[40,26,40,0]}),
      T((d.cliente||'Cotação de teste')+' · '+from.code+' → '+to.code,{font:'MontserratSemi',fontSize:13,color:'#FFFFFF',margin:[40,6,40,0]})]};
    const hero={columns:[
      {width:'*',stack:[
        T(d.somenteIda?'SOMENTE IDA':d.multitrecho?'MÚLTIPLOS DESTINOS':'IDA E VOLTA',
          {font:'InterSemi',fontSize:7,color:K,characterSpacing:1.8}),
        T(from.city+'  →  '+to.city,{font:'MontserratBold',fontSize:21,color:'#FFFFFF',margin:[0,5,0,2]}),
        T(from.code+' · '+to.code,{font:'InterMedium',fontSize:8,color:K,characterSpacing:1.5})
      ]},
      {width:180,stack:[
        T('PREPARADA PARA',{font:'InterSemi',fontSize:7,color:K,characterSpacing:1.5,alignment:'right'}),
        T(d.cliente||'Cotação de teste',{font:'MontserratSemi',fontSize:String(d.cliente||'').length>32?8.5:12,color:'#FFFFFF',alignment:'right',margin:[0,5,0,0]})
      ],margin:[0,24,0,0]}
    ],margin:[40,17,40,0]};
    return {stack:[
      top,hero,
      {columns:chips.map(label=>{const width=Math.min(180,Math.max(45,label.length*4.4+20));
        return {width,stack:[
          {svg:'<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="17"><rect x="1" y="1" width="'+(width-2)+'" height="15" rx="7.5" fill="none" stroke="#6F8EA9" stroke-width=".7"/></svg>'},
          T(label,{font:'InterMedium',fontSize:7,color:'#FFFFFF',alignment:'center',margin:[0,-13,0,0]})
        ]};}),columnGap:5,margin:[40,3,40,0]}
    ]};
  }
  function definition(d,config={}) {
    const from=locationPart(d.orig),to=locationPart(d.dest);
    const returnFrom=d.multitrecho&&d.origVolta?locationPart(d.origVolta):to;
    const returnTo=d.multitrecho&&d.destVolta?locationPart(d.destVolta):from;
    const content=[
      section('Itinerário','horários locais de cada aeroporto'),
      leg(d,'Ida',from,to,config.logos?.Ida),
      ...(!d.somenteIda?[leg(d,'Volta',returnFrom,returnTo,config.logos?.Volta)]:[])
    ];
    if(d.hotelNome) {
      content.push(section('Hospedagem'));
      const hotelDetails=[d.hotelCheckin?'Check-in: '+d.hotelCheckin:'',d.hotelCheckout?'Check-out: '+d.hotelCheckout:'',d.hotelNoites?d.hotelNoites+' noite(s)':'',d.hotelRegime].filter(Boolean).join(' · ');
      content.push({table:{widths:['*'],body:[[{stack:[
        T(d.hotelNome,{font:'InterBold',fontSize:10,color:N}),
        T(hotelDetails,{font:'Inter',fontSize:8,color:M,margin:[0,4,0,0]}),
        ...(safeLink(d.linkHotel)?[{text:'Ver fotos e detalhes do hotel',link:safeLink(d.linkHotel),font:'InterSemi',fontSize:8,color:B,decoration:'underline',margin:[0,4,0,0]}]:[])
      ],fillColor:P}]]},layout:shadeLayout,margin:[0,0,0,5]});
    }
    content.push(section('Investimento','valores em reais'),...options(d,config),section('Próximos passos'));
    content.push({columns:[
      step('1','Confirme a opção','Informe a opção escolhida e a forma de pagamento pelo WhatsApp.'),
      step('2','Confira os dados','Envie os dados dos passageiros como constam no documento de viagem.'),
      step('3','Receba sua emissão','Após a confirmação, enviamos os bilhetes e localizadores.')
    ],columnGap:7,margin:[0,0,0,5]});
    if(d.obs)content.push(...String(d.obs).split(/\n+/).filter(Boolean).map(s=>T(s,{font:'Inter',fontSize:8,color:B,margin:[0,3,0,3]})));
    if(safeLink(d.linkAereo))content.push({text:'Ver detalhes dos voos',link:safeLink(d.linkAereo),font:'InterSemi',fontSize:8,color:B,decoration:'underline',margin:[0,8,0,0]});
    return {
      pageSize:'A4',pageMargins:[40,180,40,125],info:{title:'Proposta · '+(d.cliente||'Cotação de teste'),author:'VoeComKennedy'},
      background:(page,size)=>({canvas:[
        {type:'rect',x:0,y:0,w:size.width,h:168,color:N},
        {type:'rect',x:0,y:165,w:size.width,h:3,color:S},
        {type:'rect',x:0,y:size.height-56,w:size.width,h:56,color:N}
      ]}),
      header:(page)=>header(d,page),
      footer:(page,pages)=>({stack:[
        ...(page===pages?[
          T([{text:'Validade. ',bold:true},'Valores e disponibilidade sujeitos a alteração até a emissão.'],
            {font:'Inter',fontSize:6.8,color:M,margin:[40,14,40,0]}),
          T([{text:'Documentação. ',bold:true},'Confira os documentos e requisitos de entrada e trânsito aplicáveis ao itinerário.'],
            {font:'Inter',fontSize:6.8,color:M,margin:[40,4,40,0]})
        ]:[T('',{margin:[0,14,0,0]})]),
        {columns:[
          {width:'*',stack:[
            T('VOECOMKENNEDY',{font:'MontserratBold',fontSize:8.6,color:'#FFFFFF',characterSpacing:2}),
            T('CNPJ 56.913.032/0001-32',{font:'Inter',fontSize:6.8,color:K,margin:[0,4,0,0]})
          ]},
          {width:210,stack:[
            T('ATENDIMENTO',{font:'InterMedium',fontSize:6.6,color:K,characterSpacing:1.3,alignment:'right'}),
            T('WhatsApp (62) 99644-8671'+(pages>1?' · '+page+' / '+pages:''),
              {font:'Inter',fontSize:7.4,color:'#FFFFFF',alignment:'right',margin:[0,4,0,0]})
          ]}
        ],margin:[40,page===pages?39:65,40,0]}
      ]}),
      content,defaultStyle:{font:'Inter',color:N},fonts:config.fonts||undefined
    };
  }
  async function imageData(relative) {
    if(!relative||typeof fetch!=='function')return '';
    const response=await fetch(new URL('assets/airlines/'+relative,location.href));
    if(!response.ok)throw new Error('Logo indisponível');
    if(relative.toLowerCase().endsWith('.svg')){
      const svg=await response.text(),start=svg.indexOf('<svg');
      if(start<0)throw new Error('Logo SVG inválido');
      return svg.slice(start);
    }
    const blob=await response.blob();
    return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
  }
  const fontFiles=['inter-400.ttf','inter-500.ttf','inter-600.ttf','inter-700.ttf','montserrat-600.ttf','montserrat-700.ttf'];
  const fontDefinitions={
    Inter:{normal:'inter-400.ttf',bold:'inter-700.ttf',italics:'inter-400.ttf',bolditalics:'inter-700.ttf'},
    InterMedium:{normal:'inter-500.ttf',bold:'inter-700.ttf',italics:'inter-500.ttf',bolditalics:'inter-700.ttf'},
    InterSemi:{normal:'inter-600.ttf',bold:'inter-700.ttf',italics:'inter-600.ttf',bolditalics:'inter-700.ttf'},
    InterBold:{normal:'inter-700.ttf',bold:'inter-700.ttf',italics:'inter-700.ttf',bolditalics:'inter-700.ttf'},
    MontserratSemi:{normal:'montserrat-600.ttf',bold:'montserrat-700.ttf',italics:'montserrat-600.ttf',bolditalics:'montserrat-700.ttf'},
    MontserratBold:{normal:'montserrat-700.ttf',bold:'montserrat-700.ttf',italics:'montserrat-700.ttf',bolditalics:'montserrat-700.ttf'}
  };
  let fontsReady;
  async function loadFonts() {
    if(fontsReady)return fontsReady;
    fontsReady=Promise.all(fontFiles.map(async file=>{
      const response=await fetch(new URL('assets/fonts/pdf/'+file,location.href));
      if(!response.ok)throw new Error('Fonte '+file+' indisponível');
      const bytes=await response.arrayBuffer();
      const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(new Blob([bytes]));});
      return [file,base64];
    })).then(entries=>{root.pdfMake.addVirtualFileSystem(Object.fromEntries(entries));root.pdfMake.addFonts(fontDefinitions);});
    try{await fontsReady;}catch(error){fontsReady=null;throw error;}
  }
  async function download(d,config={}) {
    if(!root.pdfMake)throw new Error('O gerador de PDF não carregou. Atualize a página.');
    await loadFonts();
    const logos={};
    for(const key of ['Ida','Volta']){
      const name=key==='Ida'?d.cia:d.ciaVolta||d.cia;
      try{logos[key]=await imageData(root.ProposalPDF?.getLogo(name));}catch{/* Keep carrier text. */}
    }
    const blob=await new Promise((resolve,reject)=>{
      try{root.pdfMake.createPdf(definition(d,{...config,logos})).getBlob(resolve);}catch(error){reject(error);}
    });
    if(blob.type!=='application/pdf'||!/^%PDF/.test(await blob.slice(0,8).text()))throw new Error('O arquivo gerado não é um PDF válido.');
    const objectUrl=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=objectUrl;
    anchor.download='Proposta_VoeComKennedy_'+String(d.cliente||'Cotacao').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_')+'.pdf';
    document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
    return blob;
  }
  const api={definition,download,fontDefinitions,fontFiles};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ProposalDownload=api;
})(typeof globalThis!=='undefined'?globalThis:this);
