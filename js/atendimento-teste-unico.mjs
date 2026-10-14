// Controle manual isolado. Destino, texto e credenciais continuam definidos no servidor.
export async function startOneShotPage(options={}){
  const el=id=>document.getElementById(id);
  const form=el('test-form'),button=el('test-send'),confirm=el('test-confirm'),result=el('test-result');
  let started=false;
  try{
    const client=options.client||globalThis.getSupabaseClient(),auth=options.auth||globalThis.Auth;
    const storage=options.storage||globalThis.sessionStorage;
    const user=await auth.getUser();
    if(!user){el('test-gate').textContent='Entre na conta autorizada para usar este controle.';el('test-login').hidden=false;return;}
    const key='atendimento:piloto_texto_1:'+user.id;
    el('test-gate').textContent='Sessão verificada. Confira o destinatário e o texto antes de continuar.';
    form.hidden=false;
    if(storage.getItem(key)){
      started=true;confirm.disabled=true;
      result.textContent='Este controle já foi acionado nesta aba. Não repita; confira o resultado da tentativa.';
    }
    confirm.addEventListener('change',()=>{if(!started)button.disabled=!confirm.checked;});
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(started||!confirm.checked)return;
      started=true;button.disabled=true;confirm.disabled=true;
      try{
        // Bloqueio local ANTES da rede. A reserva persistente do backend também impede repetição.
        storage.setItem(key,'acionado');
      }catch{
        result.textContent='Não foi possível proteger esta aba contra repetição. Nenhum envio foi iniciado.';return;
      }
      result.textContent='Conferindo sessão e solicitando a única tentativa…';
      try{
        const current=await auth.getUser();
        if(!current||current.id!==user.id){result.textContent='A sessão mudou. Nenhum envio foi iniciado por este controle.';return;}
        // O SDK usa a sessão existente; não extraímos JWT nem enviamos destino/texto no corpo.
        const response=await client.functions.invoke('atendimento-teste-unico',{method:'POST'});
        if(response.error){
          const status=response.error.context?.status;
          let detail=null;try{detail=await response.error.context?.json();}catch{/* Resposta incerta. */}
          if(status===503&&detail?.erro==='Teste desativado ou configuração incompleta.'){
            result.textContent='Teste desligado ou configuração incompleta. Nenhum envio foi iniciado por esta chamada.';
          }else if(status===409){
            result.textContent='O teste já está reservado. Nenhuma nova tentativa foi feita por esta chamada.';
          }else if([400,401,403,405].includes(status)){
            result.textContent='Solicitação recusada ou sessão sem autorização. Nenhum envio foi iniciado por esta chamada.';
          }else{
            result.textContent='Resultado não confirmado. A mensagem pode ter sido enviada. Não repita; confira a reserva com quem acompanha o teste.';
          }
        }else if(response.data?.estado==='aceito'){
          result.textContent='A Z-API aceitou a mensagem. A entrega no WhatsApp ainda não foi confirmada. Aguarde a conferência; não repita.';
        }else{
          result.textContent='Resultado incerto. Não repita; confira a tentativa com quem acompanha o teste.';
        }
      }catch{
        result.textContent='Não foi possível confirmar a resposta. A mensagem pode ter sido enviada. Não repita; confira a tentativa.';
      }
    });
  }catch{
    button.disabled=true;confirm.disabled=true;
    el('test-gate').textContent='Não foi possível verificar a sessão ou proteger esta aba. O controle está bloqueado.';
  }
}
if(typeof globalThis.getSupabaseClient==='function')startOneShotPage();
