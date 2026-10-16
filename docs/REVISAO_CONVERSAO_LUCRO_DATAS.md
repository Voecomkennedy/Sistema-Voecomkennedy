# Revisão: conversão de cotação, lucro e datas

Preparado em 16/10/2026 para revisão, sem publicação. Base: `main` em `be0bf86f3770f7cf06c19bb49c22a7ae38086035` (inclui somente Pix). Branch local: `fix/conversao-lucro-datas`.

## Diagnóstico

O alerta “O vínculo com a cotação mudou. Reabra a cotação ou use Nova venda para registrar uma venda independente.” é disparado antes de qualquer gravação por `salvarVenda()`, quando a cotação desaparece, já está convertida, o formulário está editando uma venda, ou o ID do cliente selecionado difere do vinculado à cotação.

A leitura restrita do projeto Supabase principal confirmou que a cotação de 06/10 permanece aberta e vinculada ao cadastro original. Há outro cadastro com o nome mais completo e outro ID, criado posteriormente. Não é seguro tratar esses dois IDs como a mesma identidade apenas pela semelhança dos nomes.

A reprodução com dados sintéticos e o código original de `main` mostrou o caminho exato: o cadastro rápido sempre chamava `addPessoa`, mesmo ao completar os dados do cliente de uma conversão. Selecionava a pessoa recém-criada; o ID da cotação continuava sendo o original; Salvar então exibia o alerta. A criação do segundo cadastro na produção é compatível com esse caminho, mas a sessão original do navegador não foi acessada para afirmar qual botão foi usado.

A proteção de integridade continua nas duas camadas. A correção impede a troca acidental na interface e permite **completar o cadastro do cliente vinculado**, atualizando a pessoa original por ID. Os passageiros e o restante do formulário são preservados. Cotações legadas sem cliente continuam exigindo seleção explícita de uma pessoa cadastrada. O código existente mantém a conversão idempotente e o identificador determinístico da venda.

## Alterações

- Venda e custo são editáveis; lucro é automático, calculado em centavos. Custo acima da venda registra prejuízo. A formatação foi corrigida para preservar o sinal negativo.
- Milheiro continua informativo e fora dos cálculos.
- Na edição histórica, enquanto venda e custo não forem alterados, os campos financeiros originais são preservados, inclusive campos ausentes ou valores inconsistentes antigos. Editar venda ou custo recalcula o lucro desse registro. Não há migração ou recálculo em massa.
- Datas civis exigem calendário válido e ano de quatro dígitos (1900–9999), com mensagem junto ao campo e foco/rolagem até o erro. Valores digitados não são apagados ou corrigidos automaticamente.
- Anos incompletos recebem sugestão textual, sujeita à conferência. Uma volta em janeiro anterior à ida em dezembro recebe sugestão explícita do ano seguinte, sem alteração automática.
- Novas viagens impedem partida em data passada; registros históricos abertos para edição continuam editáveis. A referência para o dia atual é `America/Sao_Paulo`.
- Datas automáticas de venda e pagamento usam o mesmo fuso brasileiro. Cronologia das escalas considera os fusos dos aeroportos; duração manual não dispensa a validação de datas explícitas impossíveis.
- Mantidos os estilos do painel/editor e a opção somente Pix. Atualizadas as versões dos recursos alterados para carregamento após a revisão/publicação.

## Evidências e validação

Os testes usam dados sintéticos, perfis novos de Chrome e servidor em `127.0.0.1`. Os conectores de autenticação/nuvem são substituídos por fixtures; requisições operacionais são bloqueadas. A suíte de integridade usa IndexedDB e simulação local das confirmações de nuvem.

- `evidence/unit-panel.txt`: suíte do painel, incluindo conversão, cliente por ID, lucro/prejuízo, legado, datas e pagamentos.
- `evidence/unit-cotador.txt`: suíte do editor, incluindo anos, virada 15/12/2026 → 01/01/2027, bissexto, escalas, linha internacional de data, fusos e durações manuais.
- `evidence/integrity-browser.txt`: 42 cenários de transação, concorrência, retomada, resposta perdida, quota, recuperação e PDF somente Pix; zero requisições à produção.
- `evidence/browser-baseline.txt`: reprodução do alerta e da aceitação indevida de viagem passada na base original.
- `evidence/sales-dates-browser.txt`: conversão completa, duplo Salvar/reload, centavos, digitação sequencial do ano no Chrome, campos preservados, foco no erro e escalas.
- Capturas sintéticas: `sales-finance.png`, `sales-date-error.png`, `proposal-connection-error.png`, `proposal-mobile-date-error.png` e `baseline-conversion.png` na pasta `evidence`.

Para repetir:

```sh
npm ci
(cd cotador && npm ci)
npm test
(cd cotador && npm test)
node scripts/test-integrity-browser.cjs
curl -fsSL https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css -o /tmp/vck-bootstrap.css
curl -fsSL https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js -o /tmp/vck-bootstrap.js
npm run test:sales:browser
node scripts/test-sales-dates-browser.cjs --baseline
```

O teste de navegador usa o Chrome já instalado no Mac; outro executável pode ser indicado por `VCK_BROWSER_BIN`. Os dois arquivos públicos de Bootstrap servem somente para renderizar a fixture com o mesmo CSS/JS do painel. Nenhuma dependência foi atualizada. As datas dos cenários fixos refletem a solicitação de outubro/2026.

## Limites e encaminhamento

Nenhuma escrita foi feita no Supabase de produção, nenhuma venda real foi finalizada e nenhum cadastro real foi mesclado ou corrigido. A última consulta confirmou a cotação real aberta, sem `vendaId`. O cadastro duplicado permanece para avaliação do responsável.

Não houve push, PR ou deploy. A publicação correta deste repositório é GitHub Pages; não foi usado Netlify. Não foram executadas rotinas de pós-venda nem enviadas mensagens. Não foi alterado o painel separado de ofertas, nem criada VM. As cópias anteriores do repositório foram preservadas; esta revisão usa clone isolado na pasta da tarefa.

Após revisar e publicar, o responsável pode abrir a cotação e usar **Completar cadastro do cliente vinculado**, conferir os dados e concluir a conversão. Esta revisão não toma essa decisão pela venda real.
