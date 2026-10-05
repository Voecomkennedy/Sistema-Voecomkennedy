# Voecomkennedy V2

Reescrita completa do sistema de reservas da agência Voecomkennedy, construída sobre uma stack moderna com React 18 + TypeScript + Vite + Tailwind CSS + Supabase.

## Pré-requisitos

- Node.js 20+
- npm 10+

## Instalação

```bash
cd v2
npm install
```

## Configuração

Copie o arquivo de exemplo e preencha com as credenciais do Supabase:

```bash
cp .env.example .env
```

| Variável | Descrição |
|----------|-----------|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave anon pública |

> A `service_role_key` nunca deve estar no `.env` do frontend.

## Rodando localmente

```bash
npm run dev
```

Acesse [http://localhost:5173](http://localhost:5173).

## Outros comandos

```bash
npm run build        # build de produção (dist/)
npm run type-check   # checar tipos sem emitir arquivos
npm run lint         # ESLint
```

## Estrutura de pastas

```
v2/src/
├── components/
│   ├── layout/     # AppLayout, Sidebar, Header
│   ├── ui/         # componentes shadcn/ui (Fase 3+)
│   └── shared/     # componentes reutilizáveis cross-feature
├── features/       # módulos de domínio (reservas, clientes…)
├── hooks/          # custom hooks globais
├── lib/            # utils (cn, formatarData, validarCPF…)
├── pages/          # componentes de página roteados
├── router/         # definição de rotas (React Router v6)
├── store/          # estado global com Zustand
└── types/          # interfaces e tipos de domínio
```

## Status das fases

| Fase | Descrição | Status |
|------|-----------|--------|
| Fase 1 | Fundação (stack, estrutura, tipos, utils, layout) | ✅ Concluída |
| Fase 2 | Supabase Auth | Pendente |
| Fase 3 | Banco de dados + RLS | Pendente |
| Fase 4 | Módulo Clientes | Pendente |
| Fase 5 | Módulo Reservas | Pendente |
| Fase 6 | Módulo Operacional | Pendente |
| Fase 7 | Módulo Financeiro | Pendente |
| Fase 8 | Busca global | Pendente |
| Fase 9 | Módulo Documentos | Pendente |
| Fase 10 | Configurações | Pendente |
| Fase 11 | Notificações | Pendente |
| Fase 12 | Migração de dados do V1 | Pendente |
| Fase 13 | Go-live e encerramento do V1 | Pendente |

Consulte [`../PLANO_V2_VOECOMKENNEDY.md`](../PLANO_V2_VOECOMKENNEDY.md) para o roadmap completo.

## V1

O sistema V1 (HTML + Vanilla JS) continua em produção em `sistema.voecomkennedy.tur.br` e **não deve ser alterado** durante o desenvolvimento do V2. Os arquivos V1 estão na raiz do repositório (fora da pasta `/v2`).
