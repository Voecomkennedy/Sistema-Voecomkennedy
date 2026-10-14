# Histórico central compacto: contrato aprovado

Escopo aprovado em 14/10/2026: journal central e leitor remoto. `dados_app`, CAS por conta/versão, formulários, transporte, regras de negócio e IndexedDB permanecem no contrato atual. Nenhuma aplicação real de esquema/publicação faz parte desta branch.

## Representação e preservação

- O histórico completo anterior permanece intacto e legível, sem renomear, transformar ou apagar suas linhas.
- Um baseline guarda o documento completo na primeira captura compacta. Cada operação seguinte guarda metadados e somente registros alterados/adicionados, IDs tipados removidos, mudanças de ordem e campos adicionais da raiz. Conteúdo idêntico produz mudança vazia, sem duplicar payload.
- Um checkpoint aditivo a cada 100 operações com conteúdo alterado limita o replay caro. Atualização só de versão não cria checkpoint nem recalcula o hash de um corpo inalterado durante a reconstrução.
- Reconstrução deve preservar igualdade JSONB: ordem dos arrays, tipos de IDs, nulos versus ausência, campos desconhecidos, inclusões e exclusões. Coleção legada sem identidade única e documento fora do formato esperado usam substituição exata de coleção/documento, sem normalizar ou perder dados.
- Baseline/operações e atualização do estado pertencem à mesma transação. Falha no journal aborta o INSERT/UPDATE. Unicidade por proprietário/operação e proprietário/versão e avanço de versão continuam obrigatórios.
- A captura é calculada pelo servidor com OLD/NEW. Escrita direta no journal deve ser rejeitada inclusive para service_role; funções de captura continuam invoker, com grants mínimos, RLS por dono e proteção da origem da escrita. Não aceitar diferença fabricada pelo cliente.
- Operações guardam hash SHA-256 do documento anterior/posterior, calculado pelo servidor. Reconstrução verifica cadeia, versão e hash, além de testes de igualdade com snapshots completos independentes.

## Leitura e recuperação

O leitor remoto lista somente metadados paginados e busca um estado completo por operação/lado ao selecionar a revisão. Leitura por operação/lado conserva imagens anteriores do legado sem confundir estados distintos associados a uma versão numérica. Um adapter mantém o histórico anterior legível; falha de versão/schema é explícita. IDs tipados são preservados no documento reconstruído. A interface recusa recuperação seletiva quando IDs distintos colidem após a conversão textual exigida pelo contrato anterior de cotação, ou quando a cotação atual tem outro tipo de identidade. Isso não altera nem normaliza o histórico.

A prévia continua sem escrita. A recuperação seletiva recebe um snapshot completo validado e usa a transação, CAS e proteções atuais de identidade/contato/venda. Reconstrução completa para comparação não autoriza restaurar uma conta real.

## Critérios de aceitação

1. Comparar todas as reconstruções com oracle de snapshots completos sintéticos, incluindo legado, primeiro estado anterior, reordenação, campos adicionais, nulos, IDs numéricos/textuais e coleções malformadas.
2. CAS concorrente, erro injetado em cada parte do journal, duplicidade/idempotência, cadeia incompleta/adulterada e nenhuma revisão parcial.
3. Dois proprietários, anon, authenticated, service_role, proibição de escrita direta/alteração/apagamento e funções privadas não expostas.
4. Leitor nativo, troca rápida de revisão/conta, prévia sem escrita, recuperação seletiva, interface com backend anterior e erro de versão nova não suportada.
5. Medir baseline, atualizações só de versão e mudança de um registro com as mesmas massas de 310.213 bytes; relações/índices/TOAST e WAL separados.
6. Auth/PostgREST/SDK reais apenas na stack exclusiva aprovada, com identidades e credenciais sintéticas locais, sem endpoints ou jobs operacionais. Permissão adicional impede somente essa etapa até ser resolvida.

Não há purge/TTL, mensalidade nova, compactação de IndexedDB nem mudança de plataforma neste escopo. Rollback mantém as tabelas e dados; o leitor precisa conservar acesso a formatos antigo/compacto. Sem teste de transportes, inclusive `pos-venda?previa=1`, que envia mensagens.

## Limites operacionais

Checkpoints limitam a 100 operações com alteração de conteúdo a parte cara da reconstrução. O número de metadados de operações apenas de versão ainda influencia o tempo de leitura. Todas as versões são preservadas; esta rodada não estabelece quota suficiente para retenção infinita, política de exclusão de contas ou previsão de crescimento real. O benchmark separa histórico, documento principal, índices/TOAST e WAL; expansão temporária da relação do documento principal não foi corrigida neste escopo.

As imagens de teste são fixadas por digest. Auth GoTrue usa logins por senha sintéticos e JWTs reais, sem SMTP ou OAuth externo. Containers ficam em rede interna exclusiva; túneis SSH temporários em 127.0.0.1 usam a conexão/identidade já gerada para a VM `hc`, sem publicar portas de containers, ler chaves ou editar SSH do Mac. Os túneis e a massa de teste são encerrados após a execução.

## Erro de negócio e retry de transação

O ensaio real com PostgREST 14.17 confirmou repetições contínuas e timeout quando o guard anterior usa SQLSTATE `40001` para uma versão que não avança. Esse código representa falha de serialização e pode provocar retry automático. O candidato compacto mantém integralmente a regra CAS/identidade, mas classifica esta rejeição como `PT409`/HTTP 409. Falhas reais de serialização continuam sendo responsabilidade do PostgreSQL/transportes; não são fabricadas para uma condição de negócio permanente. O candidato anterior fica preservado, e a substituição do guard ocorre junto do esquema compacto, somente no ambiente de ensaio nesta rodada.
