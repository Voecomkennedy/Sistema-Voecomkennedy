# Propostas completas no painel (branch de teste)

`cotacoes.html` incorpora em um iframe de mesma origem a proposta de `Sistema-de-cotacao` no estado `5786270`. O iframe conserva os campos, o preenchimento de datas, as opções de voo e bagagem, a calculadora e o PDF A4 desse gerador. Em modo incorporado, as outras abas do gerador ficam ocultas.

Após a autenticação e a sincronização inicial do painel, o vendedor seleciona um cliente cadastrado, preenche a proposta e clica em **Salvar cotação** ou **Gerar Proposta / PDF**. O iframe só carrega depois de `app:ready`. O PDF é baixado diretamente. O painel salva o snapshot completo em `emissao_cotacoes` junto de `clienteId`, campos resumidos para a lista e para a venda, e um único ID estável. Gerar o PDF de novo atualiza a mesma cotação. O botão de edição restaura o snapshot; as cotações antigas continuam na lista e usam o formulário/PDF simples anterior. Os totais antigos podem ser editados sem exigir insumos de cálculo que nunca foram salvos.

**Cadastrar contato**, dentro da proposta completa, pede apenas nome, sobrenome e WhatsApp. O contato é gravado como cliente em `emissao_pessoas`, selecionado na proposta e incluído no sync existente. CPF, nascimento e documentos não são preenchidos artificialmente; podem ser completados em Pessoas, conservando o mesmo ID. O formulário aceita DDD brasileiro ou `+` com código internacional. Nome e telefone iguais reaproveitam o cliente existente, inclusive o telefone secundário e a equivalência entre DDD e `+55`; um número compartilhado exige escolher um registro ou confirmar que se trata de outra pessoa. Os campos, datas e o ID da cotação em edição são preservados. O status informa o salvamento local e orienta conferir a nuvem; falhas de gravação mantêm o formulário preenchido. O cadastro não envia mensagens.

As métricas mensais contam cotações pela data original de criação e conversões entre essas cotações. A venda gerada de uma cotação seleciona o cliente vinculado quando ele ainda existe; a cotação só fica convertida após salvar a venda. `CloudSync.agendarBackup()` envia a alteração pelo mecanismo autenticado já existente. Confira o indicador de nuvem antes de trocar de aparelho.

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
