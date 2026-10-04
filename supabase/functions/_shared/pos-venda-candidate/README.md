# Motor candidato do pós-venda — etapa 1 local

Este diretório não tem `Deno.serve`, entrypoint de implantação, SDK, leitura de
segredos, transporte HTTP nem adaptador PostgreSQL. A função v9 preservada em
`../../pos-venda/index.ts` **não importa estes módulos**. Eles não mudaram o
cron ou a operação em produção. Não basta implantar a v9 para ativar este
candidato.

- `engine.ts`: regras puras, identidade por conta, eventos, elegibilidade e
  texto.
- `handler.ts`: contrato HTTP injetável, autenticado antes de ler clientes;
  `GET ?dry=1` e `GET ?previa=1` são estritamente de leitura. POST é o único
  caminho de execução, exige ativo e executor fornecido; relógio simulado nunca
  vale para envio. A prévia funciona pausada, mas não manda nem para o número de
  teste.
- `dispatch.ts`: executor com portas injetáveis. Exige reserva persistente antes
  de qualquer envio e releitura de estado. Não implementa as portas reais.

## Regras candidatas

Vendas com `excluidaEm`, não emitidas, datas inválidas, cliente ausente/ambíguo
ou telefone inválido não enviam. IDs de pessoas não são procurados em outras
contas. Registros duplicados de conta/venda ficam inelegíveis; isso exige
visibilidade de pendências na futura integração, não correção automática dos
dados.

A faixa permitida é 08:00 inclusive até 21:00 exclusive em Brasília. O ajuste
original de eventos noturnos para 20:00 é preservado, mas **o horário real volta
a ser checado antes de cada envio**, inclusive após a transação de reserva.
“Hoje” e “amanhã” usam o instante real de composição da mensagem.

Com cron de 15 minutos, a tolerância proposta é **menor que 15 minutos** após o
horário agendado: `[agendado, agendado + 15min)`. Um tick perdido, atraso de
15min ou indisponibilidade maior não recupera o lote. Pode haver mensagens não
enviadas: devem virar pendência para revisão humana na etapa 2. Não há
compensação de 6h, 24h ou execução no dia seguinte. Esta decisão conservadora
requer aceite antes da ativação; tests locais não avaliam o cron real.

`dataVolta` e `horaVolta` descrevem partida. Sem confirmação de chegada, o tipo
`volta` não é gerado e é rejeitado mesmo se fornecido diretamente ao executor. O
check-in da volta continua candidato quando há data/hora válidas e intervalo
mínimo de 48h em relação à ida. Mensagens sobre chegada ficam para revisão
humana.

A interpretação de datas continua a da v9, Brasília UTC−3. **Não há conversão
por fuso do aeroporto**, nem verificação de horários reais de voo. Antes de
automação de trechos em outro fuso, definir a semântica dos campos e validar
cada perna. Não usar o candidato como prova de horário correto para toda viagem
internacional.

## Contrato de banco e integração pendentes — etapa 2

Não foi criada nem aplicada migration. Antes de conectar o cron é obrigatório:

1. Implementar reserva atômica com constraints/transações, por proprietário +
   venda + tipo + modo e uma chave de conversa/voo. Não usar consulta seguida de
   insert. Estado já aceito/incerto/rejeitado/tentativa/reservado bloqueia retry
   automático. Alteração do horário de voo não reseta a chave de uma tentativa.
2. Fazer compare-and-set da reserva por token, revisão atual da venda/cliente e
   configuração. Revalidar ativo, modo, não arquivada, janela e silêncio dentro
   da transação imediatamente anterior ao transporte; gravar tentativa antes de
   enviar. As portas recebem revisão/assinatura para este fim.
3. Após reserva, reler dados e cancelar se telefone, voo, modo ou estado mudar.
   Pausa concorrente depois da última validação não pode recolher uma mensagem
   já entregue à API: documentar essa corrida e testar o limite.
4. Não liberar reservas por TTL para repetir envio incerto. Em crash/timeout,
   manter a tentativa bloqueada, reconciliar com evidência do fornecedor e
   escalar revisão humana. Não prometer exatamente uma entrega entre serviços.
5. Implementar transporte sem retry cego e com timeout limitado. Resposta com ID
   é `aceito`, não `entregue`. Resposta ambígua/rede/5xx fica `incerto`. Salvar
   IDs, não corpo bruto ou URL com credenciais. Falha ao persistir depois do
   HTTP exige reconciliação; nunca apagar a reserva para tentar novamente.
6. Validar autenticação do cron e separá-la do acesso por usuário à futura
   Central de Mensagens. A chave cron não pode ser entregue ao navegador.
   Confirmar RLS, autorização do proprietário e escopo de conta no adaptador
   privilegiado.
7. Integrar históricos antigos para impedir repetição de mensagens da v9 já
   enviadas. Validar escopo de `pos_venda_envios`, que hoje não tem identidade
   de usuário no contrato capturado, antes de importar o bloqueio de
   duplicações.
8. Exibir ignoradas/expiradas/incertas e testar o adaptador com banco isolado,
   concorrência real, queda após envio, pausa durante lote, restauração e
   backups.

As chaves de conversa evitam repetição no mesmo telefone/voo/tipo sem fundir os
cadastros ou ignorar o nono dígito. `@lid` não é convertido em telefone. O
suporte completo a LID e captura de mensagens manuais continua no projeto
CRM/Z-API.

## Verificação local, sem rede ou credenciais

Na raiz do repositório, com Deno 2.9.4:

```sh
deno test --no-config --no-lock --cached-only supabase/functions/tests/pos-venda-candidate/
deno lint --no-config supabase/functions/_shared/pos-venda-candidate/*.ts supabase/functions/tests/pos-venda-candidate/*.ts
```

O teste usa somente módulos locais e `node:assert/strict` embutido no Deno. Não
passa `--allow-net` ou `--allow-env`. O registro em memória nos testes comprova
o uso do contrato pelo executor; **não comprova atomicidade de um banco real**.
Não testar importando/executando a baseline, pois ela possui `Deno.serve` e lê o
ambiente como na função v9 original.

Referências verificadas em 04/10/2026:
[Changelog Supabase](https://supabase.com/changelog),
[autenticação](https://supabase.com/docs/guides/functions/auth),
[testes de funções](https://supabase.com/docs/guides/functions/unit-test),
[envio Z-API](https://developer.z-api.io/message/send-text),
[semântica dos callbacks](https://developer.z-api.io/webhooks/introduction).
Nenhuma atualização relevante do changelog exigiu alterar a baseline nesta
etapa.
