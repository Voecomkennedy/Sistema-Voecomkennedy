# Publicação controlada da Central em simulação

Destino autorizado: **somente `qryobmqrkzddcvlvgfrp`**, sistema `https://sistema.voecomkennedy.tur.br/`. Não criar projetos, usar outros projetos, alterar integrações ou executar envios reais. Não aplicar as migrations antigas em lote. Permissões adicionais, credenciais e operações destrutivas exigem consulta ao responsável.

## Conferência prévia em 04/10/2026

- GitHub Pages publica a raiz de `main`; versão anterior: `e70492541a09fc05eaf166f6579e901c07fdb78a`.
- PR #17 está separado da produção. Assets referenciados existem, versões do cache são coerentes e não há service worker a invalidar.
- PostgreSQL remoto 17.6. `dados_app` possui as colunas e a chave primária esperadas, RLS por proprietário e nenhuma trigger de linha. As tabelas, funções e o schema da Central ainda não existem.
- `pos-venda` continua v9. O cron existente e sua configuração foram inventariados por metadados/hashes sem expor comandos ou segredos. Não são parte desta implantação.
- Foi preservado snapshot privado da fonte operacional fora do repositório, com diretório 0700 e arquivo 0600. Não colocar dados de clientes, backups ou credenciais no Git. Antes da execução efetiva, conferir se o snapshot ainda representa a versão atual e preservar uma nova cópia caso tenha mudado.
- A restauração desse snapshot foi comprovada em PostgreSQL 17 local descartável: depois de COMMIT e nova conexão, conteúdo JSONB, versão e timestamp permaneceram equivalentes. O cluster de teste foi encerrado e removido; nenhuma restauração foi feita no ambiente operacional.
- Advisors têm avisos preexistentes: funções de manutenção de RLS expostas, proteção de senhas vazadas desativada e tabelas legadas sem políticas. Os catálogos também mostram permissões amplas herdadas nas tabelas legadas. Esta entrega não muda essas permissões antigas nem testa operações destrutivas nelas.

## Permissões concretas a aprovar

O servidor já lê `dados_app`, mas não tem `UPDATE`. O PostgreSQL exige atualização em pelo menos uma coluna para obter o bloqueio `SELECT FOR UPDATE`. A concessão foi reduzida a:

```sql
GRANT UPDATE (versao) ON public.dados_app TO service_role;
```

Isso permite tecnicamente atualizar o número de versão, mas não o conteúdo. As funções da Central usam apenas o bloqueio e não atualizam a fonte. As políticas atuais dos usuários e os privilégios anteriores do servidor são preservados.

As quatro tabelas novas recebem regras próprias:

| Objeto novo | Usuário autenticado | Servidor |
| --- | --- | --- |
| `mensagens_preferencias` | SELECT dos registros próprios | SELECT, INSERT, UPDATE |
| `mensagens_tarefas` | SELECT dos registros próprios | SELECT, INSERT, UPDATE |
| `mensagens_historico` | SELECT dos registros próprios | SELECT, INSERT; sem UPDATE, DELETE ou TRUNCATE |
| `mensagens_privado.conversas` | Sem acesso | SELECT, INSERT, DELETE |

Sem acesso anônimo. RPCs de escrita somente para o servidor. RLS habilitada nas quatro tabelas; nenhuma política ou permissão global existente será substituída. A migration limpa privilégios herdados somente nos objetos que ela cria. A aplicação dessas regras aguarda a autorização específica solicitada pelo responsável.

O acesso atual da CLI respondeu 403 ao listar configurações da função. O painel web pediu login. Nenhum token foi criado ou permissão administrativa ampliada; a ativação dos dois valores não sigilosos abaixo requer uma sessão administrativa existente ou configuração manual pelo responsável.

## Sequência após a liberação dos pré-requisitos

1. Reconfirmar projeto, versão publicada, ausência de colisões de objetos, baseline e snapshot. Se o estado divergir, revisar antes de agir.
2. Aplicar somente `20261004213417_central_mensagens.sql`, em transação. Não executar `db push` em lote: a migration antiga de sincronização removeria políticas existentes.
3. Conferir privilégios, RLS, advisors, existência das funções e preservação da fonte, configuração e cron. Não inserir fixtures na fonte operacional nem executar a função `pos-venda`.
4. Publicar somente `central-mensagens`, `verify_jwt=true`, incluindo seus sete arquivos e o domínio compartilhado `js/messages-domain.mjs`. A função inicia fechada sem o gate.
5. Pelo acesso administrativo existente, configurar apenas valores não sigilosos: `CENTRAL_MENSAGENS_HABILITADA=simulacao` e `CENTRAL_MENSAGENS_ORIGENS=https://sistema.voecomkennedy.tur.br`. Não ler, substituir ou rotacionar chaves existentes. Se esse acesso não estiver disponível, consultar o responsável; não criar token para contornar a falta de permissão.
6. Validar autenticação, CORS e leitura pelo usuário existente sem modificar vendas/clientes. Testes positivos de gravação ficam restritos às tabelas da Central e ao modo de simulação. Nenhuma chamada à Z-API.
7. Publicar o painel por merge do PR e conferir o build/SHA do GitHub Pages, assets, login e banner de simulação. Não limpar cookies ou armazenamento local; aguardar sincronização e preservar formulários abertos antes de atualizar abas operacionais.
8. Registrar a evidência final e as diferenças legítimas de dados ocorridas durante a janela. Hashes diferentes por uso normal não autorizam restaurar um backup sobre dados novos.

## Reversão sem apagar dados

- Fechar apenas o gate da função nova: `CENTRAL_MENSAGENS_HABILITADA=desabilitada`. Confirmar indisponibilidade da Central sem chamar a função antiga.
- Republicar o frontend do commit anterior por commit de reversão revisado ou artefato anterior. Não usar force-push/reset remoto.
- Preservar tabelas e histórico da Central. Não fazer DROP, TRUNCATE, apagar clientes, rodar migration inversa ou restaurar banco por cima dos dados atuais.
- Não revogar automaticamente o novo privilégio de versão: isso também é uma alteração de acesso e deve ser aprovada. A reversão funcional não depende da revogação.
- Uma eventual restauração de dados exige comparar o snapshot com alterações posteriores e uma autorização separada. Backup não substitui sincronização de rascunhos ainda presentes somente no navegador.

Referências: [bloqueio de linhas no PostgreSQL 17](https://www.postgresql.org/docs/17/sql-select.html), [RLS no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [autenticação de Edge Functions](https://supabase.com/docs/guides/functions/auth-headers).
