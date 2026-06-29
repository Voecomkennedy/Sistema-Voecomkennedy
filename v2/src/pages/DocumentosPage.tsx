import { FileText, PlaneTakeoff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function DocumentosPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <FileText className="h-7 w-7 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold text-foreground">Documentos de Viagem</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Os vouchers e documentos de reserva são gerados diretamente dentro de cada reserva,
        na aba <strong>Documento</strong>.
      </p>
      <div className="mt-6 rounded-lg border border-border bg-muted/40 px-5 py-4 text-left max-w-sm w-full">
        <p className="text-xs font-semibold text-foreground mb-2">Como acessar:</p>
        <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
          <li>Acesse <strong>Reservas</strong> no menu lateral</li>
          <li>Clique em uma reserva para abri-la</li>
          <li>Selecione a aba <strong>Documento</strong></li>
          <li>Use o botão <strong>Imprimir / Salvar PDF</strong></li>
        </ol>
      </div>
      <Link to="/reservas" className="mt-6">
        <Button size="sm">
          <PlaneTakeoff className="h-3.5 w-3.5" />
          Ir para Reservas
        </Button>
      </Link>
    </div>
  )
}
