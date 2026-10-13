import { Bell, User, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Header() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-6">
      {/* Breadcrumb placeholder — será populado por cada página */}
      <div className="text-sm text-muted-foreground" id="breadcrumb-slot" />

      <div className="flex items-center gap-2">
        {/* Notificações — funcionalidade futura */}
        <button
          type="button"
          className={cn(
            'relative flex h-8 w-8 items-center justify-center rounded-lg',
            'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          )}
          aria-label="Notificações"
        >
          <Bell className="h-4 w-4" />
        </button>

        {/* Usuário — será populado com dados reais na Fase 2 */}
        <button
          type="button"
          className={cn(
            'flex items-center gap-2 rounded-lg px-2 py-1',
            'text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          )}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="h-3.5 w-3.5" />
          </div>
          <span className="hidden text-xs font-medium sm:block">Usuário</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </div>
    </header>
  )
}
