import { useState, useEffect } from 'react'
import { Plane, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { useTrechos } from '@/hooks/useReservas'
import { useAtualizarMetadados } from '@/hooks/useOperacional'
import {
  getPrimeiroTrechoRepresentativo,
  calcularCheckin,
  formatarDataHoraLocal,
  hojeLocalISO,
  statusCheckinLabel,
} from '@/lib/operacionalUtils'
import type { CheckinStatus } from '@/lib/operacionalUtils'
import type { ReservaMetadados } from '@/services/operacionalService'
import type { Reserva } from '@/types/database'

interface OperacionalTabProps {
  reserva: Reserva
}

const STATUS_OPTIONS: CheckinStatus[] = ['pendente', 'lembrar', 'feito', 'dispensado']

export function OperacionalTab({ reserva }: OperacionalTabProps) {
  const trechosQuery = useTrechos(reserva.id)
  const atualizarMutation = useAtualizarMetadados()

  const metadados = (reserva.metadados ?? {}) as ReservaMetadados

  const [checkinStatus, setCheckinStatus] = useState<CheckinStatus>(
    metadados.checkin_status ?? 'pendente',
  )
  const [checkinObs, setCheckinObs] = useState(metadados.checkin_observacao ?? '')
  const [operacionalObs, setOperacionalObs] = useState(metadados.operacional_observacao ?? '')
  const [saved, setSaved] = useState(false)

  // Sincronizar estado quando a reserva mudar (reabrir modal)
  useEffect(() => {
    const m = (reserva.metadados ?? {}) as ReservaMetadados
    setCheckinStatus(m.checkin_status ?? 'pendente')
    setCheckinObs(m.checkin_observacao ?? '')
    setOperacionalObs(m.operacional_observacao ?? '')
    setSaved(false)
  }, [reserva.id, reserva.metadados])

  // Calcular próximo embarque em runtime
  const trechos = trechosQuery.data ?? []
  const hoje = hojeLocalISO()
  const trechosFuturos = trechos.filter((t) => t.data_embarque != null && t.data_embarque >= hoje)
  const trechoRep = getPrimeiroTrechoRepresentativo(trechosFuturos)
  const datas = trechoRep?.data_embarque
    ? calcularCheckin(trechoRep.data_embarque, trechoRep.hora_embarque)
    : null

  const handleSalvar = async () => {
    try {
      const patch: Partial<ReservaMetadados> = {
        checkin_status:        checkinStatus,
        checkin_observacao:    checkinObs || undefined,
        checkin_atualizado_em: new Date().toISOString(),
        operacional_observacao: operacionalObs || undefined,
      }
      await atualizarMutation.mutateAsync({ reservaId: reserva.id, patch })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // erro exibido via mutationError abaixo
    }
  }

  return (
    <div className="space-y-6">
      {/* Próximo embarque */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Plane className="h-3.5 w-3.5" />
          Próximo embarque
        </div>

        {trechosQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando trechos…</p>
        ) : datas && trechoRep ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">
              {trechoRep.origem_iata ?? '???'} → {trechoRep.destino_iata ?? '???'}
              {'  ·  '}
              {trechoRep.data_embarque
                ? trechoRep.data_embarque.split('-').reverse().join('/')
                : ''}
              {trechoRep.hora_embarque ? ` às ${trechoRep.hora_embarque.slice(0, 5)}` : ''}
            </p>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span>
                Check-in online:{' '}
                <span className="font-medium text-foreground">
                  {formatarDataHoraLocal(datas.checkin_recomendado_em)}
                </span>
                <span className="ml-1 text-xs">(48h antes)</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span>
                Chegar ao aeroporto:{' '}
                <span className="font-medium text-foreground">
                  {formatarDataHoraLocal(datas.chegada_aeroporto)}
                </span>
                <span className="ml-1 text-xs">(2h antes)</span>
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {trechos.length === 0
              ? 'Nenhum trecho cadastrado nesta reserva.'
              : 'Nenhum embarque futuro encontrado.'}
          </p>
        )}
      </div>

      {/* Status de check-in */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Status do check-in</p>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setCheckinStatus(opt)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                checkinStatus === opt
                  ? opt === 'feito'
                    ? 'bg-success-subtle text-success-subtle-foreground ring-1 ring-success/40'
                    : opt === 'lembrar'
                    ? 'bg-warning-subtle text-warning-subtle-foreground ring-1 ring-warning/40'
                    : opt === 'dispensado'
                    ? 'border border-border text-foreground bg-muted ring-1 ring-border'
                    : 'bg-muted text-foreground ring-1 ring-border'
                  : 'bg-transparent text-muted-foreground hover:bg-muted border border-border'
              }`}
            >
              {statusCheckinLabel(opt)}
            </button>
          ))}
        </div>
      </div>

      {/* Observação de check-in */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="checkin-obs">
          Observação de check-in
        </label>
        <textarea
          id="checkin-obs"
          rows={2}
          value={checkinObs}
          onChange={(e) => setCheckinObs(e.target.value)}
          placeholder="Ex: Passageiro precisa de assento especial, check-in feito dia 10/08…"
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0"
        />
      </div>

      {/* Observações operacionais */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="operacional-obs">
          Observações operacionais
        </label>
        <textarea
          id="operacional-obs"
          rows={3}
          value={operacionalObs}
          onChange={(e) => setOperacionalObs(e.target.value)}
          placeholder="Anotações internas sobre esta reserva: bagagem, transfer, necessidades especiais…"
          className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0"
        />
      </div>

      {/* Erro */}
      {atualizarMutation.error && (
        <Alert variant="destructive">
          {(atualizarMutation.error as Error).message ?? 'Erro ao salvar. Tente novamente.'}
        </Alert>
      )}

      {/* Sucesso */}
      {saved && (
        <Alert variant="success">Operacional salvo com sucesso.</Alert>
      )}

      {/* Ação */}
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSalvar}
          loading={atualizarMutation.isPending}
          disabled={atualizarMutation.isPending}
        >
          Salvar operacional
        </Button>
      </div>
    </div>
  )
}
