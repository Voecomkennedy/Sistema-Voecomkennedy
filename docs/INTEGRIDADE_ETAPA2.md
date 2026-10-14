# Integridade: etapa 2 local

Base: PR 27 publicado, commit `3bf6c1d7cf6a8dcfecaddcaba85a3f318f9a2ff9`. Este pacote é local e não foi publicado nem aplicado ao banco operacional.

## Contrato integrado

`js/integrity-store.js` torna IndexedDB a autoridade das quatro coleções, separadas pelo proprietário. Uma transação grava estado, revisão e histórico anterior/posterior juntos. `StorageManager.gravar()` relê o estado dentro da transação; os mutadores síncronos só operam no contexto temporário dessa gravação. Fora dele, escritas diretas são recusadas quando o protocolo foi inicializado. Suspender ou trocar de conta não volta ao caminho legado.

Pessoas, vendas, pacotes, cotações, revisão financeira, cadastro rápido, proposta incorporada e importação passam por esse contrato. Editores conservam o registro-base e recusam alteração se outra aba mudou aquele registro. IDs iguais em coleções distintas não confundem o resultado retornado. Inclusões independentes não regravam um array capturado antes do bloqueio.

Conversão grava a venda e o vínculo da cotação na mesma transação local. Preserva a identidade `cotacao-<id>`, origem e valores da primeira conversão. Erro em qualquer gravação aborta ambas. PDF aguarda a gravação da cópia capturada; Novo/Limpar/Editar não redirecionam a revisão salva. Cadastro de contato concluído depois de Novo conserva a pessoa, sem selecionar esse contato no formulário novo.

LocalStorage é projeção compatível para os leitores antigos. Não é autoridade nem uma transação de quatro chaves. Se a projeção falhar, o estado e o histórico já confirmados em IndexedDB permanecem; uma mistura composta exclusivamente pelos estados anterior/posterior conhecidos pode ser reconstruída na recarga. Conteúdo divergente escrito por uma aba antiga é preservado e bloqueia edição, inclusive quando sua preservação falha. Não há fusão automática de cache desconhecido. Não apagar dados do navegador.

Envios são serializados entre abas pelo Web Locks. A tentativa completa e sua identidade são persistidas antes da rede; ficam disponíveis após recarga. Confirmação antiga não confirma edição nova. A recarga reconhece somente versão/conteúdo exatos de uma tentativa preservada. CAS do servidor e decisões de conflito do PR 27 continuam valendo. Uma segunda aba com o mesmo conteúdo já confirmado não gera outro upload. Erro de agendamento não rejeita uma mutação local que já foi commitada.

## Histórico e recuperação

`integridade.html`, acessível pela tela Backup, lista revisões locais e páginas de versões da nuvem. A prévia lê uma cotação e compara com o registro atual. A confirmação cria nova revisão da mesma identidade, preservando outras propostas, contatos e vendas. Uma alteração posterior à prévia invalida a operação. Recuperação de cotação removida conserva o ID original.

O fluxo recusa cotação convertida, venda de origem existente, reatribuição de contato e contato histórico ausente. Legado sem identidade de contato ou recuperação conjunta de venda/cotação exige revisão específica. Não há restore integral de projeto, recuperação automática das propostas historicamente relatadas ou comprovação de envio ao cliente.

## Banco: proposta exata, ainda não autorizada para produção

Arquivo candidato: `supabase/migrations/20261014170118_integridade_historico.sql`, gerado pelo CLI com estado local separado. Ele foi ensaiado apenas no PostgreSQL temporário.

1. Adiciona `public.dados_app.ultima_operacao_id uuid`, sem atualizar conteúdos existentes.
2. Cria `public.dados_app_historico`, com proprietário, ID de operação, versões anterior/posterior, JSONB anterior/posterior e momento. Unicidade por proprietário/operação e proprietário/versão posterior.
3. Habilita RLS na tabela nova. Leitura autenticada é restrita ao dono; inserção precisa corresponder ao estado real de `dados_app`. Não concede UPDATE/DELETE/TRUNCATE do histórico aos clientes. `anon` não recebe acesso. `service_role` recebe SELECT/INSERT para manter compatibilidade com escritores de versão de serviço; não é exposto ao cliente.
4. Instala dois triggers invoker: um identifica a operação e exige avanço da versão; o outro registra o histórico atomicamente com INSERT/UPDATE. Captura também o cliente anterior que avança versão e os jobs de versão. Falha no histórico desfaz a alteração do estado.
5. Revoga EXECUTE público das funções de trigger. Não troca políticas existentes de `dados_app`, configuração, credenciais, cron ou funções de envio. DELETE físico não é interceptado.

O FK do histórico referencia `auth.users` sem cascata: remover uma conta com histórico pode exigir tratamento explícito de retenção. Não existe purge automático. Histórico usa snapshots completos e cresce com as alterações; retenção/capacidade e o procedimento de exclusão física precisam ser revisados antes da autorização real. As versões anteriores à instalação só surgem quando capturadas pelo primeiro UPDATE ou por outra cópia previamente preservada.

O frontend novo consulta a coluna adicionada e a tabela de histórico. Publicá-lo sem o esquema compatível pode bloquear inicialização. A migração precisa de aprovação própria, aplicada de forma transacional, após preservar e validar uma cópia atual e pendências locais. Não usar o banco operacional como bancada de testes.

## Rollback proposto

Preferir reversão de código, mantendo coluna, histórico e triggers aditivos. O cliente anterior que avança versão continua gravando e sendo capturado, conforme ensaio isolado. Antes de voltar ao cliente anterior, preservar a autoridade IndexedDB, pendências/tentativas e projeção completa. Não apagar cache, IDB, histórico ou regravar `dados_app` com um snapshot antigo.

Se os triggers precisarem ser desativados para recuperar gravações, o rollback de captura é exclusivamente:

```sql
BEGIN;
DROP TRIGGER IF EXISTS integridade_historico ON public.dados_app;
DROP TRIGGER IF EXISTS integridade_identificar ON public.dados_app;
REVOKE INSERT ON public.dados_app_historico FROM authenticated, service_role;
COMMIT;
```

Isso conserva conteúdos, versões, coluna e histórico existente com leitura por RLS. Suspende a captura de novas versões. Não executar DROP TABLE, DROP COLUMN, TRUNCATE, DELETE ou restore. Esse rollback de captura é uma proposta para revisão; não foi executado em produção. Reativação exige revisão dos triggers/políticas e validação isolada antes de aplicar.

## Testes e reprodução

```sh
node --test --test-concurrency=1 tests/*.test.cjs
cd cotador
node --test --test-concurrency=2 tests/*.test.cjs
```

Na raiz:

```sh
npm run test:integrity:browser
npm run test:integrity:db
```

O runner de navegador usa contexto/perfil temporário e mocks de API em 127.0.0.1; não usa perfil real, autenticação real ou endpoints operacionais. O runner de banco cria e encerra um PostgreSQL 17 temporário com papéis/identidades sintéticos. RLS e rollback são exercitados no PostgreSQL, não apenas em mocks. Não equivalem a teste de OAuth/PostgREST real em um projeto Supabase.

Playwright foi fixado em 1.55.1, primeira versão corrigida para GHSA-7mvr-c777-76hp. É dependência de desenvolvimento. Instalação com scripts desativados, sem download/reinstalação de navegadores. Npm audit após a correção encontrou zero vulnerabilidades.

O caso nativo de cotações inicialmente usava o formulário antes de TimingUI.ready e juros sem serviço de taxas na fixture. Foi ajustada apenas a preparação: aguardar fusos e selecionar a opção válida sem juros. Não foi removida nem relaxada a validação do aplicativo. Logs de diagnóstico e execução final ficam fora do Git na pasta de evidências da tarefa.

## Limites e critérios de liberação

- IndexedDB e Web Locks são pré-requisitos; ausência/falha bloqueia a inicialização. Confirmação local não garante proteção contra perda física do aparelho/armazenamento; a confirmação central continua necessária.
- O documento da conta continua sendo a unidade de CAS entre aparelhos. Há histórico e conflito explícito; não há merge automático por registro entre dispositivos.
- Cópias de cache legado divergente podem exigir revisão manual. A interface recupera cotações do histórico, não todas as chaves antigas nem todos os tipos de registro.
- Não houve benchmark prolongado de crescimento/retenção, restore integral, teste autenticado em produção ou validação em todos os navegadores. Não há política de descarte automático de histórico.
- As referências de scripts compartilhados mudam nas páginas principais; promoções, cálculos financeiros, check-in operacional, transportes de envio e Conversas manual não recebem mudança de regra de negócio.

**Cotações só devem voltar ao uso após** revisão independente do diff, regressões fechadas, aprovação específica do esquema/rollback e da publicação, cópia atual preservada, instalação compatível validada sem usar produção como teste, deploy confirmado e comparação dos arquivos públicos com o commit aprovado. Recarregar todas as abas antigas e resolver pendências/cópias divergentes. Validar o ensaio de três propostas 4+3+3, Novo/Limpar/Editar/PDF/conversão, recarga e recuperação seletiva no ambiente isolado. Esta rodada local não libera uso em produção.

Próxima etapa visual: organizar menu/blocos, tipografia limpa e paleta oficial azul, com revisão de placeholders/exemplos nominais fixos. Foi confirmado placeholder de sobrenome em `cotacoes.html:278`; é atributo de exemplo, não valor cadastrado. Substituir exemplos por instruções neutras e preservar todos os valores reais. Nenhuma reforma visual ou avaliação/implantação n8n faz parte deste pacote.
