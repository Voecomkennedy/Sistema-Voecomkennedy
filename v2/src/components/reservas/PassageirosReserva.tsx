import { useState } from 'react'
import { UserCheck, Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingState } from '@/components/ui/skeleton'
import {
  usePassageirosReserva,
  useVincularPassageiro,
  useDesvincularPassageiro,
} from '@/hooks/useReservas'
import { usePassageiros } from '@/hooks/usePassageiros'

const tipoOptions = [
  { value: 'adulto',  label: 'Adulto'  },
  { value: 'crianca', label: 'Criança' },
  { value: 'bebe',    label: 'Bebê'    },
]

const tipoLabel: Record<string, string> = {
  adulto: 'Adulto',
  crianca: 'Criança',
  bebe: 'Bebê',
}

interface PassageirosReservaProps {
  reservaId: string
}

function mensagemErroVinculo(error: unknown): string {
  const e = error as { code?: string; message?: string }
  switch (e?.code) {
    case '23505': return 'Este passageiro já está vinculado a esta reserva.'
    case '42501': return 'Sem permissão para realizar esta operação.'
    default:      return e?.message ?? 'Erro inesperado. Tente novamente.'
  }
}

export function PassageirosReserva({ reservaId }: PassageirosReservaProps) {
  const [selectedPassageiro, setSelectedPassageiro] = useState('')
  const [selectedTipo, setSelectedTipo] = useState('adulto')

  const vinculadosQuery = usePassageirosReserva(reservaId)
  const passageirosQuery = usePassageiros()
  const vincularMutation = useVincularPassageiro()
  const desvincularMutation = useDesvincularPassageiro()

  const vinculados = vinculadosQuery.data ?? []
  const jaVinculadosIds = new Set(vinculados.map((v) => v.passageiro_id))

  const disponiveisOptions = [
    { value: '', label: 'Selecionar passageiro…' },
    ...(passageirosQuery.data ?? [])
      .filter((p) => !jaVinculadosIds.has(p.id))
      .map((p) => ({ value: p.id, label: p.nome })),
  ]

  const handleVincular = async () => {
    if (!selectedPassageiro) return
    try {
      await vincularMutation.mutateAsync({
        reservaId,
        passageiroId: selectedPassageiro,
        tipo: selectedTipo,
      })
      setSelectedPassageiro('')
      setSelectedTipo('adulto')
    } catch {
      // captured in vincularMutation.error
    }
  }

  const handleDesvincular = async (id: string, nome: string) => {
    if (!window.confirm(`Remover ${nome} desta reserva?`)) return
    try {
      await desvincularMutation.mutateAsync({ id, reservaId })
    } catch {
      // silently — row remains visible if delete failed
    }
  }

  if (vinculadosQuery.isLoading) return <LoadingState rows={3} />

  if (vinculadosQuery.error) {
    return (
      <Alert variant="destructive" title="Erro ao carregar passageiros">
        {(vinculadosQuery.error as Error).message}
      </Alert>
    )
  }

  return (
    <div className="space-y-4">
      {/* Lista de passageiros vinculados */}
      {vinculados.length === 0 ? (
        <EmptyState
          icon={<UserCheck className="h-6 w-6" />}
          title="Nenhum passageiro vinculado"
          description="Adicione os passageiros desta reserva abaixo."
        />
      ) : (
        <div className="space-y-2">
          {vinculados.map((v) => (
            <div
              key={v.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
            >
              <div className="flex-1 min-w-0">
                <span className="font-medium">{v.passageiros.nome}</span>
                {v.passageiros.cpf && (
                  <span className="ml-2 text-xs text-muted-foreground">{v.passageiros.cpf}</span>
                )}
                {v.passageiros.passaporte && (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {v.passageiros.passaporte}
                  </span>
                )}
              </div>
              <Badge variant="default">{tipoLabel[v.tipo] ?? v.tipo}</Badge>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                onClick={() => handleDesvincular(v.id, v.passageiros.nome)}
                disabled={desvincularMutation.isPending}
                aria-label={`Remover ${v.passageiros.nome}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Seção de adição */}
      <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Adicionar passageiro</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-40">
            <Select
              options={disponiveisOptions}
              value={selectedPassageiro}
              onChange={(e) => setSelectedPassageiro(e.target.value)}
            />
          </div>
          <div className="w-36">
            <Select
              options={tipoOptions}
              value={selectedTipo}
              onChange={(e) => setSelectedTipo(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            onClick={handleVincular}
            disabled={!selectedPassageiro || vincularMutation.isPending}
            loading={vincularMutation.isPending}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Adicionar
          </Button>
        </div>

        {vincularMutation.error && (
          <Alert variant="destructive">{mensagemErroVinculo(vincularMutation.error)}</Alert>
        )}
      </div>
    </div>
  )
}
