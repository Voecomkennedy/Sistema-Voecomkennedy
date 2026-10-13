// Planejador puro. Sem transporte, cron, fila ou parâmetros operacionais padrão.
const BRT='America/Sao_Paulo';
const parts=new Intl.DateTimeFormat('en-US',{timeZone:BRT,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const weekday={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
const stamp=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.getTime():NaN;};
const business=(at,rule)=>{const p=Object.fromEntries(parts.formatToParts(at).map(x=>[x.type,x.value]));
  const minute=Number(p.hour)*60+Number(p.minute);
  return rule.days.includes(weekday[p.weekday])&&minute>=rule.startMinute&&minute<rule.endMinute;
};
const nextBusiness=(from,rule)=>{const first=Math.ceil(from/60000)*60000;
  for(let n=0;n<8*24*60;n++){const candidate=new Date(first+n*60000);if(business(candidate,rule))return candidate.toISOString();}
  return null;
};
export function planQuoteFollowup(state,policy){
  if(!policy?.approved)return {status:'disabled',reason:'Regras e textos ainda não aprovados.'};
  if(!Array.isArray(policy.delaysMinutes)||!Number.isInteger(policy.maxAttempts)||policy.maxAttempts<1||policy.maxAttempts>5||
     policy.delaysMinutes.length<policy.maxAttempts||policy.delaysMinutes.some(x=>!Number.isInteger(x)||x<1||x>10080)||
     !Array.isArray(policy.business?.days)||!policy.business.days.length||policy.business.days.some(x=>!Number.isInteger(x)||x<0||x>6)||
     !Number.isInteger(policy.business.startMinute)||!Number.isInteger(policy.business.endMinute)||
     policy.business.startMinute<0||policy.business.endMinute>1440||policy.business.startMinute>=policy.business.endMinute){
    return {status:'disabled',reason:'Parâmetros inválidos.'};
  }
  if(state?.stage!=='aguardando'||state.optout===true||state.saleId)return {status:'cancelled',reason:'Fora da fase de espera, opt-out ou venda vinculada.'};
  const stageAt=stamp(state.stageAt),lastIncoming=stamp(state.lastIncomingAt);
  if(!Number.isFinite(stageAt))return {status:'disabled',reason:'Início da espera desconhecido.'};
  if(Number.isFinite(lastIncoming)&&lastIncoming>=stageAt)return {status:'cancelled',reason:'Cliente respondeu após entrar em aguardando.'};
  const attempts=Array.isArray(state.attempts)?state.attempts:[];
  if(attempts.some(x=>x.status==='pending'))return {status:'held',reason:'Já existe tentativa pendente.'};
  if(attempts.some(x=>x.status==='uncertain'))return {status:'held',reason:'Resultado incerto exige revisão humana.'};
  const sent=attempts.filter(x=>x.status==='sent').sort((a,b)=>stamp(a.sentAt)-stamp(b.sentAt));
  if(sent.length>=policy.maxAttempts)return {status:'cancelled',reason:'Limite de tentativas atingido.'};
  const from=sent.length?stamp(sent.at(-1).sentAt):stageAt;
  if(!Number.isFinite(from))return {status:'disabled',reason:'Tentativa anterior sem horário válido.'};
  const due=nextBusiness(from+policy.delaysMinutes[sent.length]*60000,policy.business);
  return due?{status:'candidate',attempt:sent.length+1,dueAt:due}:{status:'disabled',reason:'Não há janela comercial nos próximos oito dias.'};
}
