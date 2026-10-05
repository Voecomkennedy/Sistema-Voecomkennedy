import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  PlaneTakeoff,
  Clock,
  Users,
  Wallet,
  FileText,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navPrincipal = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: PlaneTakeoff, label: 'Reservas', path: '/reservas' },
  { icon: Clock, label: 'Operacional', path: '/operacional' },
  { icon: Users, label: 'Clientes', path: '/clientes' },
  { icon: Wallet, label: 'Financeiro', path: '/financeiro' },
  { icon: FileText, label: 'Documentos', path: '/documentos' },
]

function NavItem({
  icon: Icon,
  label,
  path,
  end = false,
}: {
  icon: React.ElementType
  label: string
  path: string
  end?: boolean
}) {
  return (
    <NavLink
      to={path}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-active-foreground))]'
            : 'text-[hsl(var(--sidebar-muted-foreground))] hover:bg-[hsl(var(--sidebar-muted))] hover:text-[hsl(var(--sidebar-foreground))]',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </NavLink>
  )
}

export function Sidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))]">
      {/* Marca */}
      <div className="flex h-16 items-center gap-3 px-5 border-b border-[hsl(var(--sidebar-border))]">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--sidebar-active))] shrink-0">
          <PlaneTakeoff className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[hsl(var(--sidebar-foreground))]">
            Voecomkennedy
          </p>
          <p className="truncate text-xs text-[hsl(var(--sidebar-muted-foreground))]">
            Sistema de Reservas
          </p>
        </div>
      </div>

      {/* Navegação principal */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {navPrincipal.map(({ icon, label, path }) => (
          <NavItem
            key={path}
            icon={icon}
            label={label}
            path={path}
            end={path === '/'}
          />
        ))}
      </nav>

      {/* Rodapé: configurações (admin) */}
      <div className="border-t border-[hsl(var(--sidebar-border))] px-3 py-3">
        <NavItem icon={Settings} label="Configurações" path="/configuracoes" />
      </div>
    </aside>
  )
}
