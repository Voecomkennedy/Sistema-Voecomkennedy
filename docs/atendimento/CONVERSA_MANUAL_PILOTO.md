# Piloto mínimo de conversa manual

Preparado na branch codex/atendimento-conversa-manual, sobre main 0b493f0. A etapa de etiquetas foi pausada antes de qualquer alteração/publicação. Não inclui a gestão ampla do PR 21.

## Aceite e alcance

Kennedy seleciona uma conversa já recebida, escreve o texto, confere nome e telefone e confirma cada clique. Servidor valida a sessão proprietária, a instância existente e a identidade de telefone da conversa. Nenhum destino livre ou grupo, envio automático, lote, IA, anexo, histórico importado ou alteração comercial.

Página nova atendimento-conversas.html; atendimento-recebidos.html e seus componentes permanecem idênticos à main. A nova tela lê os recebidos existentes e as saídas persistidas, em ordem cronológica, a cada cinco segundos enquanto visível. Conserva rascunho e seleção; erro de atualização mantém as últimas mensagens e avisa que estão desatualizadas. Sessão encerrada oculta a área e impede rede. Textos usam textContent, sem HTML executável.

## Persistência e estados

Migration aditiva 20261014130000_atendimento_envio_manual.sql: apenas tabela atendimento_recepcao_saidas e RPC de reserva. Depende de atendimento_recepcao_conversas/identidades já publicadas; não altera essas tabelas, dados_app, clientes, cotações, vendas, recepção, callbacks ou grupos. Nova tabela vinculada por proprietário, instância e conversa, com leitura RLS do proprietário; authenticated não pode inserir, alterar, apagar ou executar a reserva. Apenas o servidor reserva e atualiza; service_role não pode apagar reservas.

Chave única proprietário + requisicao_id reservada ANTES da Z-API. Repetição de mesma chave e conteúdo devolve a linha atual e nunca repete rede; mudança de contato/texto com a chave é rejeitada. Duplo clique é bloqueado na interface. Índice parcial no banco admite somente uma reserva/incerto por conversa, inclusive com outra chave em outra aba. Marker da sessão é gravado antes da rede; recarga da mesma aba mantém bloqueio. Reserva/incerto retornados pelo banco bloqueiam a conversa até conciliação manual, inclusive em outra aba. Não há retry automático ou executor de fila.

Estados: reservado (aguardando confirmação, não repetir), aceito (API confirmou ID, entrega não confirmada) e incerto (erro/timeout/ID ausente, não repetir). Falha para gravar resultado mantém reserva. Falha comprovada antes da reserva preserva texto e mostra recusa. A sincronização pode consultar o estado; nunca despacha mensagens.

## Procedimento de publicação e liberação

1. Aplicar somente a migration nova ao projeto existente. Fazer backup/esquema antes conforme procedimento atual; nenhum arquivo de mídia é criado nesta etapa.
2. Publicar somente atendimento-envio-manual com verify_jwt true e os dois arquivos do pacote (index.ts e manual-send.mjs), mantendo ATENDIMENTO_ENVIO_MANUAL_ENABLED ausente/false. O número da agência para bloquear autoenvio fica em ATENDIMENTO_ENVIO_MANUAL_CONNECTED_PHONE (alternativa: configuração já existente da recepção), sem modificar o receptor. Usa as credenciais Z-API existentes somente no servidor; não cria ou rota tokens.
3. Mesclar/publicar apenas este PR da tela nova e seus arquivos aditivos. Não mesclar PR 21. Conferir login, leitura e estado desligado.
4. Com aprovação explícita do alcance, salvar apenas ATENDIMENTO_ENVIO_MANUAL_ENABLED=true para permitir a Kennedy enviar manualmente textos aos contatos privados já recebidos na sua própria conta. Este passo amplia o envio além do teste pessoal final 7399; precisa de confirmação específica. Nenhum teste a cliente será feito pelo agente.
5. Kennedy abre atendimento-conversas.html, escolhe contato, escreve, confere número, marca a confirmação e envia. Teste controlado inicial deve ser feito pelo próprio Kennedy. Para interromper novos envios, voltar somente a flag manual para false; leitura permanece disponível e reservas não são apagadas.

Se flag ou número conectado estiverem ausentes/incoerentes, o endpoint falha fechado; não basta ligar uma flag. Todos os objetos precisam existir e o pacote precisa estar publicado. O endpoint de teste único já consumido é preservado e continua desligado.

## WhatsApp externo

As respostas escritas neste painel ficam no banco sem depender de callback fromMe. Respostas escritas pelo WhatsApp externo continuam fora do histórico: a recepção atual ignora fromMe. Capturá-las exigiria callback/encaminhamento adicional na mesma instância, que pode interferir no receptor antigo e nos grupos. Essa configuração não faz parte desta etapa. Não importa nem recupera histórico anterior. Não altera estado de entrega no WhatsApp sem evidência do provedor.

## Validação

- npm test: 144/144 passaram (132 da main + 12 novos).
- PostgreSQL descartável no HD externo, loopback e dados sintéticos: migration, reserva idempotente, conflito de conteúdo, vínculo do proprietário, RLS, grants e dados_app intacto passaram; cluster encerrado.
- Browser local com conta/contato/provedor falsos: número visível, envio manual, texto recebido e enviado na mesma timeline e resposta nova sem reload. Uma chamada ao provedor falso, zero Z-API real.
- Deno lint com exclusão apenas da regra no-import-prefix, consistente com o import npm já usado nas funções Supabase; node --check e git diff --check aprovados.
- Sem instalação de dependências; reutilizadas as existentes no HD externo.
- Na preparação não houve publicação, habilitação ou teste a cliente. A liberação posterior está registrada abaixo; o primeiro envio real desta tela será acionado por Kennedy.

## QA reproduzível

node --test tests/atendimento-manual.test.cjs tests/atendimento-conversas-ui.test.cjs
node scripts/test-atendimento-manual-db.cjs
node scripts/atendimento-manual-local.cjs

Runner local escuta apenas 127.0.0.1, não lê credenciais nem chama rede externa, e traz aviso QA LOCAL. Dados não representam clientes reais. A migração do teste reproduz somente o contrato das tabelas de recepção já existentes; somente a migration nova é objeto de teste. Nenhum cluster/sistema existente é alterado.

## Liberação autorizada em 14/10/2026

Kennedy autorizou diretamente a atualização aditiva, a função, o PR 24 e os textos enviados manualmente por ele aos contatos privados já recebidos na sua conta. Migration aplicada com sucesso; tabela nova vazia, RLS ativo, authenticated apenas SELECT e service_role sem DELETE. Esquema prévio das tabelas parentais registrado em /Volumes/HD externo/Codex-eval-preparation/backups/atendimento-manual-schema-20261014.json (não é backup completo de banco/arquivos).

PR 24 mesclado: 9b79457c63a18172ddbd9e9df5bf1c5c826b983d. GitHub Pages built nesse commit. Função atendimento-envio-manual publicada com verify_jwt true; conteúdo relido idêntico ao pacote local. Primeiro false foi salvo, depois foi registrada a configuração exclusiva ATENDIMENTO_ENVIO_MANUAL_CONNECTED_PHONE com o número de agência já informado por Kennedy, sem mudar a chave do receptor. Ajuste de resolução dessa chave no index.ts salvo em 82a163d e publicado na função. Por fim ATENDIMENTO_ENVIO_MANUAL_ENABLED=true foi salvo com confirmação de conclusão no formulário normal. Credenciais, callbacks, filtros de grupos, receptor e teste único não foram alterados.

Tela autenticada https://sistema.voecomkennedy.tur.br/atendimento-conversas.html conferida: três conversas, composição visível, atualização de mensagens e nenhum erro. Botão desativado até preencher o texto e confirmar o destinatário, como previsto. Zero saídas registradas nessa liberação; nenhum teste a cliente ou mensagem real enviado pelo agente. Primeiro envio e validação de entrega da tela serão feitos manualmente por Kennedy. Aceite da API continua separado da confirmação de entrega.
