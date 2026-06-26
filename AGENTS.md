# AGENTS.md — VOECOMKENNEDY

Guia para agentes de programação que trabalham neste repositório.
Leia este arquivo inteiro antes de qualquer tarefa. Não suponha contexto que não está aqui.

---

## 1. VISÃO GERAL DO SISTEMA ATUAL (V1)

O sistema V1 é uma aplicação web estática multi-página (MPA) hospedada em **Cloudflare Pages**
com domínio `sistema.voecomkennedy.tur.br`. Não usa nenhum framework SPA.

### O que existe hoje

| Arquivo | Função |
|---|---|
| `index.html` | Dashboard com estatísticas e alertas de check-in |
| `vendas.html` | CRUD de vendas de passagens aéreas |
| `pacotes.html` | CRUD de pacotes turísticos |
| `cotacoes.html` | Cotações com status e conversão para venda |
| `pessoas.html` | Cadastro unificado de clientes, passageiros e fornecedores |
| `checkin.html` | Acompanhamento de check-ins por urgência de embarque |
| `cartao-embarque.html` | Geração de PDF estilo cartão de embarque |
| `backup.html` | Exportação/importação de dados em JSON |
| `login.html` | Autenticação com Supabase |
| `diagnostico.html` | Página de debug (protegida por `Auth.proteger()` desde Etapa 0) |
| `clientes.html` | Duplicata de `pessoas.html` — considerada código morto |
| `js/storage.js` | CRUD no `localStorage` (fonte primária de dados V1) |
| `js/cloud-sync.js` | Sincronização `localStorage` → Supabase (JSONB monolítico) |
| `js/auth.js` | Autenticação via Supabase Auth |
| `js/utils.js` | Formatação, validação de CPF, cálculos de margem |
| `js/aeroportos.js` + `aeroportos-data.js` | 247 aeroportos IATA com busca |

### Como o V1 armazena dados

- **Fonte primária**: `localStorage` do navegador (chaves: `emissao_vendas`, `emissao_pessoas`, `emissao_pacotes`, `emissao_cotacoes`)
- **Sincronização**: `cloud-sync.js` faz upsert no Supabase após 1,5s de inatividade
- **Estrutura no Supabase**: tabela `dados_app`, coluna `conteudo` JSONB — um único registro por usuário contendo todos os dados

### Status de segurança do V1

- `Auth.proteger()` está ativo em todas as páginas internas
- `anonKey` do Supabase está exposta em `js/supabase-config.js` — isso é esperado (chave pública)
- RLS configurado no Supabase via `organization_id`/`user_id`
- Dados sensíveis (CPF, passaporte) armazenados em texto puro no `localStorage` e no JSONB

---

## 2. OBJETIVO DA V2

A V2 é uma **reconstrução limpa**. O V1 valida o que a Voecomkennedy precisa operacionalmente — as regras de negócio estão certas. O que muda é a arquitetura.

**Problema central do V1**: tudo está em um JSONB por usuário, sem relações, sem consultas SQL, sem escala, sem auditoria.

**Solução da V2**: banco relacional normalizado no Supabase, SPA React com TypeScript, RLS por `organization_id`, roles reais, entidade central `Reserva`.

### O que a V2 não é

- Não é uma refatoração do código V1
- Não é uma cópia do V1 com React por cima
- O código do V1 serve como **especificação funcional**, não como base de código

---

## 3. STACK DEFINIDA PARA A V2

Não altere essas escolhas sem autorização explícita do responsável do projeto.

| Camada | Tecnologia |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Estilo | Tailwind CSS + shadcn/ui |
| Roteamento | React Router v6 |
| Estado global | Zustand |
| Fetching/cache | TanStack Query (React Query) |
| Formulários | React Hook Form |
| Validação | Zod |
| Backend | Supabase (Auth + PostgreSQL + Storage) |
| PDF | @react-pdf/renderer |
| Gráficos | Recharts |
| Testes | Vitest + React Testing Library |
| CI/CD | GitHub Actions |
| Deploy | Cloudflare Pages |

**Não adicione** outras bibliotecas de estado (Redux, MobX, Jotai), outros frameworks de UI (Material UI, Chakra, Ant Design), outros ORMs ou clientes de banco.

---

## 4. ARQUITETURA PLANEJADA

### Entidade central: Reserva

`Reserva` substitui Vendas, Pacotes e Cotações. É o núcleo do sistema.

```
tipo_reserva: 'aereo' | 'pacote' | 'hotel' | 'servico' | 'milhas'

status:       'cotacao' → 'confirmada' → 'em_operacao' → 'concluida'
                                    └──────────────────→ 'cancelada'
```

- `cotacao` substitui o módulo de Cotações do V1
- `confirmada` corresponde a uma Venda ou Pacote do V1
- Dados específicos por tipo vivem em tabelas filhas ou no campo `metadados jsonb`

### Tabelas do banco (11 no total)

| Tabela | Tem `organization_id`? | RLS? |
|---|---|---|
| `organizations` | — (é a org) | Não (acesso via auth) |
| `profiles` | Sim | Sim — política especial (ver seção 5) |
| `clientes` | Sim | Sim |
| `reservas` | Sim | Sim |
| `reserva_trechos` | Sim | Sim |
| `reserva_passageiros` | Sim | Sim |
| `reserva_acomodacoes` | Sim | Sim |
| `financeiro_lancamentos` | Sim | Sim |
| `documentos` | Sim | Sim |
| `fornecedores` | Sim | Sim |
| `aeroportos` | Não | Não (seed global público) |

O schema SQL completo está no `PLANO_V2_VOECOMKENNEDY.md`, seção 6.

### Estrutura de pastas esperada (V2)

```
src/
├── components/        # Componentes reutilizáveis (UI puro, sem lógica de negócio)
│   ├── ui/            # Componentes shadcn/ui customizados
│   └── shared/        # Componentes de produto compartilhados (ex: AeroportoSelect)
├── features/          # Módulos por domínio
│   ├── reservas/
│   ├── clientes/
│   ├── financeiro/
│   ├── operacional/
│   ├── documentos/
│   └── configuracoes/
├── hooks/             # Hooks reutilizáveis (useAuth, useOrganization, etc.)
├── lib/               # Utilitários puros (validação CPF, formatação de data, etc.)
├── pages/             # Componentes de página (um por rota)
├── store/             # Zustand stores
├── types/             # Tipos TypeScript globais e tipos gerados pelo Supabase
└── main.tsx
```

### Roteamento e proteção

- Toda rota interna deve estar dentro de um `<ProtectedRoute>` que verifica sessão ativa
- Rotas restritas por role usam um `<RequireRole role="admin">` wrapper
- Nunca redirecionar para login com lógica inline em páginas — centralizar no router

---

## 5. REGRAS DE SUPABASE E RLS

### Regra mais importante

**Todo dado gravado no Supabase deve ter `organization_id` correspondente ao usuário logado.**
Nunca gravar sem `organization_id`. Nunca ler sem filtrar por `organization_id` (o RLS faz isso, mas a query explícita serve como camada extra e documentação).

### Política RLS padrão (todas as tabelas com `organization_id`)

```sql
-- SELECT
USING (
  organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
)

-- INSERT
WITH CHECK (
  organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
)
```

### Política especial para `profiles`

A policy padrão é auto-referencial em `profiles` e falha no bootstrap (quando o perfil ainda não existe). Use as quatro policies específicas:

```sql
-- Usuário lê o próprio perfil (bootstrap funciona aqui)
FOR SELECT USING (id = auth.uid());

-- Usuário lê outros perfis da mesma org
FOR SELECT USING (
  organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

-- Usuário cria apenas o próprio perfil
FOR INSERT WITH CHECK (id = auth.uid());

-- Admin atualiza qualquer perfil da org; usuário atualiza o próprio
FOR UPDATE USING (
  id = auth.uid()
  OR (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
);
```

> O perfil deve ser criado via trigger ou Edge Function no momento do signup — nunca depender de que o frontend crie o profile antes que o RLS precise dele.

### Storage (bucket `documentos-privados`)

- O bucket `documentos-privados` é **PRIVATE** — nunca torná-lo público
- Arquivos são acessados exclusivamente via **signed URLs** com TTL de 1 hora
- Path padrão dos arquivos: `{organization_id}/{reserva_id}/{nome_arquivo}`
- A policy de Storage filtra por `(storage.foldername(name))[1] = organization_id::text`
- **Nunca retornar a URL pública de um arquivo deste bucket para o frontend**

### `margem_lucro` não é coluna gerada

A coluna `margem_lucro` em `reservas` é uma coluna regular, **não** `GENERATED ALWAYS AS`.
Motivo: GENERATED ALWAYS impede override manual, o que quebra reservas de milhas (custo zero), descontos externos e ajustes contábeis.
A aplicação calcula a margem antes de cada insert/update com a fórmula:

```typescript
const margemLucro = valorVenda > 0
  ? ((valorVenda - valorCusto) / valorVenda) * 100
  : 0;
```

### `numero` da reserva

Por enquanto, `numero` é um `serial` global. Para SaaS futuro com múltiplas organizações, será necessário numeração por organização via trigger. Não assuma que o número é por org no MVP.

---

## 6. REGRAS DE SEGURANÇA

### Obrigatório em toda página/rota interna

- Verificar sessão ativa antes de renderizar qualquer conteúdo
- Redirecionar para `/login` se não autenticado
- Nunca exibir dados antes da verificação de auth completar

### Proibido

- Usar `localStorage` como fonte primária de dados na V2
- Expor `service_role_key` do Supabase em qualquer arquivo do frontend
- Criar buckets de Storage como públicos para arquivos de usuários
- Fazer queries no Supabase sem filtro por `organization_id` (mesmo que o RLS proteja, explicite na query)
- Gravar CPF, passaporte ou dados financeiros em logs ou console
- Desabilitar RLS em qualquer tabela sem aprovação explícita
- Usar `GENERATED ALWAYS AS` para `margem_lucro` (ver seção 5)

### Variáveis de ambiente

```
VITE_SUPABASE_URL=           # URL do projeto Supabase
VITE_SUPABASE_ANON_KEY=      # Chave anônima (pública, pode estar no frontend)
```

Nunca adicionar `SUPABASE_SERVICE_ROLE_KEY` a arquivos do frontend ou ao repositório.

### Dados sensíveis

Campos CPF, passaporte, data de nascimento e dados financeiros:
- Não logar no console
- Não incluir em mensagens de erro expostas ao usuário
- Não transmitir via query string de URL
- Mascarar em exibições de listagem quando possível (ex: `***.XXX.XXX-**`)

---

## 7. PADRÃO VISUAL VOECOMKENNEDY

### Identidade

- **Categoria**: SaaS / travel-tech / fintech
- **Referências**: Navan, Kiwi.com, Linear, Notion (densidade de informação + clareza)
- **Não é**: painel administrativo genérico, Bootstrap default, tema colorido/infantil

### Regras de design

- Interface densa mas legível — agências trabalham com muitos dados em pouco espaço
- Sidebar fixa com ícones + labels (não menu hamburger em desktop)
- Tabelas de dados com filtros inline, não modais de filtro
- Estados de loading explícitos (skeleton, não spinner genérico)
- Estados de erro informativos — nunca "Erro desconhecido"
- Formulários multi-step para reservas (não uma página gigante)

### Componentes prioritários para consistência

- Usar `shadcn/ui` como base — não criar componentes de UI do zero (Button, Input, Select, Dialog, Table, Badge, Card)
- Customizar via Tailwind, não sobrescrever classes do shadcn diretamente
- Paleta de cores: definir em `tailwind.config` com variáveis CSS — nunca cores hardcoded em componentes

### Companhias aéreas suportadas (V1, manter V2)

- GOL (`/logos/gol.png`)
- LATAM (`/logos/latam.png`)
- AZUL (`/logos/azul.png`)
- Genérico (fallback)

---

## 8. O QUE SERÁ REAPROVEITADO DO V1

Estes ativos têm valor e devem ser portados — nunca copiados diretamente, sempre adaptados para TypeScript.

| Ativo | Onde usar na V2 | Como portar |
|---|---|---|
| `aeroportos-data.js` — 247 aeroportos IATA | Seed SQL ou módulo TS | Converter para array tipado `Aeroporto[]` |
| Validação de CPF (`utils.js`) | `src/lib/validations.ts` | Extrair como função pura + validador Zod |
| `parseLocalDate` (`utils.js`) | `src/lib/dates.ts` | Portar para evitar bug de fuso horário |
| Formatação de datas BR (`utils.js`) | `src/lib/dates.ts` | Manter lógica, tipar com TypeScript |
| Lógica de urgência do check-in (`checkin.html`) | `src/hooks/useCheckinUrgencia.ts` | As regras (hoje/48h/7dias + cores) são as mesmas |
| Cálculo de margem de lucro | `src/lib/financeiro.ts` | Uma função pura: `calcularMargem(venda, custo)` |
| Logos GOL, LATAM, AZUL | `public/assets/airlines/` | Copiar os arquivos |
| `favicon.svg` | `public/` | Copiar |
| Estrutura visual do cartão de embarque | Referência para `@react-pdf/renderer` | Usar como spec, reescrever com a lib |
| Regras de negócio de vendas/pacotes/check-in | Especificação funcional | Ler o V1 para entender o comportamento esperado |

---

## 9. O QUE SERÁ DESCARTADO

Não tente salvar, portar ou adaptar estes itens.

| Item | Motivo |
|---|---|
| `localStorage` como dado primário | Anti-padrão, não escala, conflita com multi-user |
| `cloud-sync.js` e toda a lógica de sincronização | Dispensável com React Query + Supabase |
| JSONB monolítico (`dados_app.conteudo`) | Impede queries SQL, relatórios, auditoria |
| Páginas HTML separadas (MPA) | Substituídas por SPA com React Router |
| Navbar duplicada em 11 arquivos HTML | Um componente `<Sidebar />` |
| `clientes.html` | Duplicata, não vai para V2 |
| `diagnostico.html` | Debug. Substituído por Supabase Dashboard + logs |
| `backup.html` com JSON bruto | Substituído por exportação CSV/Excel |
| Cotações como entidade separada | Absorvida por `reservas.status = 'cotacao'` |
| Cartão de embarque como página separada | Ação dentro da tela de detalhes da Reserva |
| Pessoas como módulo principal | Absorvido por Clientes + Passageiros em Reservas |
| Vendas e Pacotes como entidades separadas | Unificados em `Reserva` com `tipo_reserva` |
| Código de compatibilidade com formato antigo (`migrarDadosAntigos`) | Script de migração pontual cobre isso |

---

## 10. O QUE NUNCA PODE SER ALTERADO SEM AUTORIZAÇÃO

As seguintes ações requerem aprovação explícita do responsável do projeto (Kennedy) antes de qualquer execução:

### Banco de dados de produção

- Alterar, dropar ou recriar tabelas no Supabase de produção
- Modificar ou desabilitar políticas RLS existentes
- Executar qualquer SQL de escrita (`INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`) no banco de produção
- Alterar o bucket `documentos-privados` (visibilidade, políticas, estrutura)

### Sistema V1

- Modificar qualquer arquivo `.html` ou `.js` do sistema atual além das correções de segurança já aprovadas
- Remover módulos do menu de navegação do V1
- Alterar `js/supabase-config.js` (URL e anonKey de produção)

### Infraestrutura

- Alterar `CNAME` ou configurações de domínio
- Modificar configurações do Cloudflare Pages
- Criar branches no padrão `main` ou `production` sem aprovação

### Dados de usuários

- Exportar, copiar ou transmitir dados reais de clientes, passageiros ou financeiro para ambientes externos
- Usar dados de produção em testes sem anonimização

---

## 11. COMO TRABALHAR EM BRANCHES E PRs

### Branches

```
main                          → produção, protegida
claude/<descricao>-<hash>     → branches de agente (este padrão)
feature/<descricao>           → features humanas
fix/<descricao>               → correções humanas
```

- Nunca fazer push direto para `main`
- Sempre criar branch antes de qualquer alteração
- Um PR por tema — não misturar feature + bugfix + refactor

### Commits

Usar prefixos semânticos:

```
feat:      nova funcionalidade
fix:       correção de bug
security:  correção de segurança
docs:      documentação
refactor:  refatoração sem mudança de comportamento
test:      adição ou correção de testes
chore:     tarefas de manutenção (deps, config, CI)
```

Exemplos:
```
feat: adicionar módulo de reservas tipo aéreo
fix: corrigir cálculo de margem em reservas sem custo
security: proteger rota de diagnóstico com Auth.proteger()
docs: adicionar plano V2 com arquitetura e schema
```

### Pull Requests

- Criar sempre como **draft** inicialmente
- Título: máximo 70 caracteres, começar com o prefixo semântico
- Corpo: resumo, contexto, como testar
- Converter para "ready for review" somente quando testado
- Não mergear sem revisão em mudanças que afetam Supabase, auth ou dados

### Antes de criar um PR

1. O código compila sem erros de TypeScript
2. `eslint` sem erros
3. Testes existentes passando (`vitest run`)
4. Nenhuma `console.log` de debug esquecida
5. Nenhuma chave ou credencial exposta no diff
6. Nenhuma alteração em arquivo fora do escopo da tarefa

---

## 12. CHECKLIST ANTES DE FINALIZAR QUALQUER TAREFA

Execute mentalmente esta lista antes de considerar uma tarefa concluída.

### Segurança

- [ ] Nenhuma `service_role_key` exposta em código frontend
- [ ] Nenhuma URL pública de Storage para arquivos privados
- [ ] Nenhum dado sensível (CPF, passaporte) em `console.log` ou mensagens de erro
- [ ] RLS ativo e testado para qualquer nova tabela criada
- [ ] Toda nova rota interna tem verificação de auth

### Banco de dados

- [ ] Todo insert inclui `organization_id` correto
- [ ] Toda query inclui filtro por `organization_id` (além do RLS)
- [ ] `margem_lucro` calculada na aplicação antes do insert (não GENERATED ALWAYS)
- [ ] Nenhuma migração executada em produção sem aprovação

### Código

- [ ] TypeScript sem erros (`tsc --noEmit`)
- [ ] Sem `any` implícito ou explícito sem justificativa documentada
- [ ] Componentes React sem prop drilling excessivo (use Zustand ou Context)
- [ ] Formulários validados com Zod antes do submit
- [ ] Estados de loading e erro tratados em toda query ao Supabase

### V1 (sistema atual)

- [ ] Nenhum arquivo do V1 foi alterado (exceto se a tarefa era explicitamente sobre o V1)
- [ ] O sistema V1 continua funcionando normalmente se a tarefa foi em paralelo

### Git

- [ ] Branch correta (não `main`)
- [ ] Commits com prefixo semântico
- [ ] PR criado (draft ou ready)
- [ ] Nenhum arquivo de ambiente (`.env`, `.env.local`) no commit

---

## REFERÊNCIA RÁPIDA

| Preciso de... | Onde encontrar |
|---|---|
| Schema SQL completo das 11 tabelas | `PLANO_V2_VOECOMKENNEDY.md`, seção 6 |
| Matriz de permissões por role | `PLANO_V2_VOECOMKENNEDY.md`, seção 7 |
| Fluxo de reserva (estados e transições) | `PLANO_V2_VOECOMKENNEDY.md`, seção 8 |
| Fluxo financeiro (lançamentos automáticos) | `PLANO_V2_VOECOMKENNEDY.md`, seção 9 |
| Plano de migração do V1 → V2 | `PLANO_V2_VOECOMKENNEDY.md`, seção 10 |
| Ordem de implementação das fases | `PLANO_V2_VOECOMKENNEDY.md`, seção 11 |
| Riscos técnicos mapeados | `PLANO_V2_VOECOMKENNEDY.md`, seção 12 |
| Checklist de pré-requisitos | `PLANO_V2_VOECOMKENNEDY.md`, seção 13 |

---

*Última atualização: 26/06/2026*
*Baseado na auditoria técnica do sistema V1 e no PLANO_V2_VOECOMKENNEDY.md.*
