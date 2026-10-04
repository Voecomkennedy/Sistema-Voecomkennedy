# Backend da Central — etapa 2, somente simulação

Backend da nova Central, com publicação autorizada exclusivamente em simulação
no projeto `qryobmqrkzddcvlvgfrp`. Este documento descreve o código e os testes;
não comprova que uma versão já foi implantada. **O backend não altera cron nem
conecta/envia ao WhatsApp.** A função preservada `../../pos-venda/index.ts`
continua separada e não importa estes arquivos.

`../../central-mensagens/index.ts` é um entrypoint novo. A configuração pública
versionada `../../central-mensagens/deployment-config.json` autoriza somente o
projeto acima, `mode: "simulacao"` e a origem
`https://sistema.voecomkennedy.tur.br`. O resolver exige `SUPABASE_URL`
exatamente desse projeto por HTTPS, sem credenciais, query ou caminho adicional.
Configuração ausente/inválida ou outro projeto falha fechada; um JSON
ausente/malformado pode impedir o próprio bundle/boot. Nenhum valor ativa envio
real e nenhum módulo conhece endpoint ou credencial Z-API. O número de teste
salvo continua somente configuração revisável, nunca destino de uma requisição
nesta etapa.

## Componentes e autenticação

- `handler.ts`: ações `listar`, `salvar`, `preparar`, `controlar` e `simular`
  por POST, com portas injetáveis. OPTIONS só responde ao preflight.
- `adapter.ts`: `fetch` nativo restrito ao servidor Supabase configurado,
  `/auth/v1/user` e `/rest/v1`. Usa timeout de 10 segundos, não segue redirects
  nem repete chamadas em falhas. Não incorpora SDK ou transporte de mensagens.
- `domain.ts`: importa `js/messages-domain.mjs`, usado também na interface. O
  bundle da função precisa incluir esse módulo local.
- `cors.ts`: lista exata de origens, sem wildcard ou credenciais de cookies.
- `deployment.ts`: resolver puro da configuração pública. Sem rede, ambiente,
  leitura de arquivo ou credencial; o entrypoint fornece os valores recebidos.

O servidor valida o bearer em Auth antes de ler os dados. A identidade retornada
define o proprietário de todas as consultas e RPCs; `user_id`, relógio, modo e
transporte no corpo são rejeitados. Usuário anônimo do Auth não acessa a
Central. O corpo máximo é 256 KiB. A API nunca retorna a service key, corpo de
erro do upstream, token de reserva, hash interno da fonte ou o snapshot
`dados_app`.

O entrypoint somente lê as variáveis Supabase já injetadas: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` e opcionalmente `SUPABASE_ANON_KEY` para Auth. As
duas chaves são legadas e precisam continuar ativas. A configuração pública não
lê, grava, gera ou rotaciona credenciais. Chamadas sem cabeçalho Origin
continuam exigindo bearer válido. Não copiar valores de produção para testes.

Overrides existentes são apenas restritivos:

- O gate exige **JSON em simulação E ENV ausente ou igual a `simulacao`**.
  Qualquer outro `CENTRAL_MENSAGENS_HABILITADA`, inclusive string vazia, fecha.
- `CENTRAL_MENSAGENS_ORIGENS`, se informado, precisa ser uma lista não vazia de
  origens exatas já contidas no JSON. Uma origem adicional ou inválida fecha o
  gate. A variável nunca amplia a lista autorizada pelo arquivo.
- Para reverter sem alterar segredos globais, versionar `mode: "desabilitada"`
  no JSON e republicar **somente a Central**. Mesmo ENV=`simulacao` não reativa
  JSON desligado. Confirmar a resposta 503 em nova chamada da origem permitida;
  uma tentativa fictícia já iniciada pode concluir seu registro.

O pacote tem nove módulos/arquivos de runtime: entrypoint, JSON, `adapter.ts`,
`handler.ts`, `types.ts`, `cors.ts`, `domain.ts`, `deployment.ts` e
`js/messages-domain.mjs`. Preservar os caminhos relativos. Não incluir v9,
testes, `.env` ou outros arquivos. A publicação deve manter `verify_jwt=true`,
sem modificar permissões ou configurações das outras funções.

## Operações e histórico

Listar não grava nada. Se não existem preferências, devolve defaults pausados
com versão zero. O primeiro preparar pode persistir esses defaults com CAS0; uma
criação concorrente retorna conflito, sem sobrescrever. Sem fonte sincronizada,
preparar retorna 409. Salvar usa a versão conhecida pela interface; conflitos
409 não são repetidos automaticamente.

Preparar calcula a agenda a partir da fonte atual e das preferências salvas e
entrega as tarefas à RPC transacional. A leitura `mensagens_fonte` fornece
conteúdo, versão e fingerprint no mesmo SELECT. Preparar devolve esse
fingerprint em `p_fonte_hash`; o banco compara-o novamente sob lock. Uma edição
entre leitura e preparação é rejeitada mesmo sem incremento da versão. O hash
permanece interno e não é recalculado no JavaScript. A validação exige
confirmação explícita da emissão e dos fusos. O banco protege versões,
arquivamento, identidade da fonte e identidade da conversa. Preparar não executa
as tarefas.

Simular prepara novamente, reserva pelo ID e proprietário, inicia por CAS com
token e **registra tentativa antes** de calcular o resultado fictício. As RPCs
revalidam pausa, modelos, versões, janela e silêncio. O handler verifica
novamente janela e silêncio no instante real da composição. “Hoje”/“amanhã” usa
o fuso do voo e o relógio do servidor. O tipo `volta` ancora a chegada
confirmada e admite simulação depois dela; os outros exigem instante anterior à
partida. Nenhum parâmetro HTTP permite alterar esse relógio.

A tarefa congela modelo, regra, contexto e fusos. A simulação usa esse modelo
congelado e grava o texto recomposto, o contexto público e um identificador
SHA-256 com prefixo `sim-`. Esse identificador é sintético: **não é aceite,
envio ou entrega do WhatsApp**. O estado final é `simulada`. Histórico inclui
uma projeção segura do snapshot preservado pelo banco, independente de edições
posteriores dos modelos e dos cadastros.

Composição inválida ou janela fechada após iniciar registra `falha`, sem retry.
Se a gravação do resultado falhar, a tarefa permanece `tentativa` e exige
reconciliação. Não há reenvio, limpeza por TTL ou opção de forçar execução.
Pausa depois da última validação transacional não desfaz uma tentativa já
iniciada; esta etapa não possui efeito externo a recolher.

A resposta informa limites de 500 tarefas e 200 eventos de histórico, ordenados
do mais recente. Não equivale a uma exportação completa. Controle e simulação
consultam o ID diretamente nas RPCs, sem depender do recorte da listagem. Não
importa o histórico legado da v9 e não comprova integração com Z-API.

## Verificação local

Na raiz do repositório, Deno 2.9.4, sem permissões de rede ou ambiente:

```sh
deno test --no-config --no-lock --cached-only supabase/functions/tests/central-mensagens/
deno check --no-config --no-lock supabase/functions/central-mensagens/index.ts
deno lint --no-config supabase/functions/_shared/central-mensagens/ supabase/functions/central-mensagens/ supabase/functions/tests/central-mensagens/
```

Os testes Deno usam Auth/REST/registro simulados e o domínio real. Cobrem
autenticação, isolamento por proprietário, rejeição de overrides, erros seguros,
CAS, reserva/início, composição na mudança de dia, expiração/silêncio durante a
tentativa, snapshot do histórico e falha posterior sem repetição. Sozinhos não
comprovam a atomicidade do PostgreSQL. A suíte separada `npm run test:db` cria
um cluster PostgreSQL 17 descartável local e verifica o contrato real do banco;
ela não deve usar um projeto Supabase operacional.

Não importar o entrypoint para executar testes: `Deno.serve` é exclusivo do
ambiente da função. `deno check` somente verifica tipos, sem iniciá-lo.
