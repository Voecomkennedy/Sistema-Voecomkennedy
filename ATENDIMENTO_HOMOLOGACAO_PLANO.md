# Atendimento — decisão de homologação local e integração futura

Atualização: a homologação local foi concluída em [ATENDIMENTO_SUPABASE_LOCAL.md](ATENDIMENTO_SUPABASE_LOCAL.md). A leitura do receptor e as condições de ativação estão em [ATENDIMENTO_RECEPTOR_PLANO.md](ATENDIMENTO_RECEPTOR_PLANO.md). O restante desta página preserva a análise anterior à criação da VM.

Estado em 13/10/2026. **Nenhuma VM, contêiner, projeto remoto ou função foi criado/iniciado nesta análise.** `vck-agendamentos` e o projeto principal permanecem ativos. Esta página registra a condição para testar Auth, Storage e HTTP reais localmente antes de qualquer integração remota.

## Capacidade e ajuste necessário

O Mac mini é Apple Silicon, macOS 26.6.2, 8 GiB de RAM, com cerca de 30% de memória livre medida no momento. O HD externo correto (UUID `E29E060A-6A14-4E69-AB1F-D7F26F6FB59E`) tem 456 GiB livres; o volume interno reportou 17 GiB livres. Supabase CLI 2.111.0, Docker CLI 29.8.2 e Colima 0.10.3 já estão instalados, mas o daemon Docker e o Colima estão parados. O único perfil Colima visível, `agency-eval`, reserva 2 CPUs, 4 GiB de RAM e 12 GiB de disco; sua pasta está em `~/.colima` no volume interno e ocupa 2,9 GiB. Usá-lo para baixar a stack adicionaria imagens ao disco interno e dividiria a VM com outro trabalho.

A CLI instalada oferece `supabase start` via Docker; os comandos experimentais de runtime nativo descritos na documentação atual não apareceram nela. Para obedecer à exigência de manter nova infraestrutura no HD externo, o ajuste proposto é **um perfil Colima novo e isolado** com `COLIMA_HOME` sob `/Volumes/HD externo/Codex-eval-preparation/`, 2 CPUs, 4 GiB de RAM e 24 GiB de disco virtual, mais projeto Supabase local e dados de teste nesse mesmo volume. O perfil `agency-eval` não seria movido nem alterado. `COLIMA_HOME` é a opção documentada pelo Colima para mudar a pasta da VM. A reserva de 4 GiB num host de 8 GiB e o download de imagens podem pressionar os demais aplicativos; os 24 GiB são orçamento de teste, **não medição do tamanho final**. Antes de criar/iniciar essa VM, confirmar que o impacto de RAM é aceitável. Não há custo de projeto Supabase para a stack local, mas o teste ainda depende de imagens de contêiner baixadas e disponibilidade de rede.

Referências: [Supabase local/CLI](https://supabase.com/docs/guides/local-development), [Colima — configuração e `COLIMA_HOME`](https://colima.run/docs/configuration/).

## Validação local que ainda falta

Com a VM isolada disponível, executar uma única stack oficial Supabase em loopback, com serviços mínimos de Postgres, Auth, API, Storage e Edge Runtime. Usar exclusivamente contas, mensagens e PDFs sintéticos criados no teste, sem importar dados de clientes ou credenciais da operação. Aplicar as migrações aditivas **somente localmente**; testar sessão Auth real, isolamento RLS entre duas contas, acesso/bytes/checksum de bucket privado, ingresso HTTP autenticado, idempotência, resultado incerto, exportação e restauração em destino local vazio. Encerrar stack/VM após os testes, confirmando consumo e limpeza do que o teste criou. A demo atual com `Synthetic local` não satisfaz essa etapa: Auth e Storage nela ainda são simulados ou filesystem local.

Essa homologação reproduz contratos principais, mas não prova entrega Z-API, callbacks compartilhados, cotas/latência do Supabase hospedado, execução de cron hospedado nem comportamento de clientes reais. Nenhum webhook ou mensagem real deve entrar no teste.

## Sequência futura no projeto principal — somente plano

1. Inventariar esquema, políticas, Edge Functions, cron e armazenamento do projeto principal; conferir quotas de banco, arquivos e saída contra volume/retensão projetados de mensagens e PDFs. Obter backup verificável de banco **e** cópia independente dos objetos privados, com manifesto e hashes. O backup de banco não contém os bytes do Storage.
2. Concluir teste local acima, revisar migrações e adaptadores de Auth/Storage/HTTP. Validar restauração completa e isolamento antes de usar dados ou recursos remotos.
3. Em uma etapa autorizada separada, preparar implantação **aditiva** no projeto principal com flag desligada, sem mudar o receptor Z-API, a Central de Mensagens, a função pós-venda v9 ou promoções. Verificar o esquema e RLS após migrar, ainda sem tráfego real.
4. Mapear o receptor atual e seus ACKs. Ensaiar um ingresso autenticado com fan-out que preserve o envelope inteiro do consumidor antigo; grupos ficam fora somente do novo módulo. Callback de mensagens próprias e qualquer mudança global de filtro exigem prova de que o receptor antigo continuará recebendo. Só depois de autorização de ativação, acompanhar erros, fila, arquivos e métricas.
5. Rollback inicial: desligar a flag/entrada nova e manter consumidor antigo ativo; parar novos envios do módulo, reconciliar saídas incertas e preservar eventos/arquivos para exportação. Não apagar tabelas, bucket ou dados como parte do rollback automático. Restaurar banco/objetos só a partir de backup testado e com plano específico de recuperação.

Nenhuma dessas ações remotas foi executada ou autorizada por este plano.
