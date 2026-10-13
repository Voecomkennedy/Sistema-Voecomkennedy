# Follow-up de cotação — proposta para revisão, sem envios

O piloto atual recebe textos e permite organizar cada conversa como **novo**, **cotação**, **aguardando cliente**, **sem resposta**, **emissão** ou **encerrado**. O operador pode registrar etiquetas, origem informada, notas, cliente/cotação/venda escolhidos nos dados reais da conta, próxima ação manual e opção **não contatar automaticamente**. Contagens e não lidas ajudam a revisar a fila. Nenhuma fase agenda ou envia WhatsApp automaticamente nesta versão.

O planejador puro `js/atendimento-followup-planner.mjs` fica desligado sem uma política `approved=true`; não há chamada a ele por cron, Edge Function, navegador ou outbox operacional. Ele serve para ensaiar regras com dados fictícios. Para ativar follow-up algum dia, discutir e aprovar **em conjunto** estes parâmetros e textos, depois criar uma fila durável e uma reserva atômica com revisão da integração existente:

| Decisão | Proposta para revisar — ainda não aprovada |
|---|---|
| Entrada | Só cotação colocada manualmente em **aguardando cliente**, com contato e cotação confirmados; nunca pós-venda ou check-in. |
| Primeiro retorno | Candidato após 2 horas, ajustado à próxima janela comercial. Exemplo do usuário, não prazo final. |
| Segundo retorno | Candidato no dia útil seguinte, após conferir ausência de resposta. Exemplo do usuário, não prazo final. |
| Janela e fuso | Segunda a sexta, 09h–18h em `America/Sao_Paulo`; decidir feriados e exceções locais. |
| Limite | No máximo 2 tentativas por entrada em aguardando e sem duplicata pendente. |
| Cancelamento | Resposta recebida após o início de aguardando, saída da etapa, venda vinculada/emissão, encerramento, opt-out ou limite atingido. Resultado de envio incerto bloqueia novas tentativas até revisão. |
| Mensagem 1 | “Olá, [nome]. Conseguiu olhar a cotação que enviei? Se precisar de ajustes, me avise por aqui.” |
| Mensagem 2 | “Oi, [nome]. Ainda deseja seguir com a cotação? Posso revisar as opções se precisar.” |
| Segurança | Sem preço, dados de voo, anexos, IA ou cobrança no texto automático. Definir nome e telefone de destino com evidência; evitar contato de teste ou sem consentimento. |

A Central de Mensagens existente mantém sua agenda em **simulação**, sem cron de envio. O `pos-venda` operacional já usa agendamento periódico e registra envios próprios de check-in e viagem. O `atendimento_outbox` existente é da demonstração/fluxo sintético e não deve ser acionado como atalho. Antes de criar um executor real de follow-up, revisar os jobs atuais, escolher um único caminho de agendamento, impedir duplicidade por `(proprietário, conversa, etapa_em, tentativa)`, reservar antes de enviar, registrar resultado incerto e confirmar que retorno de texto cancela candidatos pendentes. Esse trabalho e os textos acima exigem aprovação específica; **nenhum disparo foi ativado**.
