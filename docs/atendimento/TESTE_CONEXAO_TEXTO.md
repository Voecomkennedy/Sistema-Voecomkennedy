# Teste único de conexão de texto — roteiro, sem disparo automático

Estado preparado: receptor `atendimento-recebimento` v2 no Supabase, mas desligado (HTTP 503 sem capacidade); migração de recebimento instalada, bucket privado mantido, nenhum callback Z-API cadastrado. A UI somente leitura foi publicada pelo PR #22. A migração/edição de CRM e o planejador de follow-up do PR #21 não são necessários para este teste e continuam fora de produção.

## Pré-condições

1. Conferir `atendimento-recebidos.html`, já publicada, com a conta existente: tela vazia autenticada, sem conteúdo quando não há sessão. Não entrar com conta fictícia na produção.
2. O operador abre localmente `ATIVACAO_LOCAL.html`, gera a capacidade no próprio navegador e cadastra pessoalmente no Supabase `ATENDIMENTO_RECEBIMENTO_OWNER_ID`, `ATENDIMENTO_RECEBIMENTO_INSTANCE_ID`, `ATENDIMENTO_RECEBIMENTO_CAPABILITY`, `ATENDIMENTO_RECEBIMENTO_ARCHIVE_PDF=false` e `ATENDIMENTO_RECEBIMENTO_ENABLED=false`. Não enviar a capacidade, URL completa, token Z-API ou senha no chat. `CONNECTED_PHONE` e `MEDIA_HOSTS` não são necessários neste piloto.
3. Confirmar que a função ainda responde 503 sem capacidade. No painel Z-API da instância existente, reconferir **Ao receber** vazio, notificações próprias desligadas e filtros globais desligados. Grupos devem ser ignorados somente no receptor novo.
4. Só então, em janela acompanhada pelo operador, ligar `ATENDIMENTO_RECEBIMENTO_ENABLED=true` e cadastrar a URL completa **somente** em “Ao receber”. Registrar horário UTC de início; manter callback de status, grupos e pós-venda intactos. Não há importação de conversas antigas.

## Um envio controlado e uma resposta

O destinatário de teste foi autorizado pelo usuário e é diferente da instância; o número completo não entra neste repositório. Há uma [função de envio único preparada](../../supabase/functions/atendimento-teste-unico/README.md), porém **não publicada**, com migração adicional **não aplicada** e flag desligada. Antes de qualquer envio, revisar e habilitar essa rota restrita em etapa acompanhada, somente após validar a entrada. A função `pos-venda` não serve de atalho: o parâmetro `previa=1` envia múltiplas mensagens e pode ignorar a chave geral `ativo`; seu número de teste cadastrado é outro. Não a invocar. Não extrair token do painel nem criar acesso persistente implicitamente.

Mensagem proposta, uma vez apenas: “Teste de conexão do CRM Voecomkennedy. Kennedy, pode responder TESTE RECEBIDO para conferirmos a chegada?” Não repetir se o resultado do envio for incerto. A resposta do usuário deve chegar ao webhook como texto privado `fromMe=false`; mensagens próprias e grupos não devem aparecer na inbox.

## Evidências e interrupção

Registrar em evidência privada apenas: horário UTC de solicitação e aceite da API de envio, ID retornado pelo provedor, eventual status de entrega disponível, horário em que o usuário viu a mensagem, horário `momment` do callback, `criado_em` da linha, ID da mensagem recebida e horário em que a UI a mostrou. Comparar latências observadas sem prometer limite máximo; separar API aceita de entrega e de resposta humana. Confirmar uma única linha por `(user_id,instancia,provedor_id)` após repetição sintética, texto/telefone e proprietário corretos, e nenhuma entrada de grupo ou mensagem própria. Não registrar texto privado, número completo, URL com capacidade ou token em artefatos públicos.

Se a UI falhar, callback estiver diferente do esperado, houver duplicidade conflitante, ou envio tiver resultado incerto: **parar**, definir `ATENDIMENTO_RECEBIMENTO_ENABLED=false`, remover/restaurar “Ao receber” para o valor imediatamente anterior e preservar registros para conciliação. Não reenviar automaticamente. A documentação da Z-API não garante retry do callback; falhas podem exigir investigação sem recuperação da mensagem. Anexos são apenas marcadores pendentes, sem arquivo copiado.
