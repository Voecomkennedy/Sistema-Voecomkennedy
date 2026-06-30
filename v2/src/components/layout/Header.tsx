import { Bell, Search, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'

interface HeaderProps {
  title?: string
  breadcrumb?: { label: string }[]
}

export function Header({ title, breadcrumb }: HeaderProps) {
  const { profile } = useAuthStore()

  const iniciais = profile?.nome
    ? profile.nome.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : '?'

  const primeiroNome = profile?.nome?.split(' ')[0] ?? '—'

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-5">
      {/* Breadcrumb / título da página */}
      <div className="flex items-center gap-2 min-w-0">
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav className="flex items-center gap-1.5 text-sm">
            {breadcrumb.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-muted-foreground/40">/</span>}
                <span
                  className={cn(
                    i === breadcrumb.length - 1
                      ? 'font-medium text-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  {crumb.label}
                </span>
              </span>
            ))}
          </nav>
        ) : title ? (
          <h1 className="text-sm font-semibold text-foreground">{title}</h1>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        {/* Busca global — placeholder Fase 8 */}
        <div className="hidden sm:flex items-center gap-2 h-8 rounded-lg border border-border bg-muted/60 px-3 text-xs text-muted-foreground opacity-60 cursor-not-allowed select-none">
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span>Buscar…</span>
          <span className="ml-1 rounded border border-border px-1 text-[10px] font-mono">⌘K</span>
        </div>

        {/* Notificações */}
        <button
          type="button"
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Notificações"
          title="Notificações — em breve"
        >
          <Bell className="h-4 w-4" />
        </button>

        {/* Usuário */}
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
            {iniciais}
          </div>
          <span className="hidden text-xs font-medium sm:block">{primeiroNome}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </div>
    </header>
  )
}
