import { Clock } from 'lucide-react'

interface PlaceholderPageProps {
  titulo: string
  fase: string
}

export function PlaceholderPage({ titulo, fase }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Clock className="h-7 w-7 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold text-foreground">{titulo}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Módulo planejado para o {fase} do roadmap V2.
      </p>
      <span className="mt-4 inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
        Em desenvolvimento
      </span>
    </div>
  )
}
