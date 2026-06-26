# PLANO V2 — SISTEMA VOECOMKENNEDY

> Documento de arquitetura e planejamento para reconstrução do sistema.
> Baseado na auditoria técnica realizada em 25/06/2026.
> Nenhum código deve ser implementado antes da aprovação deste plano.

---

## ÍNDICE

1. [Visão Geral da V2](#1-visão-geral-da-v2)
2. [O que será reaproveitado](#2-o-que-será-reaproveitado)
3. [O que será descartado](#3-o-que-será-descartado)
4. [Nova estrutura de menu](#4-nova-estrutura-de-menu)
5. [Módulos da V2](#5-módulos-da-v2)
6. [Modelo de banco de dados](#6-modelo-de-banco-de-dados)
7. [Regras de permissão](#7-regras-de-permissão)
8. [Fluxo de reserva](#8-fluxo-de-reserva)
9. [Fluxo financeiro](#9-fluxo-financeiro)
10. [Plano de migração dos dados atuais](#10-plano-de-migração-dos-dados-atuais)
11. [Ordem de implementação](#11-ordem-de-implementação)
12. [Riscos técnicos](#12-riscos-técnicos)
13. [Checklist antes de iniciar desenvolvimento](#13-checklist-antes-de-iniciar-desenvolvimento)

---

## 1. VISÃO GERAL DA V2

### Conceito

A V2 é uma reconstrução limpa. O sistema atual valida operacionalmente o que a Voecomkennedy precisa — os fluxos de negócio são sólidos. O que muda é a arquitetura: sai a estrutura monolítica de páginas HTML separadas com localStorage como fonte de dados, entra uma SPA React com banco de dados relacional normalizado e preparação para SaaS.

### Princípios da V2

- **Reserva como entidade central.** Tudo gira em torno da reserva: cliente, passageiros, trechos, financeiro, documentos, check-in.
- **Banco de dados como fonte de verdade.** Nada de localStorage como dado primário. Supabase é a fonte definitiva.
- **Multi-tenant desde o início.** Cada agência é uma `organization`. O RLS garante isolamento total por `organization_id`.
- **Roles reais.** Três perfis com permissões distintas: `admin`, `operacional`, `financeiro`.
- **Design SaaS/travel-tech.** Visual premium, não genérico. Referências: Notion, Linear, Kiwi.com, Navan.
- **Preparado para crescer.** Estrutura que suporta múltiplos usuários por agência, futura cobrança por assinatura e expansão de funcionalidades sem refatoração.

### Stack técnica

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Framework | React 18 + TypeScript | Componentes reutilizáveis, tipagem, ecossistema |
| Build | Vite | Rápido, simples, suporte nativo a TypeScript |
| Estilo | Tailwind CSS + shadcn/ui | Design system consistente, componentes acessíveis |
| Roteamento | React Router v6 | Padrão consolidado, suporte a rotas protegidas |
| Estado global | Zustand | Leve, simples, sem boilerplate |
| Fetching/cache | TanStack Query (React Query) | Cache, revalidação, estados de loading/erro |
| Formulários | React Hook Form | Performance, validação desacoplada |
| Validação | Zod | Tipagem em runtime, integração com RHF |
| Backend | Supabase | Auth, banco PostgreSQL, Storage, RLS |
| PDF | react-pdf ou @react-pdf/renderer | Geração de PDF de cartão/voucher |
| Gráficos | Recharts | Leve, declarativo, bom com React |
| Testes | Vitest + React Testing Library | Compatível com Vite, padrão atual |
| CI/CD | GitHub Actions | Lint, type-check, testes antes do deploy |
| Deploy | Cloudflare Pages | Manter o que já funciona |
| Domínio | sistema.voecomkennedy.tur.br | Manter |

---

## 2. O QUE SERÁ REAPROVEITADO

Código atual que tem valor e pode ser portado (não copiado — portado com adaptações):

| Ativo | Como reaproveitar |
|---|---|
| Base de 247 aeroportos IATA (`aeroportos-data.js`) | Converter para JSON tipado. Servir como seed ou como módulo TypeScript. |
| Validação de CPF (`utils.js`) | Extrair a função, tipar em TypeScript, usar como validador Zod customizado. |
| `parseLocalDate` e formatações de data (`utils.js`) | Portar como utilitários TypeScript. Evitar o mesmo problema de fuso horário. |
| Lógica de urgência do check-in (`checkin.html`) | Reescrever como hook `useCheckinUrgencia()`. Cores e regras são as mesmas. |
| Cálculo de margem de lucro | Uma linha. Portar como função pura tipada. |
| Conceito de debounce no cloud-sync | React Query com `staleTime` resolve isso nativamente — mas o conceito é o mesmo. |
| Regras de negócio de vendas/pacotes | Usar como especificação funcional. As regras valem, o código não. |
| Logos das companhias aéreas (GOL, LATAM, AZUL) | Mover para `public/assets/airlines/`. |
| Favicon SVG | Manter. |
| Lógica de geração de PDF de cartão | Reescrever com `@react-pdf/renderer`. A estrutura visual pode ser referência. |

---

## 3. O QUE SERÁ DESCARTADO

| Item | Por quê descartar |
|---|---|
| `localStorage` como dado primário | Anti-padrão com Supabase. Causa conflitos, não escala para múltiplos usuários simultâneos. |
| Estrutura JSONB monolítica (`dados_app.conteudo`) | Impede consultas SQL, relatórios, filtros e auditoria. |
| `cloud-sync.js` | Dispensável com React Query + Supabase Realtime. |
| Páginas HTML separadas (MPA) | Substituídas por SPA com React Router. |
| Navbar duplicada em 11 arquivos | Um único componente `<Sidebar />`. |
| `clientes.html` | Duplicata já no sistema atual. Não vai para V2. |
| `diagnostico.html` | Ferramenta de debug. Substituída por logs estruturados e Supabase Dashboard. |
| `backup.html` com JSON | Substituído por exportação nativa (CSV/Excel) e backup automático do Supabase. |
| Cotações como aba separada | Absorvida pela entidade Reserva com `status: 'cotacao'`. |
| Cartão de embarque como aba separada | Ação dentro da Reserva: botão "Gerar cartão". |
| Pessoas como módulo principal isolado | Absorvida por Clientes (quem paga) e Passageiros (vinculados à reserva). |
| Vendas e Pacotes como entidades separadas | Unificadas em Reserva com `tipo_reserva`. |
| Compatibilidade com formato de dados antigo | Script de migração cobre isso. Sem código legado no sistema novo. |

---

## 4. NOVA ESTRUTURA DE MENU

```
VOECOMKENNEDY
│
├── Dashboard
│
├── Reservas
│   ├── Todas as reservas
│   ├── Nova reserva
│   └── [Filtros por tipo e status no próprio módulo]
│
├── Operacional
│   ├── Check-in hoje
│   ├── Próximos embarques
│   └── Pendências
│
├── Clientes
│   └── Cadastro de clientes
│
├── Financeiro
│   ├── Lançamentos
│   ├── Fluxo de caixa
│   └── Relatórios
│
├── Documentos
│   └── Arquivos e anexos por reserva
│
└── Configurações  [admin only]
    ├── Usuários e permissões
    ├── Dados da agência
    └── Integrações
```

### O que saiu do menu

| Item removido | Substituído por |
|---|---|
| Vendas | Reservas (tipo: aéreo) |
| Pacotes | Reservas (tipo: pacote) |
| Cotações | Reservas (status: cotação) |
| Pessoas | Clientes + Passageiros dentro de Reservas |
| Cartão de embarque | Ação dentro de cada Reserva |
| Backup | Exportação em Financeiro/Relatórios + backup automático Supabase |
| Diagnóstico | Removido |

---

## 5. MÓDULOS DA V2

### 5.1 Dashboard

- Resumo do mês: total faturado, total de custo, lucro, margem média
- Reservas por status (gráfico de rosca)
- Embarques nas próximas 48h (alerta operacional)
- Últimas reservas criadas (feed)
- Indicadores de performance: ticket médio, reservas por tipo
- Filtro rápido por período

### 5.2 Reservas

Módulo central. Substitui Vendas, Pacotes e Cotações.

**Tipos de reserva:**
- `aereo` — voos nacionais e internacionais
- `pacote` — voo + hotel combinados
- `hotel` — hospedagem isolada
- `servico` — transfer, seguro, vistos, passeios
- `milhas` — emissão por pontos/milhas

**Status da reserva:**
- `cotacao` — proposta não confirmada (substitui módulo de Cotações)
- `confirmada` — paga/garantida pelo cliente
- `em_operacao` — em andamento (check-in pendente, documentos sendo processados)
- `concluida` — viagem realizada
- `cancelada` — cancelada (com ou sem reembolso)

**Funcionalidades por reserva:**
- Dados do cliente (busca ou cadastro inline)
- Lista de passageiros (vinculados ou avulsos)
- Trechos (origem, destino, companhia, voo, data, hora, localizador)
- Acomodação (hotel, diárias, regime) — para tipo pacote e hotel
- Valores: venda, custo, margem calculada automaticamente
- Status de pagamento do cliente
- Cartão de embarque (botão de gerar PDF)
- Histórico de alterações
- Documentos anexados
- Campo de observações

### 5.3 Operacional (Check-in)

- Lista de reservas confirmadas com embarque próximo
- Filtros: hoje / 24h / 48h / 7 dias
- Indicador visual de urgência (verde / amarelo / vermelho)
- Countdown em tempo real
- Marcação de check-in realizado

### 5.4 Clientes

- Cadastro de clientes (pessoa física ou jurídica)
- Histórico de reservas por cliente
- Dados: nome, CPF/CNPJ, email, telefone, endereço, passaporte, data de nascimento
- Busca e autocomplete para uso nos formulários de reserva

### 5.5 Financeiro

**Lançamentos:**
- Cada reserva gera automaticamente lançamentos de receita (valor venda) e custo (valor custo)
- Lançamentos manuais possíveis (despesas operacionais, receitas avulsas)
- Status: pendente, recebido, pago, em atraso
- Data de vencimento e data de liquidação

**Fluxo de caixa:**
- Visão por período (semana, mês, trimestre)
- Saldo projetado x realizado
- Gráfico de barras: entradas vs saídas

**Relatórios:**
- Resumo por período
- Ranking de clientes por volume
- Reservas por tipo
- Margem por consultor
- Exportação em CSV/Excel

### 5.6 Documentos

- Upload de arquivos por reserva (bilhetes, vouchers, apólices de seguro, passaportes)
- Armazenamento via Supabase Storage
- Tipos: PDF, imagem, doc
- Visualização inline

### 5.7 Configurações (admin)

- Dados da agência (nome, CNPJ, endereço, logo)
- Gestão de usuários (convidar, definir role, revogar acesso)
- Configurações de notificação

---

## 6. MODELO DE BANCO DE DADOS

### Diagrama de entidades

```
organizations
    │
    ├── profiles (users com role)
    │
    ├── clientes
    │       └── reservas
    │               ├── reserva_trechos
    │               ├── reserva_passageiros
    │               ├── reserva_acomodacoes
    │               ├── financeiro_lancamentos
    │               └── documentos
    │
    ├── financeiro_lancamentos (avulsos)
    └── fornecedores
```

---

### Tabela: `organizations`

```sql
CREATE TABLE organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  cnpj        text,
  email       text,
  telefone    text,
  logo_url    text,
  criado_em   timestamptz DEFAULT now()
);
```

---

### Tabela: `profiles`

```sql
CREATE TABLE profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  nome            text NOT NULL,
  email           text NOT NULL,
  role            text NOT NULL CHECK (role IN ('admin', 'operacional', 'financeiro')),
  ativo           boolean DEFAULT true,
  criado_em       timestamptz DEFAULT now()
);
```

---

### Tabela: `clientes`

```sql
CREATE TABLE clientes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  tipo            text NOT NULL CHECK (tipo IN ('pessoa_fisica', 'pessoa_juridica')),
  nome            text NOT NULL,
  cpf_cnpj        text,
  rg              text,
  email           text,
  telefone        text,
  endereco        text,
  passaporte      text,
  passaporte_venc date,
  nascimento      date,
  observacoes     text,
  criado_em       timestamptz DEFAULT now(),
  atualizado_em   timestamptz DEFAULT now()
);
```

---

### Tabela: `reservas`

```sql
CREATE TABLE reservas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id),
  numero            serial,                   -- número sequencial por organização
  tipo_reserva      text NOT NULL CHECK (tipo_reserva IN (
                      'aereo', 'pacote', 'hotel', 'servico', 'milhas'
                    )),
  status            text NOT NULL DEFAULT 'cotacao' CHECK (status IN (
                      'cotacao', 'confirmada', 'em_operacao', 'concluida', 'cancelada'
                    )),
  cliente_id        uuid REFERENCES clientes(id),
  consultor_id      uuid REFERENCES profiles(id),
  data_reserva      date NOT NULL DEFAULT CURRENT_DATE,
  data_embarque     date,
  data_retorno      date,
  valor_venda       numeric(12,2) DEFAULT 0,
  valor_custo       numeric(12,2) DEFAULT 0,
  margem_lucro      numeric(5,2) GENERATED ALWAYS AS (
                      CASE WHEN valor_venda > 0
                      THEN ROUND(((valor_venda - valor_custo) / valor_venda * 100), 2)
                      ELSE 0 END
                    ) STORED,
  observacoes       text,
  cancelado_em      timestamptz,
  motivo_cancelamento text,
  criado_em         timestamptz DEFAULT now(),
  atualizado_em     timestamptz DEFAULT now()
);
```

---

### Tabela: `reserva_trechos`

```sql
CREATE TABLE reserva_trechos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id      uuid NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  ordem           smallint NOT NULL DEFAULT 1,   -- 1=ida, 2=volta, 3=conexão
  sentido         text CHECK (sentido IN ('ida', 'volta', 'conexao')),
  origem          text NOT NULL,                 -- código IATA
  destino         text NOT NULL,
  companhia       text,
  numero_voo      text,
  data_embarque   date,
  hora_embarque   time,
  data_chegada    date,
  hora_chegada    time,
  localizador     text,
  criado_em       timestamptz DEFAULT now()
);
```

---

### Tabela: `reserva_passageiros`

```sql
CREATE TABLE reserva_passageiros (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id      uuid NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  cliente_id      uuid REFERENCES clientes(id), -- se já cadastrado
  nome            text NOT NULL,
  cpf             text,
  passaporte      text,
  passaporte_venc date,
  nascimento      date,
  criado_em       timestamptz DEFAULT now()
);
```

---

### Tabela: `reserva_acomodacoes`

```sql
CREATE TABLE reserva_acomodacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id      uuid NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  hotel           text NOT NULL,
  cidade          text,
  checkin         date,
  checkout        date,
  diarias         smallint,
  regime          text,   -- cafe, meia-pensao, pensao-completa, all-inclusive
  valor_diaria    numeric(10,2),
  voucher         text,
  criado_em       timestamptz DEFAULT now()
);
```

---

### Tabela: `financeiro_lancamentos`

```sql
CREATE TABLE financeiro_lancamentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  reserva_id      uuid REFERENCES reservas(id), -- null = lançamento avulso
  tipo            text NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  categoria       text,        -- passagem, hotel, taxa, seguro, comissão, etc.
  descricao       text NOT NULL,
  valor           numeric(12,2) NOT NULL,
  status          text NOT NULL DEFAULT 'pendente' CHECK (status IN (
                    'pendente', 'recebido', 'pago', 'em_atraso', 'cancelado'
                  )),
  vencimento      date,
  liquidado_em    date,
  forma_pagamento text,        -- pix, cartão, boleto, transferência
  criado_por      uuid REFERENCES profiles(id),
  criado_em       timestamptz DEFAULT now(),
  atualizado_em   timestamptz DEFAULT now()
);
```

---

### Tabela: `documentos`

```sql
CREATE TABLE documentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  reserva_id      uuid REFERENCES reservas(id) ON DELETE CASCADE,
  cliente_id      uuid REFERENCES clientes(id),
  nome            text NOT NULL,
  tipo            text,        -- bilhete, voucher, apolice, passaporte, outro
  storage_path    text NOT NULL,  -- caminho no Supabase Storage
  tamanho_bytes   bigint,
  mime_type       text,
  enviado_por     uuid REFERENCES profiles(id),
  criado_em       timestamptz DEFAULT now()
);
```

---

### Tabela: `fornecedores`

```sql
CREATE TABLE fornecedores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  tipo            text CHECK (tipo IN ('companhia_aerea', 'hotel', 'operadora', 'outro')),
  nome            text NOT NULL,
  cnpj            text,
  contato         text,
  email           text,
  criado_em       timestamptz DEFAULT now()
);
```

---

### Tabela: `aeroportos` (seed, sem RLS)

```sql
CREATE TABLE aeroportos (
  iata    char(3) PRIMARY KEY,
  nome    text NOT NULL,
  cidade  text NOT NULL,
  pais    text NOT NULL,
  uf      char(2)  -- apenas Brasil
);
```

---

## 7. REGRAS DE PERMISSÃO

### Roles

| Role | Descrição |
|---|---|
| `admin` | Acesso total. Gerencia usuários, configurações e todos os dados. |
| `operacional` | Cria e edita reservas, gerencia check-in. Não vê relatórios financeiros detalhados. |
| `financeiro` | Acesso ao módulo financeiro completo e relatórios. Visualiza reservas (somente leitura). |

### Matriz de permissões

| Ação | admin | operacional | financeiro |
|---|---|---|---|
| Ver dashboard | ✅ | ✅ | ✅ |
| Criar/editar reserva | ✅ | ✅ | ❌ |
| Cancelar reserva | ✅ | ✅ | ❌ |
| Ver todas as reservas | ✅ | ✅ | ✅ (somente leitura) |
| Gerenciar check-in | ✅ | ✅ | ❌ |
| Ver módulo financeiro | ✅ | ❌ | ✅ |
| Criar lançamentos manuais | ✅ | ❌ | ✅ |
| Exportar relatórios | ✅ | ❌ | ✅ |
| Gerenciar clientes | ✅ | ✅ | ❌ |
| Upload de documentos | ✅ | ✅ | ❌ |
| Gerenciar usuários | ✅ | ❌ | ❌ |
| Configurações da agência | ✅ | ❌ | ❌ |

### RLS — Política base para todas as tabelas

Toda tabela com `organization_id` terá:

```sql
-- Leitura: apenas da própria organização
CREATE POLICY "org_select" ON <tabela>
  FOR SELECT USING (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Escrita: apenas da própria organização
CREATE POLICY "org_insert" ON <tabela>
  FOR INSERT WITH CHECK (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Atualização e deleção: idem
```

Restrições por role serão aplicadas via `auth.jwt() ->> 'role'` ou via checagem de `profiles.role` dentro das políticas de UPDATE/DELETE específicas.

---

## 8. FLUXO DE RESERVA

```
[COTAÇÃO]
  Cliente solicita orçamento
  Consultor cria reserva com status "cotacao"
  Sistema gera número de reserva (ex: VCK-2026-0042)
  Financeiro não é afetado ainda
        │
        ▼ cliente aprova
[CONFIRMADA]
  Status muda para "confirmada"
  Lançamentos financeiros criados automaticamente
    → Receita: valor_venda (status: pendente)
    → Custo: valor_custo (status: pendente)
  Passageiros vinculados definitivamente
  Localizadores registrados
        │
        ▼ checkin se aproxima
[EM OPERAÇÃO]
  Status muda automaticamente quando embarque < 48h
  Aparece no painel de Operacional/Check-in
  Consultor registra check-in realizado
        │
        ▼ viagem realizada
[CONCLUÍDA]
  Status atualizado manualmente ou por data
  Lançamentos marcados como recebido/pago
  Reserva arquivada mas consultável
        │
        ◄─── a qualquer momento ───►
[CANCELADA]
  Status muda para "cancelada"
  Motivo registrado
  Lançamentos cancelados ou ajustados (reembolso parcial possível)
```

### Geração de cartão de embarque

- Disponível em qualquer reserva do tipo `aereo` ou `pacote` com status `confirmada` ou superior
- Botão "Gerar cartão" dentro da tela de detalhes da reserva
- Abre modal com preview e opção de download PDF
- Layout mantém identidade visual da companhia aérea (GOL, LATAM, AZUL, genérico)

---

## 9. FLUXO FINANCEIRO

### Criação automática de lançamentos

Ao confirmar uma reserva, o sistema cria automaticamente:

```
Reserva confirmada
  → Lançamento RECEITA
      descricao: "Reserva VCK-2026-0042 — [cliente]"
      valor: valor_venda
      tipo: receita
      status: pendente
      vencimento: data_reserva + 3 dias (configurável)

  → Lançamento CUSTO
      descricao: "Custo — Reserva VCK-2026-0042"
      valor: valor_custo
      tipo: despesa
      status: pendente
      vencimento: data_embarque - 7 dias (configurável)
```

### Fluxo de caixa

```
ENTRADAS (receitas)          SAÍDAS (despesas)
─────────────────────        ─────────────────────
Receitas de reservas         Custos de reservas
Receitas avulsas             Despesas operacionais
                             Comissões

           SALDO DO PERÍODO
        = Entradas − Saídas

     SALDO ACUMULADO
  = Saldo anterior + Saldo do período
```

### Indicadores do dashboard financeiro

- Faturamento bruto do mês
- Custo total do mês
- Lucro líquido do mês
- Margem média (%)
- Receitas a receber (pendentes)
- Custos a pagar (pendentes)
- Reservas em atraso

---

## 10. PLANO DE MIGRAÇÃO DOS DADOS ATUAIS

### Contexto atual

Os dados estão armazenados no Supabase em uma única tabela `dados_app`, coluna `conteudo` (JSONB), com a estrutura:

```json
{
  "emissao_vendas": [...],
  "emissao_pessoas": [...],
  "emissao_pacotes": [...],
  "emissao_cotacoes": [...]
}
```

### Etapas de migração

**Etapa M1 — Exportar dados atuais**
- Exportar o JSONB completo do Supabase para arquivo JSON local
- Fazer backup manual antes de qualquer alteração

**Etapa M2 — Criar script de transformação**

Script em TypeScript (Node.js) que lê o JSON e gera inserts SQL:

| Origem (sistema atual) | Destino (V2) | Observações |
|---|---|---|
| `emissao_pessoas` onde `tipo = 'cliente'` | `clientes` | Mapear campos diretos |
| `emissao_pessoas` onde `tipo = 'passageiro'` | `reserva_passageiros` | Vincular à reserva se possível |
| `emissao_pessoas` onde `tipo = 'fornecedor'` | `fornecedores` | Manter como referência |
| `emissao_vendas` | `reservas` com `tipo_reserva = 'aereo'` e `status = 'confirmada'` | Criar trechos em `reserva_trechos` |
| `emissao_pacotes` | `reservas` com `tipo_reserva = 'pacote'` e `status = 'confirmada'` | Criar trechos + acomodações |
| `emissao_cotacoes` onde `status = 'pendente'` | `reservas` com `status = 'cotacao'` | — |
| `emissao_cotacoes` onde `status = 'convertida'` | Ignorar ou marcar como `concluida` | Dados provavelmente já em vendas |

**Etapa M3 — Migração financeira**

Para cada venda/pacote migrado, criar automaticamente:
- 1 lançamento de receita (valor_venda)
- 1 lançamento de custo (valor_custo)
- Status: `recebido` se data de embarque < hoje, `pendente` se futura

**Etapa M4 — Validação**

- Contar registros antes e depois
- Verificar integridade referencial (cliente_id válido em cada reserva)
- Testar listagem, filtros e cálculos de margem
- Comparar total de faturamento entre sistema atual e V2

**Etapa M5 — Go-live**

- Manter sistema atual em modo leitura por 30 dias
- Novo sistema como principal desde o dia 1
- Após 30 dias sem problemas, desativar sistema atual

### Campos sem equivalente direto

| Campo atual | Situação |
|---|---|
| `localizadores[]` (array em vendas) | Migrar para `reserva_trechos.localizador` por trecho |
| `clienteViaja: boolean` | Se true, criar passageiro com dados do cliente |
| `textoEmail` em cotações | Descartar — campo auxiliar sem uso |
| Dados de backup exportado pelo usuário | Importar via script se necessário |

---

## 11. ORDEM DE IMPLEMENTAÇÃO

### Fase 1 — Fundação `~1 semana`

- [ ] Setup: Vite + React 18 + TypeScript + Tailwind + shadcn/ui
- [ ] Configurar React Router v6 com layout protegido
- [ ] Configurar Zustand (store de usuário e organização)
- [ ] Configurar TanStack Query
- [ ] Configurar cliente Supabase com tipos gerados
- [ ] Configurar Vitest + React Testing Library
- [ ] Configurar GitHub Actions: lint + type-check + testes

### Fase 2 — Auth e multi-tenant `~3 dias`

- [ ] Tela de login (email + senha)
- [ ] Tela de cadastro de nova organização (onboarding)
- [ ] Tabelas `organizations` e `profiles` no Supabase
- [ ] RLS base em todas as tabelas
- [ ] Hook `useAuth()` com role e organization
- [ ] Middleware de rota por role (admin, operacional, financeiro)
- [ ] Layout base: Sidebar + Header + área de conteúdo

### Fase 3 — Banco de dados `~2 dias`

- [ ] Criar todas as tabelas no Supabase (migration SQL versionada)
- [ ] Seed de aeroportos IATA (247 registros)
- [ ] Gerar tipos TypeScript com `supabase gen types`
- [ ] Ativar RLS em todas as tabelas
- [ ] Criar políticas RLS por organization_id

### Fase 4 — Módulo de Clientes `~3 dias`

- [ ] Listagem com busca e filtros
- [ ] Formulário de criação/edição com validação Zod
- [ ] Visualização de cliente com histórico de reservas
- [ ] Componente de busca/autocomplete para uso em Reservas

### Fase 5 — Módulo de Reservas `~2 semanas`

- [ ] Listagem com filtros (tipo, status, período, consultor)
- [ ] Criação de reserva — tipo aéreo (validação completa)
- [ ] Criação de reserva — tipo pacote
- [ ] Criação de reserva — tipo hotel
- [ ] Criação de reserva — tipo serviço
- [ ] Criação de reserva — tipo milhas
- [ ] Visualização de reserva com todos os dados
- [ ] Edição de reserva (campos e status)
- [ ] Cancelamento com motivo
- [ ] Geração de cartão de embarque (PDF) como ação dentro da reserva
- [ ] Vinculação de passageiros

### Fase 6 — Operacional / Check-in `~3 dias`

- [ ] Painel de embarques do dia
- [ ] Filtros: hoje / 48h / 7 dias
- [ ] Indicadores de urgência (semáforo visual)
- [ ] Countdown em tempo real
- [ ] Marcar check-in realizado

### Fase 7 — Financeiro `~1 semana`

- [ ] Criação automática de lançamentos ao confirmar reserva
- [ ] Listagem de lançamentos com filtros
- [ ] Edição de status (recebido, pago, cancelado)
- [ ] Criação de lançamentos manuais avulsos
- [ ] Fluxo de caixa por período (gráfico)
- [ ] Relatório mensal exportável (CSV)

### Fase 8 — Dashboard `~3 dias`

- [ ] KPIs: faturamento, custo, lucro, margem
- [ ] Gráfico de reservas por tipo
- [ ] Feed de últimas reservas
- [ ] Alerta de embarques próximos
- [ ] Receitas a receber / custos a pagar

### Fase 9 — Documentos `~2 dias`

- [ ] Upload de arquivos por reserva (Supabase Storage)
- [ ] Listagem de documentos por reserva
- [ ] Download e visualização inline

### Fase 10 — Configurações `~2 dias`

- [ ] Dados da agência
- [ ] Convidar usuário (email com link)
- [ ] Gerenciar roles de usuários
- [ ] Revogar acesso

### Fase 11 — Migração e go-live `~3 dias`

- [ ] Escrever e testar script de migração
- [ ] Executar migração em ambiente de staging
- [ ] Validar dados migrados
- [ ] Deploy em produção
- [ ] Período de transição (30 dias)

---

## 12. RISCOS TÉCNICOS

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Dados do sistema atual mal estruturados dificultam migração | Média | Alto | Exportar e auditar o JSON antes de escrever o script de migração |
| Campos de passageiro sem vínculo claro com a reserva | Alta | Médio | Mapear passageiros avulsos e criar regra de match por nome+CPF |
| RLS mal configurado deixa dados de uma organização visíveis para outra | Baixa | Crítico | Criar testes automatizados de isolamento de dados por organização |
| Performance ruim em listagens grandes de reservas | Baixa | Médio | Índices em `organization_id`, `status`, `data_embarque`; paginação obrigatória |
| Complexidade do formulário de reserva (múltiplos tipos) | Alta | Médio | Criar formulário por steps com validação por etapa |
| PDF de cartão de embarque com qualidade inferior ao atual | Média | Baixo | Prototipar o cartão como primeira entrega da Fase 5 |
| Conflito de sessão em múltiplas abas | Baixa | Baixo | React Query com invalidação por evento de foco |
| Custo do Supabase crescendo com Storage | Baixa | Baixo | Definir limite de upload e compressão de imagens no upload |
| Usuário não se adapta ao novo fluxo | Média | Médio | Período de transição de 30 dias com ambos sistemas ativos |

---

## 13. CHECKLIST ANTES DE INICIAR DESENVOLVIMENTO

### Produto e negócio

- [ ] Kennedy revisou e aprovou a nova estrutura de menu
- [ ] Kennedy confirmou os tipos de reserva necessários no lançamento (`aereo`, `pacote`, `hotel`, `servico`, `milhas`)
- [ ] Kennedy definiu quantos usuários/roles o sistema terá no lançamento
- [ ] Kennedy confirmou se o sistema precisa suportar múltiplas agências (SaaS real) desde o início ou apenas uma
- [ ] Foi definido o visual/referência de design (moodboard, paleta, referências como Navan/Kiwi)
- [ ] Foi definido se haverá tela de onboarding para novos usuários ou setup manual

### Infraestrutura

- [ ] Projeto Supabase de staging criado e separado do de produção
- [ ] Backup dos dados atuais exportado e armazenado com segurança
- [ ] Repositório do novo projeto criado (separado do sistema atual)
- [ ] Deploy pipeline configurado no Cloudflare Pages para o novo repositório
- [ ] Variáveis de ambiente definidas (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)

### Banco de dados

- [ ] RLS ativado no projeto Supabase de produção atual (validado no painel)
- [ ] Schema SQL da V2 revisado e aprovado antes de aplicar
- [ ] Decidido se aeroportos serão tabela seed ou arquivo estático TypeScript
- [ ] Definidas as categorias financeiras padrão (passagem, hotel, taxa, seguro, etc.)

### Código

- [ ] Acordo sobre convenções de código (naming, estrutura de pastas, imports)
- [ ] Acordo sobre gestão de branches (GitFlow ou trunk-based)
- [ ] Definido quem faz code review antes de merge

### Migração

- [ ] Script de migração escrito e testado em ambiente de staging com dados reais
- [ ] Validação cruzada: total de reservas e faturamento batem entre sistema antigo e novo
- [ ] Data de go-live definida
- [ ] Plano de rollback definido (o que fazer se algo der errado no go-live)

---

*Documento criado em 26/06/2026. Nenhum arquivo do sistema atual foi alterado.*
*Próximo passo: aprovação deste plano antes de iniciar a Fase 1.*
