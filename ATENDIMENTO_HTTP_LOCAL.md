# Atendimento — integração HTTP local e bloqueio de homologação

Complemento do branch `codex/atendimento-mvp-sintetico`. A demo original `?demo=1` permanece em memória. O novo `?demo=persistente` só inicia em `127.0.0.1`, usando um PostgreSQL 17 descartável e arquivos sintéticos no HD externo. O endpoint não é uma Edge Function publicada, não recebe webhook e não usa Z-API ou Supabase remotos. `createLocalAtendimentoHttpServer` vem com `enabled=false` por padrão; o runner o liga apenas com `--serve` explícito.

## Bloqueio remoto, com evidência

Consulta somente leitura ao conector Supabase retornou o projeto **`voecomkennedy-v2-staging`**, ID público `lvmkyfycxylhdhqlpuyu`, criado em 25/06/2026, região `sa-east-1`, status **`INACTIVE`**, organização `Voecomkennedy's Org` (`izepnrcyqkapoxwogtzg`). `get_organization` mostrou plano **Free** (`tier_free`). A consulta SQL de verificação `select current_database(), current_setting('server_version')` nesse projeto terminou em timeout; nenhum SQL de escrita foi executado. A API de projeto não informou motivo, data da pausa ou elegibilidade para retorno.

A lista de projetos da mesma organização mostrou **dois ativos**: `Voecomkennedy's Project` (`qryobmqrkzddcvlvgfrp`) e `vck-agendamentos` (`krqafwzoqvbamnsfrfkm`). Ambos foram deixados intactos. A [página oficial de preços da Supabase](https://supabase.com/pricing) informa que o Free permite **dois projetos ativos** e pode pausar projetos depois de uma semana sem atividade. Logo, pausa automática é uma **hipótese compatível**, não o motivo confirmado. Como as duas vagas ativas já estão ocupadas, a restauração do staging pode ser recusada pelo limite; sair desse estado poderia exigir pausar um projeto ativo ou mudar de plano. Nenhuma dessas opções foi autorizada ou executada.

O conector expõe a ação `restore_project(project_id)` para restaurar um projeto. Seu contrato não pede nova credencial ou parâmetro de custo, mas a permissão efetiva e eventual exigência de plano/vaga só podem ser confirmadas ao executá-la ou no painel. **A ação não foi chamada.** O plano Free é anunciado a US$ 0/mês; isso não permite prometer que essa restauração específica será gratuita ou viável com as vagas ocupadas. Não foram criados projeto, branch, token, OAuth ou acesso persistente.

Roteiro mínimo para homologação: o responsável precisa indicar um projeto de teste já acessível ou decidir como disponibilizar o staging **sem tocar nos dois projetos ativos e sem custo não aprovado**. Confirmada uma homologação ativa e autorizada, aplicar as duas migrações aditivas somente nela, configurar o handler com Auth existente, testar RLS/arquivos e restauração com contas fictícias e verificar o receptor atual antes de sequer considerar callbacks Z-API. Isso não autoriza produção, webhooks reais ou mensagens. Não usar produção como substituta.

## Interface e servidor local

`js/atendimento-http-client.mjs` aceita somente URL `http://127.0.0.1` e usa o marcador estático `Synthetic local`. Esse marcador **não é credencial Supabase**. O servidor de teste aceita o marcador apenas em loopback e atribui um UUID fictício criado no cluster; a UI informa que o Auth é simulado. Um `verifyUser` real ainda depende de homologação e da integração com a sessão existente.

`js/atendimento-persistente.mjs` reutiliza o HTML e CSS da primeira demo, consulta conversas e contexto comercial do repositório local, busca, filtra etiquetas/não lidas, marca leitura, vincula IDs fictícios, arquiva PDF com bytes, compõe texto/PDF e mostra falha segura/incerto. O estado de envio vem da outbox durável. Uma saída incerta não oferece retry. Vínculo/recebido exibidos são exemplos sintéticos; a navegação operacional é desabilitada nesse modo local. Ao recarregar a página, as mensagens voltam do banco, não de memória da aba.

Para abrir a demo local, no checkout externo com PostgreSQL 17 e dependências já instaladas:

```sh
node scripts/test-atendimento-db.cjs --serve
```

O runner aplica as migrações e os testes **em um cluster recém-criado**, imprime `DEMO_LOCAL=http://127.0.0.1:<porta>/atendimento.html?demo=persistente`, e atende somente nessa porta de loopback. Ctrl-C em execução direta encerra HTTP/PostgreSQL e remove apenas a pasta temporária criada nessa execução. `npm run test:atendimento:db` sem `--serve` roda os testes e sai sem servir a página. Não abrir a demo persistente pelo servidor estático Python antigo; ele não contém o endpoint.

## Evidências e limites

O teste HTTP real usa `fetch` em loopback, identidade simulada, PostgreSQL e arquivos locais. Verifica 503 com entrypoint desligado, 401 sem marcador, 403 para outra origem, 422 para dono forjado, página e JS servidos, PDF com bytes, mensagem incerta sem reenvio e recarga de UI após reiniciar o servidor. A inspeção no navegador local também confirmou duas conversas fictícias, valor recebido sintético de R$ 900, PDF arquivado, mensagem incerta visível e bloqueio após recarregar a página. O runner foi encerrado; nenhum serviço de teste ficou ativo. `docs/atendimento/VALIDACAO_HTTP_LOCAL.md` registra os resultados.

Não testados: Supabase Auth/HTTP/Storage reais, cópia/restauração de bucket na nuvem, login multiaparelho, webhook, grupo real e envio Z-API. O HTTP local e a UI persistente são uma prova isolada, **não um CRM pronto para produção**. O valor recebido do exemplo local é calculado com os campos fictícios da fixture; o resumo financeiro operacional só deve ser reutilizado após integrar Auth e fonte comercial em homologação.
