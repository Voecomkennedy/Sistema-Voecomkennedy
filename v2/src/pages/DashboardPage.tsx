import {
  PlaneTakeoff,
  Users,
  Wallet,
  Clock,
  FileText,
  Settings,
  CheckCircle2,
  Circle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuloCard {
  icon: React.ElementType
  titulo: string
  descricao: string
  fase: string
  status: 'pendente' | 'em_progresso' | 'concluido'
}

const modulos: ModuloCard[] = [
  {
    icon: PlaneTakeoff,
    titulo: 'Reservas',
    descricao: 'Entidade central. Substitui Vendas, Pacotes e Cotações. Tipos: aéreo, pacote, hotel, serviço, milhas.',
    fase: 'Fase 5',
    status: 'pendente',
  },
  {
    icon: Users,
    titulo: 'Clientes',
    descricao: 'Cadastro de clientes (PF/PJ) com histórico de reservas e autocomplete.',
    fase: 'Fase 4',
    status: 'pendente',
  },
  {
    icon: Clock,
    titulo: 'Operacional',
    descricao: 'Check-in, embarques por urgência (crítico/urgente/atenção), countdown em tempo real.',
    fase: 'Fase 6',
    status: 'pendente',
  },
  {
    icon: Wallet,
    titulo: 'Financeiro',
    descricao: 'Lançamentos automáticos por reserva, fluxo de caixa, relatórios exportáveis.',
    fase: 'Fase 7',
    status: 'pendente',
  },
  {
    icon: FileText,
    titulo: 'Documentos',
    descricao: 'Anexos por reserva via Supabase Storage privado, acesso por signed URL.',
    fase: 'Fase 9',
    status: 'pendente',
  },
  {
    icon: Settings,
    titulo: 'Configurações',
    descricao: 'Gestão de usuários, roles (admin/operacional/financeiro) e dados da agência.',
    fase: 'Fase 10',
    status: 'pendente',
  },
]

const fasesConcluidas = [
  'Fundação: Vite + React 18 + TypeScript + Tailwind CSS',
  'Estrutura de pastas definida (features, hooks, lib, types)',
  'Utilitários portados do V1: validarCPF, calcularMargem, formatarData, calcularUrgencia',
  'Tipos de domínio definidos (Reserva, Cliente, Lancamento…)',
  'Layout base: Sidebar fixa + Header + Outlet',
]

export function DashboardPage() {
  return (
    <div className="space-y-8">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Voecomkennedy V2 — fundação configurada, módulos em desenvolvimento.
        </p>
      </div>

      {/* Banner de status */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-amber-400/20 flex items-center justify-center">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              V2 em construção — Fase 1 (Fundação) concluída
            </p>
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
              Auth e banco de dados serão configurados nas fases 2 e 3.
              Consulte o PLANO_V2_VOECOMKENNEDY.md para o roadmap completo.
            </p>
          </div>
        </div>
      </div>

      {/* O que foi feito */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Fase 1 — Concluído
        </h2>
        <div className="rounded-lg border border-border bg-card p-4">
          <ul className="space-y-2">
            {fasesConcluidas.map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-sm text-foreground">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Módulos planejados */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Módulos — Próximas Fases
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modulos.map(({ icon: Icon, titulo, descricao, fase, status }) => (
            <div
              key={titulo}
              className={cn(
                'rounded-lg border bg-card p-4 transition-colors',
                status === 'concluido'
                  ? 'border-emerald-200 dark:border-emerald-800/50'
                  : 'border-border',
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {titulo}
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {fase}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {descricao}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <Circle className="h-3 w-3 text-muted-foreground/40" />
                <span className="text-xs text-muted-foreground">pendente</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
