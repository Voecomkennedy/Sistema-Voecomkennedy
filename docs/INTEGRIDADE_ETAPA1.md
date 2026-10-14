# Integridade de salvamento: etapa 1

Este pacote corrige o reconhecimento de envios e a identidade de propostas/conversões. Uma resposta antiga não confirma uma edição nova. Gerar PDF salva a cotação antes do download e usa a cópia daquela revisão. Repetir uma conversão interrompida conclui o vínculo com a venda já gravada.

## Comportamento

- O sincronizador conserva o controle de versão e o escopo da conta em `dados_app`. A comparação de confirmação usa conteúdo canônico completo, para não confundir a ordem de propriedades retornada pelo JSONB com mudança de dados. Metadados antigos continuam aceitos.
- Uma edição feita durante um envio fica pendente até seu conteúdo ser confirmado. Falha de rede mantém erro visível, permite tentativa explícita/reconexão e faz até três retentativas automáticas com espera crescente.
- Uma resposta perdida após commit pode ser reconhecida ao consultar a versão atual, sem duplicar registros ou oferecer substituição desnecessária. A sessão conserva capturas incertas para reconhecer uma revisão antiga confirmada, mesmo quando outra edição local já existe; a edição nova continua pendente e só segue com CAS. Conteúdo ou versão remota diferente exige conflito explícito, sem merge automático. Falha ao guardar metadados da confirmação não anuncia sucesso.
- Um conflito guarda captura enviada, estado local recente e nuvem em `emissao_cloud_sync_conflitos_v1`, conservando o ponteiro anterior e conflitos já registrados. Falha de preservação bloqueia aplicação de outra versão. As cópias seguem o isolamento e a preservação da conta no logout. Cópias de outra conta deixadas por uma versão antiga também são preservadas separadamente, mesmo quando o marcador do cache operacional já corresponde à conta atual.
- O diálogo oferece Revisar depois, Usar dados da nuvem e Substituir nuvem por estes dados. Revisar depois e Escape mantêm ambos os lados; reconexão não escolhe uma versão. Edição posterior à apresentação do conflito invalida a escolha destrutiva e exige revisão novamente. Suspensão/troca de conta invalida a operação em trânsito.
- Quando o conflito ocorre na sincronização inicial, Revisar depois/Escape **não libera a aplicação**: o painel de segurança permanece e a retomada acontece por Recarregar e nova decisão. Não há revisão dentro da aplicação nessa fase. Se o conflito aparece após a aplicação já ter aberto, o indicador permite Revisar conflito e as edições locais ficam pendentes. O bloqueio inicial é mantido.
- A proposta tem ID e revisão visíveis. Novo/Limpar abre outra identidade. Editar conserva o ID. Um editor cujo registro já mudou não o substitui silenciosamente. O contador de revisão ainda não armazena versões anteriores.
- No cotador incorporado, a gravação precede o PDF. O download conserva a cópia salva mesmo que o formulário mude; outras alterações podem ser salvas enquanto o arquivo é gerado. Cliques adicionais de PDF enquanto há download são ignorados com aviso. No cotador avulso, o comportamento de histórico continua próprio.
- A conversão grava `cotacaoOrigemId` na venda e usa `cotacao-<id da cotação>` como identidade estável. Falha na gravação do vínculo deixa um erro explícito e permite retomar com a venda existente. A retomada conserva os valores da primeira gravação e informa isso ao usuário. O formulário concluído não cria outra venda ao repetir Salvar; uma nova abertura inicia outra operação.
- Cotações legadas que têm apenas `nomeCliente` podem ser vinculadas ao contato cadastrado **explicitamente selecionado** em Vendas. O vínculo é concluído junto da conversão, sem procurar ou mesclar contatos pelo nome e sem mudar o nome histórico da cotação. Uma cotação que já tem `clienteId` continua rejeitando cliente divergente. Depois de uma conversão parcial, a escolha de outro cliente também é rejeitada; a retomada deve conservar o cliente da venda já criada.

As demais páginas recebem apenas versões novas nas referências aos scripts compartilhados. Fórmulas financeiras, promoções, check-in, motor de envios, configuração e Conversas manual não foram alterados. Não há migração de banco neste pacote.

## Preservação antes da alteração

O preparo realizou um SELECT restrito a `public.dados_app`, salvou uma fotografia privada fora do checkout e verificou o arquivo novamente antes de finalizar o pacote. A evidência detalhada e o arquivo ficam apenas no ambiente local autorizado.

- [x] Cópia atual preservada antes da primeira alteração de persistência.
- [x] SHA-256 e releitura conferidos.
- [x] Desserialização e round-trip JSON em ambiente isolado.
- [x] Estrutura das quatro coleções, unicidade de IDs e vínculos inventariados.
- [x] Arquivo privado `0600` dentro de diretório `0700`, fora do Git.
- [x] Cópias anteriores mantidas; sem restauração ou coleta de cache real do navegador.
- [x] Snapshot, nomes, telefones, valores reais, credenciais e segredos excluídos do diff/PR.

Essa verificação comprova legibilidade da fotografia selecionada. Ela não é um teste de restore integral do projeto nem garante que a fotografia inclua edições que existam somente em outro aparelho. Antes de uma futura liberação, preservar novamente o estado e eventuais pendências locais dentro da autorização adequada.

## Testes de regressão

Executar na raiz e depois no cotador, com Node 22 ou superior e as dependências de teste instaladas:

```sh
npm test
cd cotador
npm test
```

Os testes usam dados sintéticos e rede bloqueada/stubs. A suíte não chama jobs, endpoints de envio ou `previa=1`. Os helpers novos simulam CAS, resposta perdida, quota, timers e estados de edição; a parte DOM usa HTML/iframe reais em ambiente isolado.

| Arquivo | Casos |
|---|---|
| `tests/cloud-persistence.test.cjs` | Edição durante ack e conflito; três decisões e Escape; preservação insuficiente; quota de metadados; leitura inválida; reconexão/retentativas limitadas; resposta incerta com/sem edição posterior; rejeição de reconciliação quando remoto diverge; suspensão e troca de conta |
| `tests/cloud-scope.test.cjs` | Regressão de conta, legado, recuperação, logout e respostas tardias |
| `tests/proposal-save-pdf.test.cjs` | Três propostas do mesmo cliente; Novo/Limpar/Editar durante PDF; outra revisão durante download; mudança de contato; falha de gravação/PDF; clique repetido; editor desatualizado; recarga |
| `tests/conversion-retry.test.cjs` | Primeiro/segundo salvamento falhando; vínculo retomado após recarga; valores preservados; repetição; três propostas independentes; legado sem clienteId, escolha explícita e cliente divergente |
| Suítes existentes do painel/cotador | Contatos, conversão, pagamentos/taxas, fusos, bebês, PDF, check-in, mensagens e Conversas manual |

## Riscos residuais

1. A unidade de gravação na nuvem continua sendo o documento da conta. A escolha explícita de uma versão continua substituindo o documento inteiro; não há merge por registro neste pacote.
2. Leitura/modificação/gravação de arrays entre abas não é transacional. O bloqueio do editor de proposta reduz um caso de versão antiga, mas não resolve todas as disputas entre pessoas/vendas/abas. Esse controle pertence ao pacote 2.
3. Cópias de conflitos permanecem no navegador. Não há histórico durável no servidor ou retenção central. Elas consomem quota; se a preservação falhar, a substituição é bloqueada. O contador de revisão de proposta não é backup de versões anteriores.
4. Conversão é retomável, mas ainda tem duas gravações locais. Uma interrupção pode deixar vínculo incompleto até a retomada; a venda tem origem explícita para ser reconhecida. Atomicidade de todas as coleções e transações duráveis ficam para a etapa seguinte.
5. Fechar a página não garante que uma requisição assíncrona chegue ao servidor. O estado local continua importante. Não considerar geração de PDF como envio ao cliente ou confirmação na nuvem.
6. As suítes não validam navegação/download nativos em aparelhos reais nem um ciclo entre contas de teste conectadas. Não houve teste autenticado contra produção. Causas históricas individuais e recuperação de cadastros antigos não foram atribuídas ou executadas.
7. O reconhecimento de capturas incertas adicionais fica na memória da sessão e é descartado na suspensão/troca de conta. Depois de recarregar, uma resposta antiga perdida seguida de edição local pode exigir revisão manual do conflito. Persistência durável dessa evidência pertence à etapa seguinte; não fazer merge por aproximação para ocultar a limitação.

## Reversão de código

O PR deve permanecer em rascunho para revisão independente. Esta rodada não integra nem publica a branch.

Caso uma futura liberação precise ser revertida, preparar um commit de reversão dos commits deste pacote em branch separada e revisar o diff antes de integrar. Preservar primeiro o snapshot atual e as pendências/cópias locais. A reversão deve mudar somente código e referências de versão; não regravar `dados_app`, apagar cache, remover chaves de recuperação, reatribuir contas ou desfazer vínculos de conversão gravados.

Os campos novos são aditivos no JSON: revisões de proposta e origem da conversão. O código anterior ignora esses campos. A chave acumulada de conflitos precisa ser conservada, mesmo quando uma versão antiga não a utiliza. Voltar ao código anterior reintroduz os riscos corrigidos e enfraquece a retomada/idempotência; portanto, preferir uma correção para frente quando possível e não liberar edição com a versão revertida como se fosse equivalente.
