# Propostas completas no painel (branch de teste)

`cotacoes.html` incorpora em um iframe de mesma origem a proposta de `Sistema-de-cotacao` no estado `5786270`. O iframe conserva os campos, o preenchimento de datas, as opções de voo e bagagem, a calculadora e o PDF A4 desse gerador. Em modo incorporado, as outras abas do gerador ficam ocultas.

Após a autenticação e a sincronização inicial do painel, o vendedor seleciona um cliente cadastrado, preenche a proposta e clica em **Salvar cotação** ou **Gerar Proposta / PDF**. O PDF é baixado diretamente. O painel salva o snapshot completo em `emissao_cotacoes` junto de `clienteId`, campos resumidos para a lista e para a venda, e um único ID estável. Gerar o PDF de novo atualiza a mesma cotação. O botão de edição restaura o snapshot; as cotações antigas continuam na lista e usam o formulário/PDF simples anterior.

As métricas mensais contam cotações pela data original de criação e conversões entre essas cotações. A venda gerada de uma cotação seleciona o cliente vinculado quando ele ainda existe; a cotação só fica convertida após salvar a venda. `CloudSync.agendarBackup()` envia a alteração pelo mecanismo autenticado já existente. Confira o indicador de nuvem antes de trocar de aparelho.

## Testes locais

```sh
node --test tests/proposal-integration.test.cjs
cd cotador
npm ci
npm test
TZ=Asia/Tokyo npm test
```

Os testes usam dados sintéticos e não acessam a conta real, vendas reais ou a API Supabase. Antes de integrar a branch, ainda é necessário um teste visual no navegador com conta de teste para conferir o iframe em celular e o ciclo real de sincronização entre dois aparelhos.
