# Fonte preservada da função pos-venda v9

`index.ts` é a cópia **exata** da fonte v9 capturada em 04/10/2026. Não contém
valores de credenciais; usa os nomes de variáveis de ambiente já presentes na
fonte original. Nenhuma correção foi aplicada neste arquivo.

SHA-256 do arquivo fonte, conferido com o conteúdo v9 retornado pelo Supabase:

```text
24abc67772e29404e8436202db756b392c674c9beccc2dc6a7ee084d6acf3864
```

O objetivo desta cópia é permitir revisão e comparação com a operação existente.
Ela preserva inclusive os problemas identificados: `previa=1` com envio por GET,
controle de ativo depois da prévia, mistura de contas, recuperação de atrasos,
falta de reserva atômica e inferência de chegada a partir da partida de volta.

**Não implantar esta pasta para ativar as proteções novas.** Os candidatos estão
em `../_shared/pos-venda-candidate/`, sem entrypoint, sem transporte real e sem
conexão ao cron. Os testes ficam em `../tests/pos-venda-candidate/`.

Nenhum deploy, agendamento, envio, execução da função ou alteração de banco foi
feito nesta etapa. A fonte foi consultada somente para leitura. A dependência original `@supabase/supabase-js@2` também foi
preservada; antes de um futuro build publicado, selecionar versão exata e lockfile
faz parte da preparação da implantação, não desta cópia de referência.
