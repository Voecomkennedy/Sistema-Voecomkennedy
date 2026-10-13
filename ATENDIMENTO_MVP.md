# Atendimento — incremento 1, isolado e sintético

Objetivo: complementar clientes/pessoas, cotações e vendas com conversas privadas no mesmo número Z-API. A Central de Mensagens continua agenda de SIMULAÇÃO; suas travas por conversa não viram histórico. Nenhum comportamento operacional foi substituído.

## Estado e escopo

Base: `main` remota `11eaf21551759cc50254c393727be1398d551cf3`, de 09/10/2026. Checkout novo em `/Volumes/HD externo/Codex-eval-preparation/Sistema-Voecomkennedy-atendimento-mvp`, branch `codex/atendimento-mvp-sintetico`. Mac mini confirmado; APFS montado e gravável, UUID `E29E060A-6A14-4E69-AB1F-D7F26F6FB59E`. A raiz do volume não permitia criar diretórios; usamos a pasta existente gravável, sem alterar permissões. O checkout interno anterior estava limpo, na branch `codex/taxas-confirmacao-jsonb`, e foi preservado. Outras branches remotas, inclusive v2 e trabalho Claude, não foram integradas ou modificadas.

Não há AGENTS.md nem `.agents/skills` no checkout recebido. Foram lidas as instruções locais Codex, a memória pertinente e as instruções existentes da Central, cotador, storage e Backup. Dependências instaladas com lockfiles e `--ignore-scripts`; cache e instalações ficaram no externo.

Esta fatia entrega uma página funcional com duas conversas fictícias, busca em nomes/telefones/texto, filtro de não lidas e etiquetas, marcação dos IDs efetivamente vistos, rascunho por conversa, composição de texto/PDF, tentativa sintética, falha segura/retry e bloqueio de resultado incerto. Ela usa os mesmos nomes de campos comerciais e reutiliza `StorageManager.obterResumoFinanceiroVenda`; o exemplo mostra R$ 1.000 recebidos menos R$ 100 reembolsados = R$ 900 líquidos. Cliente, cotação e venda são selecionados explicitamente. Números compartilhados não escolhem cliente automaticamente; LID não vira telefone por interpretação dos dígitos. Origem desconhecida permanece “Não informada”; vínculo manual não prova causalidade ou comissão.

`CONFIG.enabled` é falso. A única entrada executável é a demonstração em loopback com `?demo=1`; em qualquer domínio operacional ela permanece fechada, mesmo com essa query. Não foi acrescentado acesso ao menu operacional. Auth não é chamado pela demo: `verifyWithExistingAuth` e o handler candidato estão testados por injeção, sem entrypoint publicável. Uma futura integração deve fornecer `serviceFor(user.id)` e ler `dados_app` por esse proprietário no servidor, jamais por cache comercial sem dono. Nenhuma resposta inclui metadados de autorização editáveis pelo usuário.

## Critérios de aceite deste incremento

| Critério | Evidência |
| --- | --- |
| Interface utilizável, desktop/celular, sem conexão operacional | Navegador local, DOM e screenshots em `docs/atendimento/evidencias/` |
| Busca, não lidas, etiquetas, vínculos e rascunho por conversa | Suíte DOM nova; nenhuma gravação de dados comerciais |
| Deduplicação de conteúdo/status e eco próprio sem reenvio | Suíte de domínio; chaves únicas reais no PostgreSQL |
| Evento fora de ordem mantém leitura/entrega; mensagem antiga ainda não vista fica não lida | Suíte de domínio |
| Telefone/LID com evidência conjunta; conflito exige revisão | Normalização e testes de domínio; identidade composta por dono/instância/tipo/valor no SQL |
| Duplo clique/concorrência não duplica tentativa; incerto nunca repete automaticamente | Domínio e reserva transacional real em PostgreSQL local |
| Autorização pelo Auth e isolamento por dono, inclusive FK e arquivos | Handler com Auth simulado e RLS real com papéis distintos em cluster descartável |
| PDF preserva bytes e checksum; restauração falha sem substituir estado se corrompido | Export/restore em memória e download/restauração nativos no navegador |
| Regressão de pessoas, cotações, vendas, financeiro, Central e cotador | Suítes existentes do repositório |

## Estrutura preparada para nuvem

A migration `supabase/migrations/20261013121547_atendimento_mvp.sql` foi criada pela CLI e aplicada **somente no cluster local descartável**. Nenhuma migration foi aplicada em produção ou no projeto Supabase existente.

Tabelas próprias: `atendimento_conversas`, `atendimento_identidades`, `atendimento_mensagens`, `atendimento_eventos`, `atendimento_anexos`, `atendimento_outbox`. RLS e privilégios mínimos: navegador lê somente linhas próprias, sem escrita/RPC; serviço escreve no servidor. Eventos são append-only; FKs compostas impedem cruzar contas/conversas/instâncias. SQL e outbox aceitam exclusivamente modo `sintetico`. O banco não altera `dados_app` nem objetos da Central.

Bucket novo `atendimento-arquivos`, privado, PDF de até 5 MB; caminho `owner/conversa/arquivo.pdf`. O candidato `media.mjs` verifica bucket privado, host HTTPS explicitamente permitido, tipo, limite, assinatura PDF, SHA-256 e confirmação do upload, sem sobrescrever arquivo existente. O downloader fica injetado: ainda deve ser implementado no servidor com limite durante streaming, redirects bloqueados e allowlist estabelecida após mapear as mídias reais. Não há fetch arbitrário, upload real ou geração de URL pública nesta fatia. A demo guarda bytes na memória, **não na nuvem**. O adapter Supabase, filas, persistência completa de eventos, cópia real e URLs assinadas continuam para homologação separada.

O adapter Z-API cobre texto e status documentados; eventos desconhecidos/edições/mídias não suportadas são ignorados neste subconjunto e precisarão de tratamento explícito antes de capturar mensagens reais. `READ_BY_ME` não é tratado como leitura pelo destinatário. `senderLid` de mensagem própria não é associado ao telefone do destinatário. Não há promessa de importar histórico anterior, recuperar mídia expirada ou desbloquear número.

## Preservação do mesmo número e dos consumidores

Nenhuma instância, token, credencial, filtro ou URL de webhook foi alterada. Nenhuma mensagem real foi enviada; nenhuma conversa pessoal foi importada.

Antes de ativar a captura, mapear o receptor atual, os eventos usados pelos grupos/agenda e suas autenticações/retries. A opção de callbacks próprios pode dar prioridade a outra URL e deixar o receptor antigo inativo. Preparar um único ingresso autenticado e filas duráveis separadas, mantendo o envelope original para o consumidor antigo. O novo consumidor filtra grupos localmente. Não ativar filtro global de grupos.

`fanout.mjs` é um candidato sem endpoint: testes provam que o antigo recebe o payload intacto, inclusive grupos, e que falha do novo é identificada para retry independente. Ele **não é uma fila durável nem comprova entrega**. Próxima fase deve implementar persistência antes de ACK, deduplicação por consumidor, mapeamento de instância→proprietário no servidor, autenticação do ingresso e reconciliação de resultados incertos. Capturar não dispara respostas ou cria follow-up automático; prevenção de loops deve continuar no domínio e no transporte.

## Backup e restauração

`backup.html` exporta somente o JSON comercial; não foi modificado para aparentar incluir mensagens ou arquivos. Backup de banco também não contém os objetos do storage. O pacote sintético novo inclui mensagens, eventos e bytes dos PDFs com SHA-256, e valida proprietário, referências, tamanho e checksum antes de substituir a memória. Esse teste não equivale a restauração real de Supabase.

Para homologação: exportar metadados completos com paginação, manifest por dono (bucket/caminho/tamanho/SHA-256) e copiar todos os objetos privados antes da expiração das URLs do provedor (30 dias). Restaurar primeiro em ambiente isolado autorizado, com conta e bucket de teste, usando o mesmo dono validado; comparar contagem e hashes, testar arquivo ausente/corrompido e isolamento de outra conta. Não reassociar proprietário por suposição. Resolver órfãos e uploads de resultado incerto antes de marcar anexo como arquivado. A migração não oferece exclusão em cascata do arquivo de eventos.

## Como verificar

```sh
npm ci --ignore-scripts --cache '/Volumes/HD externo/Codex-eval-preparation/npm-cache'
npm --prefix cotador ci --ignore-scripts --cache '/Volumes/HD externo/Codex-eval-preparation/npm-cache'
npm test
npm --prefix cotador test
deno test --no-config --no-lock --cached-only supabase/functions/tests/pos-venda-candidate/ supabase/functions/tests/central-mensagens/
deno check --no-config --no-lock supabase/functions/central-mensagens/index.ts js/atendimento-domain.mjs js/atendimento-adapters.mjs supabase/functions/_shared/atendimento/handler.mjs
deno lint --no-config js/atendimento-*.mjs supabase/functions/_shared/atendimento/
deno lint --no-config supabase/functions/_shared/central-mensagens/ supabase/functions/central-mensagens/ supabase/functions/tests/central-mensagens/
npm run test:db
npm run test:atendimento:db
python3 -m http.server 8767 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:8767/atendimento.html?demo=1`. Sem query, o módulo está fechado. Use somente PDFs sintéticos. O servidor deve permanecer em loopback. Os scripts de DB ignoram URLs operacionais e usam PostgreSQL 17 descartável, banco `vck_central_test`, Auth/Storage simulados e RLS/locks reais; removem somente seu próprio cluster ao finalizar. Não instalar serviço ou conectar a produção. Sem build próprio no package.json; os módulos JS são servidos diretamente. Deno check para `.mjs` sem `checkJs` valida módulos/sintaxe, não oferece tipagem completa de JavaScript.

Não houve merge, push, PR, deploy, contratação, OAuth, token novo ou acesso persistente. A referência `pos-venda` v9 conserva SHA-256 `24abc67772e29404e8436202db756b392c674c9beccc2dc6a7ee084d6acf3864`. Para retirar o incremento, basta não abrir a página nova; nada da operação carrega os scripts de Atendimento.

Referências consultadas: [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage privado](https://supabase.com/docs/guides/storage/security/access-control), [Z-API callbacks](https://developer.z-api.io/webhooks/on-message-received), [texto e LID](https://developer.z-api.io/webhooks/on-message-received-examples), [status](https://developer.z-api.io/webhooks/on-whatsapp-message-status-changes). Changelog Supabase conferido; alteração de TLS anunciada não exige mudança neste incremento local.
