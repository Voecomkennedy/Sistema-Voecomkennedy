# Validação da integração HTTP local — 13/10/2026

No checkout do HD externo, com dados sintéticos e cluster PostgreSQL 17 criado/removido pelo runner:

| Verificação | Resultado |
| --- | --- |
| `npm run test:atendimento:db` | 17/17 passaram; um novo teste de HTTP/UI persistente e os 16 de banco anteriores |
| Prova separada de queda/reinício | Worker e PostgreSQL reiniciados; inbox/PDF sobreviveram; saída incerta não foi repetida; backup restaurado no segundo banco |
| `npm test` | 123/123 passaram, incluindo UI anterior e regressão comercial |
| Deno lint | 16 módulos Atendimento/entrypoint local passaram |
| Deno check | Passou para os módulos JS tocados; sem `checkJs` não equivale a typecheck completo |
| Node `--check`, diff e hash pós-venda | Passaram; hash v9 `24abc67772e29404e8436202db756b392c674c9beccc2dc6a7ee084d6acf3864` |
| Navegador local | Dois contatos fictícios, PDF, resultado incerto, bloqueio de retry e recarga com mensagem preservada |
| Encerramento direto Ctrl-C | Porta fechada e diretório `atendimento-db-*` removido; nenhuma instância PostgreSQL do runner permaneceu |

As suítes de cotador (50/50), Deno Central/pós-venda (75/75) e banco da Central (16/16) passaram na fatia imediatamente anterior e não foram repetidas porque esses arquivos não mudaram. Consideradas juntas, são **281 testes**, sem falhas finais. Duas execuções intermediárias do teste HTTP falharam por um seletor errado no teste e por reusar um socket fechado do Node após reiniciar o servidor; ambas foram corrigidas e a suíte final passou. Uma execução da demo via `npm ... --serve` deixou um cluster temporário ativo ao interromper o processo pai; ele foi identificado, parado e removido, e o runner direto passou no teste de limpeza.

Supabase staging permaneceu `INACTIVE`; o motivo exato não foi exposto e a consulta SQL somente leitura expirou. Nenhuma migração remota, serviço pago, credencial nova, webhook ou mensagem real foi usado. Consulte `ATENDIMENTO_HTTP_LOCAL.md` para IDs, capacidade Free e roteiro de homologação.
