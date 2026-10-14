# Propostas completas no painel (branch de teste)

`cotacoes.html` incorpora em um iframe de mesma origem a proposta de `Sistema-de-cotacao` no estado `5786270`. O iframe conserva os campos, o preenchimento de datas, as opções de voo e bagagem, a calculadora e o PDF A4 desse gerador. Em modo incorporado, as outras abas do gerador ficam ocultas.

Após a autenticação e a sincronização inicial do painel, o vendedor seleciona um cliente cadastrado, preenche a proposta e clica em **Salvar cotação** ou **Gerar Proposta / PDF**. O iframe só carrega depois de `app:ready`. No modo incorporado, o painel salva o snapshot completo em `emissao_cotacoes` **antes** de iniciar o PDF, junto de `clienteId`, campos resumidos, ID estável e revisão. O arquivo usa uma cópia dessa revisão. Novo, Limpar, Editar ou mudar de cliente durante o download não redireciona aquela gravação. Uma falha de PDF conserva a cotação salva; uma falha ao salvar impede a geração e mantém o formulário. Gerar o PDF de novo atualiza a cotação identificada no editor. O cabeçalho mostra Nova cotação ou o ID/revisão em edição, e o botão diferencia Salvar cotação de Salvar alterações. O botão de edição restaura o snapshot; as cotações antigas continuam na lista e usam o formulário/PDF simples anterior. Os totais antigos podem ser editados sem exigir insumos de cálculo que nunca foram salvos.

**Cadastrar contato**, dentro da proposta completa, pede apenas nome, sobrenome e WhatsApp. O contato é gravado como cliente em `emissao_pessoas`, selecionado na proposta e incluído no sync existente. CPF, nascimento e documentos não são preenchidos artificialmente; podem ser completados em Pessoas, conservando o mesmo ID. O formulário aceita DDD brasileiro ou `+` com código internacional. Nome e telefone iguais reaproveitam o cliente existente, inclusive o telefone secundário e a equivalência entre DDD e `+55`; um número compartilhado exige escolher um registro ou confirmar que se trata de outra pessoa. Os campos, datas e o ID da cotação em edição são preservados. O status informa o salvamento local e orienta conferir a nuvem; falhas de gravação mantêm o formulário preenchido. O cadastro não envia mensagens.

As métricas mensais contam cotações pela data original de criação e conversões entre essas cotações. A venda gerada de uma cotação seleciona o cliente vinculado quando ele ainda existe; a cotação só fica convertida após salvar a venda. A conversão registra `cotacaoOrigemId` e usa um ID determinístico por cotação. Se o segundo salvamento falhar, a próxima tentativa conclui o vínculo com a venda já criada, inclusive após recarregar, sem duplicar nem substituir seus valores pelo formulário da tentativa seguinte. Três cotações do mesmo cliente continuam independentes. O usuário recebe erro explícito enquanto a conversão estiver incompleta.

`CloudSync.agendarBackup()` envia as coleções pelo mecanismo autenticado existente. O estado local e a confirmação na nuvem são distintos. Uma confirmação de envio antigo mantém a edição mais recente pendente; falhas oferecem nova tentativa e até três retentativas automáticas, além da reconexão. Conflitos preservam a captura enviada, o cache mais recente e a versão remota em cópias locais acumuladas. Revisar depois/Escape não substitui dados nem autoriza o envio ao reconectar. A etapa não fornece histórico durável no servidor nem resolve todas as disputas entre abas. Veja [escopo, testes e reversão da etapa 1](docs/INTEGRIDADE_ETAPA1.md).

## Bebês e valores da proposta

As idades “menos de 1 ano” e “1 ano” representam bebês menores de dois anos. A composição mantém todos os viajantes; a calculadora multiplica a tarifa principal somente por adultos e crianças. **Tarifa de bebê** permite escolher isenção ou informar um valor por bebê para a viagem inteira, independentemente do país. Nos insumos da calculadora, os custos dos adultos/crianças são separados dessa cobrança. Nos campos de total fechado, o valor informado já inclui a cobrança dos bebês: ela não é somada novamente. O valor por adulto/criança é `(total PIX − tarifa explícita dos bebês) ÷ adultos/crianças`; o PDF identifica essa base e a tarifa dos bebês separadamente.

Alterar a composição atualiza a calculadora e o valor por adulto/criança, conservando os totais PIX/cartão preenchidos. Aplicar um resultado da calculadora é uma ação explícita. A restauração conserva preços, parcelas e comparativos salvos. Registros antigos com bebês e sem decisão de cobrança são marcados para revisão antes de recalcular, preservando seus números. A composição e a decisão de cobrança ficam no snapshot e o resumo do painel distingue viajantes e pagantes. O histórico local usa esse mesmo snapshot.

A causa estava no módulo copiado de `Sistema-de-cotacao`: `getTotalPax()` incluía bebês na multiplicação/divisão e `onPaxChange()` reescrevia os totais. Este ajuste é restrito ao cotador integrado; o repositório separado continua precisando da correção. Testes cobrem idades abaixo de um ano, um ano e criança de dois anos; isenção e cobrança explícita; PIX/cartão/parcelas; totais manuais e legado; bagagem, quatro tarifas, hospedagem, histórico e PDF vetorial A4.

## Testes locais

```sh
cd cotador
npm ci
npm test
TZ=Asia/Tokyo npm test
cd ..
node --test tests/*.test.cjs
```

Os testes usam dados sintéticos e não acessam a conta real, vendas reais ou a API Supabase. A suíte do painel executa o HTML e o iframe reais em um DOM isolado, mas não produz pixels nem testa downloads nativos do navegador.

Para abrir esta versão localmente, execute `python3 -m http.server 8765` na raiz do checkout e visite `http://127.0.0.1:8765/cotacoes.html`. Use somente uma conta de teste autorizada e dados sintéticos. Antes de integrar a branch, ainda é necessário conferir visualmente desktop e celular, o download do iframe no navegador e o ciclo real de sincronização entre dois aparelhos de teste.
