# Histórico compacto — resultado local de 14/10/2026

Implementação e testes locais concluídos sobre `57eb93842cc4ed802c3d2b2f5aa49861f87966d9`, na branch `feat/integridade-etapa2-local`. Nenhuma publicação, push, migration operacional, restauração real, mensagem ou job foi executado. O identificador efetivo do modelo não está exposto de forma verificável neste ambiente; o pedido por Astra não foi usado como evidência de execução do modelo.

## Resultado entregue

O journal central passou de duas cópias completas por operação para baseline + registros alterados, inclusões, IDs tipados removidos, ordem e diferenças da raiz. Um checkpoint aditivo a cada 100 mudanças de conteúdo limita a reconstrução cara; operações só de versão guardam mudanças vazias. O histórico anterior permanece integral e legível, sem rewrite/DELETE/TTL. Campos desconhecidos, nulos, ausência, IDs numéricos/textuais e coleções malformadas são reconstruídos exatamente em JSONB, com substituição integral apenas quando a identidade da coleção não permite diferenças seguras.

A captura usa OLD/NEW calculados pelo servidor e a transação do próprio `dados_app`. Falha no journal aborta a escrita da fonte. RLS por dono, guards de origem da captura, grants explícitos, unicidade e cadeia SHA-256 protegem o histórico. Escritas diretas são rejeitadas inclusive por service_role. `dados_app`, CAS, formulários, negócios e IndexedDB mantêm seus contratos.

O leitor baixa metadados paginados e solicita o documento reconstruído ao selecionar operação/lado. Respostas atrasadas não substituem outra seleção/conta. O adapter do backend anterior mostra seu limite; formato desconhecido ou falha de validação não habilitam recuperação. A recuperação continua seletiva e cria revisão pelo contrato existente, preservando outras propostas. IDs distintos que colidem no seletor textual são preservados no histórico, mas a recuperação ambígua é recusada.

## Achados e correções locais desta rodada

| Severidade | Evidência e reprodução | Risco e correção mínima | Esforço relativo |
| --- | --- | --- | --- |
| Alta — confirmado no ensaio | Guard anterior devolvia `40001` para PATCH sem avanço. PostgREST 14.17 repetiu a operação até timeout; logs sintéticos em `compact-sdk-final.txt` e `evidence/vck-hc-46241/failure.txt`. Novo guard: migration compacta linha 5. | Retry contínuo de uma condição permanente. Guard agora devolve `PT409`/HTTP 409, mantendo CAS e identidade; resposta HTTP 409 e rollback confirmados com SDK real. Não é afirmação de incidente em produção. | Pequeno para a correção; validação de transporte necessária. |
| Alta — capacidade comprovada sinteticamente | Snapshot anterior duplicava a conta em toda operação, inclusive só de versão. Benchmark de 310.213 bytes e 100 updates por massa. Tabelas compactas nas linhas 30/36; captura linha 149. | Crescimento elevado. Baseline + diferenças por registro, checkpoint linha 176; nenhum descarte ou perda de versões. Quota infinita não foi prometida. | Médio, inclui representação/reconstrução e testes. |
| Alta — proteção validada | Seleção rápida de revisão/conta com resposta retida em navegador real; `js/integrity-history.js:58`. | Prévia de uma revisão antiga poderia ocupar outra seleção. Tokens de seleção + dono/geração invalidam respostas; CAS de recuperação permanece. | Pequeno/médio. |
| Média — legado preservado | IDs tipados, reordenação, null/ausência, raiz escalar e coleções sem identidade única; oracle de 127 revisões. Leitor `js/integrity-history.js:7`. | Normalização poderia perder dados ou recuperar registro errado. Representação JSONB exata e bloqueio explícito de recuperação ambígua. | Médio. |

Problemas de preparação foram separados dos achados do produto: serialização de escalares no driver de teste; encaminhamento automático da VM; propriedade de auth.uid() durante migrations de GoTrue; ACL ampla herdada da fixture; limpeza de cliente SDK com accessToken. Foram corrigidos no harness. O guard `40001` foi a incompatibilidade real descoberta e corrigida no candidato SQL compacto; o arquivo candidato anterior permanece intacto.

## Validação fechada

| Camada | Resultado | Evidência em audit-vck/stage2 |
| --- | --- | --- |
| SQL compacto, PostgreSQL temporário | 18/18; 127 revisões anteriores/posteriores comparadas com oracle completo | `compact-db-final.txt` |
| Interface nativa, Chrome 155.0.8059.40 / Playwright 1.55.1 | 41/41; zero pedidos de produção | `compact-browser-second.txt` |
| Sistema principal | 188/188 | `compact-root-tests.txt` |
| Cotador | 50/50 | `compact-cotador-tests.txt` |
| Esquema anterior isolado | 12/12 | `compact-legacy-db-regression.txt` |
| Auth/PostgREST/SDK reais isolados | 10/10; 46 requests locais; zero de produção | `compact-sdk-final-confirmed.txt` |
| Capacidade | Quatro cenários; 400 updates sintéticos | `compact-capacity-results.json` / `compact-capacity.log` |

Ensaios cobrem CAS concorrente, inclusão/remoção/reordenação, perda de ack, troca de conta/aba, prévia sem escrita, recuperação seletiva, três propostas 4+3+3 independentes, Novo/Limpar/Editar/PDF/conversão, permanência após recarga, clientes que omitem ID de operação, versão sem avanço, reutilização de operação, falha de captura, adulteração da cadeia, imutabilidade, anon, dois donos e service_role. O teste real usa PostgreSQL 17.11, GoTrue 2.196.0, PostgREST 14.17 e SDK 2.117.3 fixado, com imagens oficiais por digest.

A stack é exclusiva em `/Volumes/HD externo/Codex-eval-preparation/it2`, perfil `hc`, com rede Docker interna, sem portas de containers publicadas, túneis temporários em 127.0.0.1 e credenciais/identidades sintéticas. Não usa OAuth externo, SMTP, transportes de mensagens nem funções operacionais. Containers, volume, rede, túneis e env files de cada execução são removidos; somente evidências redigidas e o runtime exclusivo desligado são preservados. Perfis e checkouts existentes não são reconfigurados.

## Capacidade medida

Média de bytes físicos adicionais de histórico por update, incluindo índices/TOAST e o checkpoint na centésima mudança. O baseline inicial é custo separado: 57.344 bytes na massa repetitiva e 401.408 na massa aleatória. Não inclui a tabela legada preservada, cujo tamanho não muda.

| Massa / operação | Snapshots anteriores B/update | Compacto B/update | Redução medida |
| --- | ---: | ---: | ---: |
| repetitive / version_only | 17,203.20 | 409.60 | 97.62% |
| repetitive / content_change | 17,203.20 | 983.04 | 94.29% |
| random_base64 / version_only | 654,704.64 | 409.60 | 99.94% |
| random_base64 / content_change | 654,704.64 | 3,850.24 | 99.41% |

Antes do checkpoint, mudar uma cotação custou aproximadamente 579 B/update. Reconstruir a revisão após 100 updates variou de 3–4 ms (só de versão) a 95–129 ms (conteúdo), no ensaio local específico. Isso não é SLA. Metadados só de versão ainda influenciam o tempo de leitura.

A fonte `dados_app` continua sendo um documento completo. No ensaio curto sem VACUUM/reuso, sua relação cresceu aproximadamente 8,4 KB/update repetitivo e 327 KB/update aleatório por regravações/TOAST; o WAL foi medido separadamente. O journal compacto não corrige esse crescimento temporário da fonte. Não se inferiu plano/quota/ocupação atual do Supabase nem suficiência para retenção ilimitada. A medição usa dados sintéticos, não payload operacional.

## Reprodução e liberação posterior

- `npm run test:integrity:compact:db`: cria e apaga seu PostgreSQL temporário em loopback.
- `npm run test:integrity:browser`: perfil descartável + APIs sintéticas locais e bloqueio de tráfego externo.
- `node scripts/benchmark-integrity-compact.cjs /tmp/vck-compact-sizing.json`: quatro clusters sintéticos, sem aceitar URL de banco.
- `npm run test:integrity:compact:sdk`: requer somente a VM hc exclusiva já preparada, com imagens fixadas. Não inicializa, reconfigura ou usa outros perfis e não aceita endpoint/credenciais de Supabase.

A nova migration exige aplicação transacional junto do candidato anterior em uma instalação nova. Publicação/migration reais continuam fora da autorização desta tarefa. A próxima etapa é revisar o diff e aprovar separadamente esquema, cópia preservada/pendências, rollback e publicação. Nenhum prazo fechado foi estimado. Rollback deve preservar os dois formatos e as tabelas; não apagar histórico, cache ou autoridade IndexedDB.

Promoções, check-in, Conversas manual e automações não receberam mudanças de negócio. Esta rodada não testa produção, toda configuração operacional, provedor OAuth, envio/entrega de PDF/WhatsApp, exclusão de contas com histórico ou todos os navegadores. Follow-ups comerciais e reforma visual continuam etapas futuras próprias. Não existe bloqueio local pendente após os ensaios concluídos.

Referências de configuração do ensaio: [Auth oficial 2.196.0](https://github.com/supabase/auth/blob/v2.196.0/README.md), [containers oficiais Supabase](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml), [rede interna e gateway Docker](https://docs.docker.com/engine/network/port-publishing/#gateway-modes). São referências técnicas; as confirmações acima vêm dos logs e assertions locais.
