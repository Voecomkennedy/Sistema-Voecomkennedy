# Integridade: etapa 2 local

Base: PR 27 publicado, commit `3bf6c1d7cf6a8dcfecaddcaba85a3f318f9a2ff9`. Este pacote é local e não foi publicado nem aplicado ao banco operacional.

## Contrato integrado

`js/integrity-store.js` torna IndexedDB a autoridade das quatro coleções, separadas pelo proprietário. Uma transação grava estado, revisão e histórico anterior/posterior juntos. `StorageManager.gravar()` relê o estado dentro da transação; os mutadores síncronos só operam no contexto temporário dessa gravação. Fora dele, escritas diretas são recusadas quando o protocolo foi inicializado. Suspender ou trocar de conta não volta ao caminho legado.

Pessoas, vendas, pacotes, cotações, revisão financeira, cadastro rápido, proposta incorporada e importação passam por esse contrato. Editores conservam o registro-base e recusam alteração se outra aba mudou aquele registro. IDs iguais em coleções distintas não confundem o resultado retornado. Inclusões independentes não regravam um array capturado antes do bloqueio.

Conversão grava a venda e o vínculo da cotação na mesma transação local. Preserva a identidade `cotacao-<id>`, origem e valores da primeira conversão. Erro em qualquer gravação aborta ambas. PDF aguarda a gravação da cópia capturada; Novo/Limpar/Editar não redirecionam a revisão salva. Cadastro de contato concluído depois de Novo conserva a pessoa, sem selecionar esse contato no formulário novo.

LocalStorage é projeção compatível para os leitores antigos. Não é autoridade nem uma transação de quatro chaves. Se a projeção falhar, o estado e o histórico já confirmados em IndexedDB permanecem; uma mistura composta exclusivamente pelos estados anterior/posterior conhecidos pode ser reconstruída na recarga. Conteúdo divergente escrito por uma aba antiga é preservado e bloqueia edição, inclusive quando sua preservação falha. Não há fusão automática de cache desconhecido. Não apagar dados do navegador.

O detector conserva `storage.newValue`, inclusive quando outra escrita já substituiu o cache ou existe um marcador de projeção. Confere a cópia capturada contra estado/histórico duráveis, sem comparar um cache relido depois de `refresh()`. Antes de projetar, o gravador confere os bytes presentes e preserva/bloqueia uma escrita desconhecida; falha de quota mantém o original. Projeções antigas já existentes no histórico são reconhecidas sem substituir a autoridade mais recente. A consulta ao histórico é feita por cursor apenas quando a linha da conta não explica o evento/cache.

Envios são serializados entre abas pelo Web Locks. A tentativa completa e sua identidade são persistidas antes da rede; ficam disponíveis após recarga. Confirmação antiga não confirma edição nova. A recarga reconhece somente versão/conteúdo exatos de uma tentativa preservada. CAS do servidor e decisões de conflito do PR 27 continuam valendo. Uma segunda aba com o mesmo conteúdo já confirmado não gera outro upload. Erro de agendamento não rejeita uma mutação local que já foi commitada.

## Histórico e recuperação

`integridade.html`, acessível pela tela Backup, lista revisões locais e páginas de versões da nuvem. A prévia lê uma cotação e compara com o registro atual. A confirmação cria nova revisão da mesma identidade, preservando outras propostas, contatos e vendas. Uma alteração posterior à prévia invalida a operação. Recuperação de cotação removida conserva o ID original.

A lista inclui os estados anterior e posterior de cada revisão local. Assim, uma cotação legada removida pela primeira transação permanece selecionável no snapshot anterior. Restaurar venda arquivada usa `StorageManager.gravar()`, com bloqueio de cliques simultâneos e apresentação de erros de quota/conflito. O bridge de proposta também separa o commit confirmado da tentativa posterior de agendar o envio; falha no agendamento mantém a pendência e permite gerar o PDF da revisão salva.

O fluxo recusa cotação convertida, venda de origem existente, reatribuição de contato e contato histórico ausente. Legado sem identidade de contato ou recuperação conjunta de venda/cotação exige revisão específica. Não há restore integral de projeto, recuperação automática das propostas historicamente relatadas ou comprovação de envio ao cliente.

## Banco: proposta exata, ainda não autorizada para produção

Candidatos locais: `supabase/migrations/20261014170118_integridade_historico.sql` estabelece a coluna, os guards de versão e a representação anterior; `supabase/migrations/20261014201423_integridade_historico_compacto.sql` instala a captura compacta e os leitores. Em uma instalação nova ambos fazem parte da mesma aplicação transacional, ainda sujeita a aprovação própria. Não aplicar somente o primeiro candidato como solução final.

A captura compacta conserva integralmente `dados_app_historico`. Um baseline guarda o documento completo; operações seguintes guardam registros alterados, IDs tipados removidos, ordem e diferenças dos campos da raiz. Coleções sem IDs únicos e documentos fora do formato esperado usam substituição exata. Um checkpoint aditivo a cada 100 operações de conteúdo limita a reconstrução. Uma escrita que altera somente a versão produz mudança vazia e não duplica o documento nem cria checkpoint.

O esquema `integridade_privado` não é exposto pela API. Baselines e operações têm leitura por dono/RLS, grants mínimos e guards que recusam INSERT direto inclusive por `service_role`; UPDATE/DELETE/TRUNCATE também são recusados. Funções invoker calculam diferenças de OLD/NEW no servidor. Captura e estado pertencem à mesma transação: falha de qualquer parte do journal aborta a escrita da conta. Unicidade de operação/versão e avanço continuam obrigatórios. O erro permanente de versão que não avança passa de `40001` para `PT409`/HTTP 409 no candidato compacto, evitando retry contínuo observado no ensaio real de PostgREST 14.17; a regra CAS e a identidade não mudam. A cadeia SHA-256 e versões são conferidas na reconstrução.

O leitor lista metadados paginados via `integridade_listar_versoes` e obtém um documento completo via `integridade_obter_estado` somente quando uma revisão é selecionada. Respostas atrasadas são invalidadas por seleção e proprietário/geração. O backend anterior permanece legível com aviso explícito de que só os snapshots antigos estão disponíveis. Formato desconhecido ou falha na cadeia não habilitam recuperação. IndexedDB, formulários, CAS e `dados_app` mantêm os contratos atuais. Ver [contrato e critérios](INTEGRIDADE_HISTORICO_COMPACTO.md).

O FK referencia `auth.users` sem cascata: remover uma conta com histórico exige tratamento explícito de retenção. DELETE físico de `dados_app` não é interceptado. Não existe purge, TTL, rewrite ou compressão destrutiva. As versões anteriores à instalação só surgem quando capturadas pelo primeiro UPDATE ou por outra cópia preservada. Compactação reduz crescimento do histórico, sem prometer armazenamento ilimitado em quota fixa.

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
npm run test:integrity:compact:db
node scripts/benchmark-integrity-compact.cjs /tmp/vck-compact-sizing.json
```

O runner de navegador usa contexto/perfil temporário e mocks de API em 127.0.0.1; não usa perfil real, autenticação real ou endpoints operacionais. O runner de banco cria e encerra um PostgreSQL 17 temporário com papéis/identidades sintéticos. RLS e rollback são exercitados no PostgreSQL, não apenas em mocks. O teste `scripts/test-integrity-compact-sdk.cjs` acrescenta Auth GoTrue, PostgREST, JWT/RLS e SDK reais em containers exclusivos do perfil `hc`, na raiz autorizada `/Volumes/HD externo/Codex-eval-preparation/it2`. Usa rede interna sem saída, imagens oficiais já obtidas, duas identidades sintéticas e credenciais efêmeras. Os serviços são acessados por túneis SSH temporários em 127.0.0.1 pela conexão já existente da VM exclusiva, sem publicação de portas de containers, leitura de chaves ou edição do SSH do Mac. Encerra seus túneis/containers/rede/volume e apaga seus env files. Não usa projeto Supabase real, SMTP, provedores OAuth, jobs ou credenciais existentes. A VM deve ser iniciada e encerrada explicitamente apenas em seu COLIMA_HOME isolado; o runner nunca troca contexto ou aciona perfis existentes.

Os quatro bloqueadores da revisão de `270dfcd9` são reproduzíveis com `node scripts/test-integrity-browser.cjs --baseline --case=<trecho do nome>`. Essa opção lê somente os fontes pertinentes daquele commit com `git show`, sem trocar o estado do checkout. A corrida usa uma transação IndexedDB nativa para controlar a fila; `refresh()` e as APIs de transação não são substituídos. Ensaios atuais cobrem preservação antes da projeção, quota, bytes do evento, seleção do primeiro snapshot anterior, restauração de venda/CAS e PDF com falha de agendamento.

Playwright foi fixado em 1.55.1, primeira versão corrigida para GHSA-7mvr-c777-76hp. É dependência de desenvolvimento. Instalação com scripts desativados, sem download/reinstalação de navegadores. Npm audit após a correção encontrou zero vulnerabilidades.

O caso nativo de cotações inicialmente usava o formulário antes de TimingUI.ready e juros sem serviço de taxas na fixture. Foi ajustada apenas a preparação: aguardar fusos e selecionar a opção válida sem juros. Não foi removida nem relaxada a validação do aplicativo. Logs de diagnóstico e execução final ficam fora do Git na pasta de evidências da tarefa.

## Limites e critérios de liberação

- IndexedDB e Web Locks são pré-requisitos; ausência/falha bloqueia a inicialização. Confirmação local não garante proteção contra perda física do aparelho/armazenamento; a confirmação central continua necessária.
- O documento da conta continua sendo a unidade de CAS entre aparelhos. Há histórico e conflito explícito; não há merge automático por registro entre dispositivos.
- Cópias de cache legado divergente podem exigir revisão manual. A interface recupera cotações do histórico, não todas as chaves antigas nem todos os tipos de registro.
- A calibração cobre 400 atualizações sintéticas de documentos de 310.213 bytes, não uma previsão de ocupação operacional de longo prazo. Não houve restore integral, teste autenticado em produção ou validação em todos os navegadores. Não há política de descarte automático de histórico.
- As referências de scripts compartilhados mudam nas páginas principais; promoções, cálculos financeiros, check-in operacional, transportes de envio e Conversas manual não recebem mudança de regra de negócio.

**Cotações só devem voltar ao uso após** revisão independente do diff, regressões fechadas, aprovação específica do esquema/rollback e da publicação, cópia atual preservada, instalação compatível validada sem usar produção como teste, deploy confirmado e comparação dos arquivos públicos com o commit aprovado. Recarregar todas as abas antigas e resolver pendências/cópias divergentes. Validar o ensaio de três propostas 4+3+3, Novo/Limpar/Editar/PDF/conversão, recarga e recuperação seletiva no ambiente isolado. Esta rodada local não libera uso em produção.

Próxima etapa visual: organizar menu/blocos, tipografia limpa e paleta oficial azul, com revisão de placeholders/exemplos nominais fixos. Foi confirmado placeholder de sobrenome em `cotacoes.html:278`; é atributo de exemplo, não valor cadastrado. Substituir exemplos por instruções neutras e preservar todos os valores reais. Nenhuma reforma visual ou avaliação/implantação n8n faz parte deste pacote.
