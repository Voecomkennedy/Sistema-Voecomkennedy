# Atendimento: demonstração autenticada e restrita

Esta fatia usa o login Supabase do sistema e somente exemplos fixos de Ana e Bruno. Não lê `dados_app`, não importa histórico, não cria outbox e não chama Z-API. A página permanece fechada por padrão; a rota opcional é `atendimento.html?demo=autenticado`. A função `atendimento-demo` é independente da Central de Mensagens e do pós-venda.

## Critérios verificados localmente

- JWT validado com `auth.getUser` em cada ação; proprietário vem do token. A função só atende o ID configurado no servidor, pela origem exata configurada. Configuração ausente retorna 503.
- Conversas, busca, não lidas, vínculo manual, composição fictícia e PDFs privados persistem nas tabelas `atendimento_*` e no bucket privado `atendimento-arquivos`, sempre com `instancia = demo` e `user_id` do Auth. Não há envio, webhook, importação ou atribuição automática.
- A mesma requisição de mensagem/PDF não duplica o registro. PDF é verificado por assinatura e SHA-256 ao baixar. Sem backup dos objetos, o banco sozinho não permite restaurar PDFs; manter plano de exportação e teste de restauração antes de uso operacional.
- Testes com dois usuários sintéticos no Supabase local e com Chrome desktop/móvel passaram; clientes, cotações e vendas existentes passaram na suíte de regressão. As migrações locais são cópias do esquema aditivo já instalado, sem mudanças nesta rodada.

## Ativação futura, somente após autorização de acesso

Configurar no servidor `ATENDIMENTO_DEMO_OWNER_ID` com o ID **do login existente autorizado** e `ATENDIMENTO_DEMO_ORIGIN=https://sistema.voecomkennedy.tur.br`; não colocar esses valores na página. Publicar somente a nova Edge Function com verificação JWT ativa e a página estática desta branch. Não criar usuário, senha, token, credencial Z-API ou webhook. Confirmar 401 sem sessão, 403 com outra conta/origem, 200 com a conta permitida e outbox vazia. A configuração da allowlist persistente e a publicação não foram realizadas nesta rodada.

Para desativar, retirar a rota demonstrativa da publicação e remover `ATENDIMENTO_DEMO_OWNER_ID` do ambiente da função. Sem esse valor, o endpoint responde 503. Não tocar nos consumidores existentes, no filtro global de grupos ou na instância Z-API. Para avançar à operação real, concluir encaminhamento seguro do callback, cópia de mídias antes da expiração, exportação/restauração de banco **e** objetos e aceite explícito para o transporte real.
