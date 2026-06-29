import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { LoadingState } from '@/components/ui/skeleton'
import { useDocumentoReserva } from '@/hooks/useDocumento'
import { DocumentoReserva } from '@/components/reservas/DocumentoReserva'

// ── CSS de impressão ──────────────────────────────────────────
// visibility:hidden/visible preserva o React root no DOM — filhos podem
// sobrescrever a visibilidade ao contrário de display:none no body>*.

const PRINT_CSS = `
@media print {
  body * {
    visibility: hidden !important;
  }
  .documento-print-area,
  .documento-print-area * {
    visibility: visible !important;
  }
  .documento-print-area {
    position: fixed !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 20mm !important;
    background: white !important;
    color: black !important;
    box-shadow: none !important;
    border: none !important;
  }
  .documento-screen-controls {
    display: none !important;
  }
  .documento-bloco-trecho,
  .documento-bloco-passageiro,
  .documento-secao {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  a::after {
    content: '' !important;
  }
}
`

interface DocumentoReservaViewProps {
  reservaId: string
}

export function DocumentoReservaView({ reservaId }: DocumentoReservaViewProps) {
  const { data, isLoading, error } = useDocumentoReserva(reservaId)

  if (isLoading) return <LoadingState rows={4} />

  if (error) {
    return (
      <Alert variant="destructive" title="Erro ao carregar documento">
        {(error as Error).message}
      </Alert>
    )
  }

  if (!data) return null

  return (
    <>
      <style>{PRINT_CSS}</style>

      {/* Controles — ficam invisíveis na impressão via .documento-screen-controls */}
      <div className="documento-screen-controls mb-4 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.print()}
        >
          <Printer className="h-3.5 w-3.5" />
          Imprimir / Salvar PDF
        </Button>
      </div>

      {/* Área de impressão */}
      <div className="documento-print-area bg-white rounded-lg border border-border p-8 max-w-[760px] mx-auto">
        <DocumentoReserva data={data} />
      </div>
    </>
  )
}
