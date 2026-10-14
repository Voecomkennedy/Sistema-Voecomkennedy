# Controle manual do envio único

Página isolada: `atendimento-teste-unico.html`. Reutiliza `supabase-config.js`, `auth.js` e a sessão do sistema. Não modifica recebidos, clientes, cotações, vendas ou o PR 21.

O frontend mostra o destinatário autorizado somente pelo final e o texto aprovado; não contém número completo, credenciais Z-API ou capacidade de webhook. O SDK chama somente `atendimento-teste-unico`, com POST sem corpo, após confirmação manual. JWT, dono, destino fixo, texto fixo e reserva persistente continuam verificados no backend já publicado.

O botão bloqueia antes da rede e permanece bloqueado após qualquer resultado. `sessionStorage` mantém o bloqueio em recargas da mesma aba; outra aba não contorna a reserva única do servidor. Não há retry, polling, envio no carregamento, rotina recorrente ou uso de DevTools. O aceite da API é apresentado separadamente da entrega. Resultado incerto exige conciliação antes de qualquer outra ação.

## Operação acompanhada

1. Manter `ATENDIMENTO_TESTE_ENABLED=false` enquanto prepara e confere a página. Um clique nessa condição deve retornar 503 de teste desativado, sem reserva nem envio, e bloquear aquela aba.
2. Para a tentativa já autorizada, conferir a reserva ainda vazia e o destino configurado. No painel normal de Edge Function Secrets do Supabase, alterar apenas `ATENDIMENTO_TESTE_ENABLED` para `true`; não editar credenciais nem callback.
3. Abrir uma aba nova da página na sessão proprietária, conferir destinatário/texto, marcar a confirmação e clicar uma única vez. Não usar a aba bloqueada pela verificação inicial.
4. Após a tentativa, usar o mesmo formulário normal para salvar `ATENDIMENTO_TESTE_ENABLED=false`. Conferir reserva/resultado no banco e o estado desligado. Não liberar ou apagar a reserva, inclusive em timeout.

Validação local: 132/132 testes da main atual passaram, incluindo seis testes específicos desta interface. A página usa o endpoint protegido existente, não precisa de acesso completo ao Chrome DevTools.
