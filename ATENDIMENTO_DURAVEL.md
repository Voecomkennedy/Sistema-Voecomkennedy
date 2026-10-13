# Atendimento — incremento 2: persistência e filas sintéticas

Continua na branch `codex/atendimento-mvp-sintetico`, depois do incremento funcional da página em `ATENDIMENTO_MVP.md`. Esta fatia nasceu sem entrypoint operacional. O incremento seguinte acrescentou um entrypoint **exclusivamente local, desativado por padrão**, descrito em `ATENDIMENTO_HTTP_LOCAL.md`. Todos os eventos, contatos, PDFs e transportes usados nos testes são fictícios. As migrações SQL foram instaladas de forma inerte no projeto principal em 13/10/2026 após ensaio isolado. Não houve deploy de código, webhook, envio WhatsApp, importação de conversa pessoal ou alteração na Central de Mensagens, clientes, cotações, vendas ou pós-venda.

## Entrega e limites

- `20261013164252_atendimento_duravel.sql` acrescenta inbox transacional, fan-out por consumidor, data de disponibilidade/tentativa da outbox e metadados de arquivo/evento. Foi ensaiada em clusters PostgreSQL 17 descartáveis e instalada de forma inerte no projeto principal em 13/10/2026. As duas filas novas usam RLS de leitura por proprietário; somente `service_role` escreve. A reserva da outbox é atômica, limitada a três tentativas e não reabre automaticamente um resultado incerto.
- `repository.mjs` usa tabelas reais com transações, travas e idempotência por proprietário/instância. O ingresso é commitado antes do consumo; a mesma chave com outro payload gera conflito. Status fora de ordem são preservados, aliases telefone/LID conflitantes exigem revisão, mensagens antigas ainda não lidas continuam não lidas. O retorno de uma mensagem própria não cria outra saída. Os vínculos comerciais lêem `dados_app` somente do proprietário autenticado; nenhuma atualização do JSON comercial é feita.
- `durable-fanout.mjs` conserva o envelope inteiro na fila do consumidor legado, inclusive grupos. Filtra grupos somente ao inserir na fila nova. Um ACK seguro ou falha de um consumidor não altera a fila do outro. Falha incerta permanece parada para reconciliação manual, inclusive após reinício. O código não está conectado ao receptor atual; ativá-lo exige antes mapear o callback e suas confirmações.
- `local-object-store.mjs` é exclusivo dos testes no HD externo. `archive` reserva metadados antes de copiar os bytes do PDF, confirma checksum e só então libera a composição. Falha de I/O mantém o anexo pendente para retry da **mesma** chave. `backup.mjs` exporta tabelas e bytes, valida dono/referências/hash antes de restaurar em outro banco vazio do mesmo dono. Jobs pendentes/ativos são restaurados como incertos, impedindo reenvio acidental. Não há cópia de Storage Supabase real nesta fatia.
- `durable-handler.mjs` aceita `Request`/`Response` e segue sem publicação remota. O servidor novo só roda explicitamente em loopback com banco descartável. `verifyUser` e repositório são injetados; o teste usa uma identidade fictícia. Origem, método, allowlist de campos, autenticação e dono são exigidos antes de operações. `zapi-disabled.mjs` normaliza eventos de teste e recusa qualquer `send` real. Nenhum token, OAuth ou credencial foi criado.

A interface original segue como demo em memória. Um modo separado da página agora lê e grava no PostgreSQL descartável por HTTP local. Ele **não está ligado** ao Auth real, a Supabase Storage/Edge nem à Z-API. A leitura de `dados_app` é somente para contexto comercial: venda/recebido não são atribuídos por telefone ou por origem presumida. Não há chatbot, comissão ou automação financeira.

## Critérios verificados

| Critério | Evidência |
| --- | --- |
| Persistir ingresso antes do processamento e deduplicar sob concorrência | 16 testes PostgreSQL locais, incluindo colisão da mesma chave com outro conteúdo |
| Não repetir envio incerto depois de queda real | Worker terminado após reserva, PostgreSQL encerrado/iniciado, novo worker verifica outbox incerta e zero reenvios daquele item |
| Tentar novamente somente falha comprovadamente sem envio | Backoff e limite de três tentativas testados; token antigo não conclui tentativa nova |
| Arquivar PDF e restaurar mensagens com bytes | Testes de falha/retry de arquivo, checksum, exportação e restauração em segundo banco descartável |
| Isolar conta, conversa, arquivo e operações HTTP | RLS/privileges/FKs reais e Request autenticada por injeção; todas as 12 ações rejeitam dono forjado e sessão ausente |
| Preservar legado e grupo | Fan-out sintético com filas independentes; payload do grupo permanece intacto para legado |
| Preservar operação atual | Suítes comerciais, cotador, Central e pós-venda passaram; SHA do pós-venda v9 inalterado |

## Prova local de reinício

`npm run test:atendimento:db` cria dois bancos e diretório de objetos novos sob uma pasta aleatória do HD externo. Executa a suíte, inicia outro processo Node para gravar conversa, PDF, duas saídas e uma entrada pendente, depois um segundo processo reserva uma saída e termina deliberadamente sem confirmação. O runner encerra e reinicia **aquele cluster descartável**. Um terceiro processo confirma horário novo de início do PostgreSQL, reaproveita as linhas e bytes, marca a saída sem confirmação como incerta, envia apenas a outra saída por mock e restaura os dados em outro banco vazio. O runner remove apenas o cluster que criou. Resultado de 13/10/2026: `pgRestarted`, `workerRestarted`, `committedInboxSurvived`, `uncertainNotResent` e `attachmentRestoredWithBytes` verdadeiros; uma chamada sintética antes da queda e outra para o item diferente depois dela.

Isso demonstra durabilidade local de PostgreSQL e filesystem. Não comprova entrega WhatsApp nem persistência de Supabase Storage ou autenticação real.

## Homologação e ativação futura

O projeto Supabase dedicado `voecomkennedy-v2-staging` (`lvmkyfycxylhdhqlpuyu`) foi identificado por leitura. Estava `INACTIVE`; uma consulta SQL somente leitura falhou com timeout de conexão. A API não informou motivo nem data da inatividade; o diagnóstico e a capacidade Free constam em `ATENDIMENTO_HTTP_LOCAL.md`. Não foi reativado nem provisionado, e não havia credencial de teste local configurada. Não se usou o projeto de produção ou o projeto operacional de agendamentos como substituto. Por isso, migração/HTTP/Auth/Storage reais, restauro de bucket privado e entrega Z-API em homologação **não foram executados**.

Antes de qualquer ativação, confirmar com o responsável uma homologação existente e acessível, mapear o receptor atual, ACKs e callbacks próprios da instância compartilhada. Preparar ingresso autenticado com rota única, mapeamento de instância→proprietário somente no servidor, publicação de cada consumidor sem perda do legado, persistência de mídia privada durante download com limites de streaming, reconciliação de resultados incertos e ensaio de backup/restauração do bucket. Não ativar filtro global de grupos nem callback de mensagens próprias sem comprovar preservação do receptor antigo. Não importar histórico anterior da Z-API, que não o armazena; URLs de mídia expiram e exigem cópia real antes do prazo. Uma liberação futura para homologação não implica autorização para produção.

## Verificação

```sh
npm test
npm --prefix cotador test
deno test --no-config --no-lock --cached-only supabase/functions/tests/pos-venda-candidate/ supabase/functions/tests/central-mensagens/
deno lint --no-config js/atendimento-*.mjs supabase/functions/_shared/atendimento/
deno check --no-config --no-lock supabase/functions/central-mensagens/index.ts supabase/functions/_shared/atendimento/repository.mjs supabase/functions/_shared/atendimento/backup.mjs supabase/functions/_shared/atendimento/durable-handler.mjs supabase/functions/_shared/atendimento/durable-fanout.mjs
npm run test:db
npm run test:atendimento:db
```

Resultados completos em `docs/atendimento/VALIDACAO_DURAVEL.md`. A captura desktop sintética do primeiro incremento foi arquivada na Library com `library_file_id` `libfile_c3fec6d497388191abd08d1f42f99eac`; isso não contém conversa pessoal nem URL privada.
