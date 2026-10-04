# Central de mensagens — entregas em etapas

O objetivo é controlar mensagens de cotação, emissão, check-in e pós-viagem pelo painel. Cadastro, histórico e tarefas pertencem ao sistema; WhatsApp/Z-API são o canal de comunicação.

## Etapa 1 — Base confiável

Implementação preparada em branch separada, sem alterar a operação em produção:

- Texto de WhatsApp das propostas completas baseado no snapshot da proposta: retorno independente, companhia, bagagens, comparativos, preços condicionais, bebês, hotel e observações. O gerador usa somente os campos comerciais; botão continua apenas copiar. Cotações legadas conservam o caminho anterior.
- Conversão em venda sem vínculo residual: fechar, abrir nova venda ou editar outra venda encerra o contexto; cancelamento também cancela o preenchimento atrasado. O formulário busca a cotação atual na conta autenticada, sem reutilizar o conteúdo do cache de navegação.
- Proteção de exclusão de pessoa na camada de dados quando há cotações ou vendas, incluindo arquivadas.
- Inicialização exige sincronização bem-sucedida antes de liberar o painel. Cache antigo/sem proprietário não é importado automaticamente para outra conta; preservação local é separada e não substitui backup externo.
- Fonte da automação de produção `pos-venda` v9 versionada sem modificações de comportamento. O motor candidato, isolado em `_shared/pos-venda-candidate`, prepara validação do horário real, validade, arquivamento e estados de envio para a próxima etapa, usando dependências simuladas nos testes.

**Limite importante:** os testes do candidato não alteram o cron nem protegem retroativamente os envios de produção. O candidato não contém entrypoint de implantação e ainda depende da reserva transacional e integração de banco da etapa 2. `supabase/functions/pos-venda/index.ts` é a referência v9 existente, não a nova versão corrigida. Não implantar esse arquivo esperando ativar o candidato.

## Etapa 2 — Central de Mensagens e integração do motor

**Implementada no PR #17, exclusivamente em simulação.** Sem publicação do painel, aplicação da migration em produção, alteração de cron ou transporte Z-API. A especificação e as instruções de teste estão em [CENTRAL_MENSAGENS_ETAPA_2.md](CENTRAL_MENSAGENS_ETAPA_2.md).

Uma opção Mensagens no painel oferece:

- **Agenda:** destinatário, viagem, horário, prazo limite, prévia e simulação; pausar, retomar e cancelar. Vencidas não são reagendadas para o presente.
- **Modelos:** texto editável, variáveis permitidas e prévia com dados fictícios. Nenhum botão envia ao número de teste.
- **Regras:** pausa global, ativação por tipo, antecedência, silêncio, validade, confirmação de emissão, fusos e chegada final.
- **Histórico:** eventos imutáveis por conta e resultado fictício identificado como `simulada`. Não afirma aceite ou entrega do WhatsApp.

Reserva atômica por tarefa e conversa, controle de versões e fonte, isolamento por proprietário e registro da tentativa antes do resultado estão implementados e testados em PostgreSQL local. A autenticação e o enquadramento HTTP do Supabase são simulados nos testes integrados; ainda falta homologação em um projeto isolado.

Retornos multitrecho identificados na cotação vinculada ficam pendentes: o cadastro de vendas ainda não guarda os aeroportos independentes de retorno. Não inferimos um trajeto invertendo os aeroportos da ida. O histórico legado da v9 não foi importado nem atribuído a um proprietário por suposição.

Antes de conectar o candidato ao cron:

1. Homologar migration, Auth, REST, bundle da função e interface em ambiente separado; validar backup e restauração.
2. Revisar chegada, fusos, horários e mensagens com o operador. A janela padrão é de 15 minutos; as regras permitem de 1 a 60.
3. Implementar o transporte e a reconciliação com o provedor, distinguindo aceitação, entrega e leitura. Não repetir resultados incertos automaticamente.
4. Somente com autorização, testar um número controlado e planejar a substituição por um único disparador. Nunca manter dois crons enviando os mesmos avisos.

## Etapa 3 — Cotação e follow-up

- Abrir WhatsApp Web com destinatário e texto revisados; clique não marca envio confirmado.
- Envio pelo sistema com ID do provedor e revisão imutável da proposta.
- Webhook autenticado, eventos deduplicados e associação de telefone/LID à conversa e ao cliente. Validar mensagens próprias no Web/celular e múltiplas propostas para o mesmo chat.
- Tarefa por ausência de resposta somente após essa captura funcionar. Resposta, pausa, venda, perda, validade vencida ou revisão cancelam a tarefa pertinente.
- Sem captura confiável, oferecer tarefa manual, sem presumir que o cliente não respondeu.
- Confirmação de emissão precisa ser explícita: salvar uma venda com o status atual não é comprovação de bilhete emitido pelo fornecedor.

## Etapa 4 — Navegação e visual

Menu lateral com nomes visíveis no computador; gaveta por botão no celular. Unificar a paleta usada pelo PDF (`#0A1931`, `#1A3D63`, `#4A7FA7`, `#B3CFE5`, `#F6FAFD`), preservando contraste e fluxos de vendas/PDF. Validar uma prévia antes de substituir a navegação atual.

## Verificação local

```sh
npm ci --ignore-scripts
cd cotador
npm ci --ignore-scripts
npm test
cd ..
npm test
deno test --no-config --no-lock --cached-only supabase/functions/tests/pos-venda-candidate/ supabase/functions/tests/central-mensagens/
npm run test:db
```

Os testes usam dados sintéticos. Deno não precisa de permissão de rede, ambiente ou leitura de contas. `test:db` exige PostgreSQL 17 e cria um cluster descartável em loopback; testa RLS, locks e concorrência reais, com Auth e envelope REST simulados. Nenhuma suíte comprova entrega no WhatsApp ou sincronização real entre dois dispositivos.

## Implantação e reversão

Revisar a branch e validar a interface isolada antes da publicação do frontend. Guardar o commit anterior para reversão. As alterações do frontend e a futura implantação do motor têm liberações separadas; fazer merge da etapa 1 não deve implantar Edge Functions.

Para a etapa 2, capturar novamente a versão real do motor/configuração e validar backup/restauração em teste antes de migrar. Não alterar simultaneamente o cron ativo e regras do waTidy sem mapear qual serviço é responsável por cada mensagem.
