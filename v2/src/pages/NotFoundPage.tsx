import { Link } from 'react-router-dom'
import { PlaneTakeoff } from 'lucide-react'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <PlaneTakeoff className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground">
        Página não encontrada
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Esta rota não existe. Verifique o endereço ou volte ao dashboard.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        Voltar ao Dashboard
      </Link>
    </div>
  )
}
