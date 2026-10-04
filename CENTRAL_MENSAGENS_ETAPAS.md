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

Uma opção Mensagens no painel com:

- **Agenda:** destinatário, viagem/trecho, horário, prazo limite, prévia; pausar/cancelar e revisar.
- **Modelos:** texto editável com variáveis permitidas, prévia e teste explicitamente acionado para o número de teste configurado.
- **Regras:** ativar cada tipo, antecedência, silêncio, validade e retomada.
- **Histórico:** aceito pela integração, entregue quando comprovado, falha, incerto, cancelado e expirado.

Antes de conectar o candidato ao cron:

1. Implementar e testar a reserva atômica de cada mensagem e conversa, incluindo reconciliação de resultados incertos. Índice de log gravado depois do HTTP não impede disparo duplicado.
2. Definir proprietário da configuração e dos dados, acesso autenticado do painel e proteção dos segredos. Não expor a configuração bruta contendo a chave do cron.
3. Salvar modelos/regras e versões das tarefas; alterações de voo, destinatário ou pausa invalidam a versão anterior.
4. Validar horário local do voo e chegada final. Pós-viagem sem chegada confirmada fica para revisão humana.
5. Comprovar que retomar após a viagem mantém vencidas como expiradas; não recuperar automaticamente fila antiga. A janela conservadora do candidato deve ser apresentada ao operador antes de ativação.
6. Testar primeiro sem transporte real, depois em modo de teste autorizado. Substituir o mecanismo antigo por um único disparador; nunca deixar dois crons enviando os mesmos avisos.

O painel pode começar exibindo os registros existentes. Não inferir entrega/leitura pelo status legado `enviado`, que representa aceite da Z-API.

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
cd cotador
npm ci --ignore-scripts
npm test
cd ..
node --test tests/*.test.cjs
deno test --no-config --no-lock --cached-only supabase/functions/tests/pos-venda-candidate/
```

Os testes usam dados sintéticos. O candidato não precisa de permissão de rede, ambiente ou leitura de contas. Teste do painel em DOM não comprova entrega no WhatsApp, RLS real, sincronização entre dois dispositivos nem renderização nativa do PDF.

## Implantação e reversão

Revisar a branch e validar a interface isolada antes da publicação do frontend. Guardar o commit anterior para reversão. As alterações do frontend e a futura implantação do motor têm liberações separadas; fazer merge da etapa 1 não deve implantar Edge Functions.

Para a etapa 2, capturar novamente a versão real do motor/configuração e validar backup/restauração em teste antes de migrar. Não alterar simultaneamente o cron ativo e regras do waTidy sem mapear qual serviço é responsável por cada mensagem.
