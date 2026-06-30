import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Clock, PlaneTakeoff } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { LoadingState } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useAgendaCheckins } from '@/hooks/useOperacional'
import { hojeLocalISO, parseEmbarqueLocal } from '@/lib/operacionalUtils'
import { formatarData } from '@/lib/utils'

function urgencia(data: string | null, hora?: string | null): 'critico' | 'urgente' | 'atencao' | 'normal' {
  if (!data) return 'normal'
  const embarque = parseEmbarqueLocal(data, hora)
  const diffH = (embarque.getTime() - Date.now()) / 3600000
  if (diffH < 0)    return 'normal'
  if (diffH <= 24)  return 'critico'
  if (diffH <= 48)  return 'urgente'
  if (diffH <= 168) return 'atencao'
  return 'normal'
}

const URGENCIA_LABEL: Record<string, string> = {
  critico: 'Hoje / Crítico',
  urgente: 'Amanhã / Urgente',
  atencao: 'Esta semana',
  normal:  'Próximos dias',
}

const STATUS_RESERVA: Record<string, string> = {
  em_operacao: 'Em Operação',
  confirmada:  'Confirmada',
  concluida:   'Concluída',
}

export function OperacionalPage() {
  const hoje = hojeLocalISO()
  const agendaQuery = useAgendaCheckins(30)

  const itens = useMemo(() => {
    const lista = agendaQuery.data ?? []
    return lista
      .filter((i) => !i.trecho.data_embarque || i.trecho.data_embarque >= hoje)
      .map((i) => ({
        ...i,
        urg: urgencia(i.trecho.data_embarque, i.trecho.hora_embarque),
      }))
  }, [agendaQuery.data, hoje])

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Operacional</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Próximos embarques — 30 dias
          </p>
        </div>
        <Link to="/reservas">
          <Button size="sm" variant="outline">
            <PlaneTakeoff className="h-3.5 w-3.5" />
            Ver Reservas
          </Button>
        </Link>
      </div>

      {agendaQuery.isLoading && <LoadingState rows={5} />}

      {agendaQuery.error && (
        <Alert variant="destructive" title="Erro ao carregar agenda">
          {(agendaQuery.error as Error).message}
        </Alert>
      )}

      {!agendaQuery.isLoading && itens.length === 0 && (
        <EmptyState
          icon={<Clock className="h-6 w-6" />}
          title="Nenhum embarque nos próximos 30 dias"
          description="Reservas com trechos futuros aparecerão aqui automaticamente."
          action={
            <Link to="/reservas">
              <Button size="sm" variant="outline">Ir para Reservas</Button>
            </Link>
          }
        />
      )}

      {itens.length > 0 && (
        <div className="space-y-2">
          {itens.map((item) => (
            <Card key={item.reservaId}>
              <div className="flex items-center gap-4 px-4 py-3">
                {/* Urgência dot */}
                <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  item.urg === 'critico'  ? 'bg-destructive' :
                  item.urg === 'urgente'  ? 'bg-warning' :
                  item.urg === 'atencao'  ? 'bg-gold' :
                  'bg-muted-foreground/40'
                }`} />

                {/* Rota */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">
                      {item.trecho.origem_iata ?? '???'} → {item.trecho.destino_iata ?? '???'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      #{item.reservaNumero}
                    </span>
                    {item.trecho.companhia && (
                      <span className="text-xs text-muted-foreground">{item.trecho.companhia}</span>
                    )}
                    {item.trecho.numero_voo && (
                      <span className="font-mono text-xs text-muted-foreground">{item.trecho.numero_voo}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.clienteNome ?? '—'}
                    {item.trecho.data_embarque && (
                      <> · {formatarData(item.trecho.data_embarque)}{item.trecho.hora_embarque ? ` ${item.trecho.hora_embarque.slice(0, 5)}` : ''}</>
                    )}
                  </p>
                </div>

                {/* Badges */}
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={item.urg as 'critico' | 'urgente' | 'atencao' | 'normal'}>
                    {URGENCIA_LABEL[item.urg]}
                  </Badge>
                  {STATUS_RESERVA[item.reservaStatus] && (
                    <Badge variant={item.reservaStatus as 'em_operacao' | 'confirmada'}>
                      {STATUS_RESERVA[item.reservaStatus]}
                    </Badge>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center pt-2">
        Exibindo o primeiro trecho de ida por reserva.
        Para check-in detalhado, abra a reserva → aba Operacional.
      </p>
    </div>
  )
}
