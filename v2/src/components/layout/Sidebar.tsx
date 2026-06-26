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
  { icon: LayoutDashboard, label: 'Dashboard', path: '/', end: true },
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
          'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
          isActive
            ? 'bg-[hsl(var(--sidebar-active))] text-white shadow-sm'
            : 'text-[hsl(var(--sidebar-muted-foreground))] hover:bg-[hsl(var(--sidebar-muted))] hover:text-[hsl(var(--sidebar-foreground))]',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              'h-4 w-4 shrink-0 transition-colors',
              isActive ? 'text-white' : 'group-hover:text-[hsl(var(--sidebar-foreground))]',
            )}
          />
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  )
}

export function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))]">
      {/* Marca */}
      <div className="flex h-14 items-center gap-3 border-b border-[hsl(var(--sidebar-border))] px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--sidebar-active))]">
          <PlaneTakeoff className="h-3.5 w-3.5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-none text-[hsl(var(--sidebar-foreground))]">
            Voecomkennedy
          </p>
          <p className="mt-0.5 truncate text-[11px] text-[hsl(var(--sidebar-muted-foreground))]">
            Sistema V2
          </p>
        </div>
      </div>

      {/* Navegação principal */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {navPrincipal.map((item) => (
          <NavItem key={item.path} {...item} />
        ))}
      </nav>

      {/* Divider + Configurações */}
      <div className="border-t border-[hsl(var(--sidebar-border))] px-2 py-3">
        <NavItem icon={Settings} label="Configurações" path="/configuracoes" />
      </div>

      {/* User placeholder */}
      <div className="flex items-center gap-2.5 border-t border-[hsl(var(--sidebar-border))] px-3 py-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--sidebar-active))] text-xs font-bold text-white">
          K
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-[hsl(var(--sidebar-foreground))]">
            Kennedy
          </p>
          <p className="truncate text-[11px] text-[hsl(var(--sidebar-muted-foreground))]">
            Admin
          </p>
        </div>
      </div>
    </aside>
  )
}
