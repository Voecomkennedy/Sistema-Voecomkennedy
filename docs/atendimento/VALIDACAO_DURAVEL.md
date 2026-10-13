# Validação do incremento 2 — 13/10/2026

Execução local no Mac mini e no checkout do HD externo, somente com dados sintéticos.

| Verificação final | Resultado |
| --- | --- |
| `npm test` — painel, clientes, cotações, vendas | 123/123 passaram |
| `npm --prefix cotador test` | 50/50 passaram |
| Deno — Central e candidato pós-venda | 75/75 passaram, cache local |
| `npm run test:db` — Central existente | 16/16 passaram em PostgreSQL descartável |
| `npm run test:atendimento:db` — esquema e fluxo durável | 16/16 passaram em PostgreSQL descartável |
| Prova de queda/reinício fora do contador de testes | Worker encerrado no limite de envio sintético; PostgreSQL realmente reiniciado; inbox, mensagens e PDF persistiram; outbox incerta não foi repetida; backup restaurado em segundo banco |
| Deno lint — scripts Atendimento | 13 arquivos passaram |
| Deno check — Central e módulos Atendimento | 10 arquivos passaram; sem `checkJs`, não equivale a tipagem completa dos `.mjs` |
| Node `--check` e `git diff --check` | Passaram |
| SHA-256 do pós-venda v9 | `24abc67772e29404e8436202db756b392c674c9beccc2dc6a7ee084d6acf3864`, idêntico à base |

Total das suítes finais: **280 testes passaram, zero falhas**. O primeiro lint desta fatia apontou dez `async` sem `await`; o contrato assíncrono foi mantido e a checagem final passou. Uma invocação de `deno check` usou por engano `--cached-only`, que esta subcomando não aceita; foi repetida com a sintaxe válida e passou. Um comando de hash apontou caminho inexistente; foi corrigido para `supabase/functions/pos-venda/index.ts` e confirmou o hash original.

Não executados: integração com Auth/HTTP/Storage reais do Supabase, migração em homologação/produção, entrega ou recebimento reais Z-API, cópia de objetos no bucket privado, navegador ligado ao repositório persistente e deploy. A homologação dedicada constava `INACTIVE` e a consulta somente leitura terminou em timeout; não foi reativada. O handler usa objetos `Request`/`Response` reais, mas identidade injetada, sem servidor HTTP operacional. O storage de teste é filesystem local, não Supabase. Não há build/typecheck JavaScript completo no repositório.

O pacote de backup é local e limitado a 10 mil registros por tabela e 50 MB, com destino vazio do **mesmo dono**; não é rotina pronta para produção. Arquivos pendentes ou ausentes abortam exportação. Uma falha após gravar objeto e antes do commit de restauração pode deixar bytes órfãos no destino de teste, sem publicá-los como arquivo arquivado; a política de limpeza/reconciliação precisa ser especificada antes da nuvem. Filas restauradas que poderiam enviar novamente ficam em `incerto` para revisão manual.

Resumo da prova foi guardado em `logs/duravel.txt` sem payloads ou credenciais. Captura do desktop sintético do incremento 1 na Library: `libfile_c3fec6d497388191abd08d1f42f99eac`.
