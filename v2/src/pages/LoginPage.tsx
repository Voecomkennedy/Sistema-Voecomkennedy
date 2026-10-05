import { PlaneTakeoff } from 'lucide-react'

export function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--sidebar))] p-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Marca */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <PlaneTakeoff className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-[hsl(var(--sidebar-foreground))]">
            Voecomkennedy
          </h1>
          <p className="mt-1 text-sm text-[hsl(var(--sidebar-muted-foreground))]">
            Sistema de Reservas V2
          </p>
        </div>

        {/* Formulário — desabilitado até Fase 2 (Supabase Auth) */}
        <div className="rounded-xl border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-muted))] p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[hsl(var(--sidebar-foreground))]">
              E-mail
            </label>
            <input
              type="email"
              placeholder="seu@email.com"
              disabled
              className="w-full rounded-lg border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] px-3 py-2 text-sm text-[hsl(var(--sidebar-foreground))] placeholder-[hsl(var(--sidebar-muted-foreground))] opacity-60 cursor-not-allowed focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-[hsl(var(--sidebar-foreground))]">
              Senha
            </label>
            <input
              type="password"
              placeholder="••••••••"
              disabled
              className="w-full rounded-lg border border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] px-3 py-2 text-sm text-[hsl(var(--sidebar-foreground))] placeholder-[hsl(var(--sidebar-muted-foreground))] opacity-60 cursor-not-allowed focus:outline-none"
            />
          </div>

          <button
            type="button"
            disabled
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground opacity-50 cursor-not-allowed transition-opacity"
          >
            Entrar
          </button>

          <p className="text-center text-xs text-[hsl(var(--sidebar-muted-foreground))]">
            Autenticação Supabase será configurada na Fase 2
          </p>
        </div>

        <p className="text-center text-xs text-[hsl(var(--sidebar-muted-foreground))]">
          Sistema V1 disponível em{' '}
          <span className="text-[hsl(var(--sidebar-foreground))]">
            sistema.voecomkennedy.tur.br
          </span>
        </p>
      </div>
    </div>
  )
}
