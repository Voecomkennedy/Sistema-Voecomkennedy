import { useState } from 'react'
import { PlaneTakeoff, Plus, Search, Pencil, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { Alert } from '@/components/ui/alert'
import { LoadingState } from '@/components/ui/skeleton'
import { ReservaModal } from '@/components/reservas/ReservaModal'
import { CheckinBadge } from '@/components/reservas/CheckinBadge'
import { useReservas } from '@/hooks/useReservas'
import { useAgendaCheckins } from '@/hooks/useOperacional'
import { formatarMoeda, formatarData } from '@/lib/utils'
import { formatarDataHoraLocal, calcularCheckin } from '@/lib/operacionalUtils'
import type { Reserva } from '@/types/database'
import type { ReservaComCliente } from '@/services/reservaService'
import type { CheckinStatus } from '@/lib/operacionalUtils'

const statusOptions = [
  { value: '', label: 'Todos os status' },
  { value: 'cotacao',     label: 'Cotação'     },
  { value: 'confirmada',  label: 'Confirmada'  },
  { value: 'em_operacao', label: 'Em Operação' },
  { value: 'concluida',   label: 'Concluída'   },
  { value: 'cancelada',   label: 'Cancelada'   },
]

const tipoOptions = [
  { value: '', label: 'Todos os tipos' },
  { value: 'aereo',   label: 'Aéreo'   },
  { value: 'pacote',  label: 'Pacote'  },
  { value: 'hotel',   label: 'Hotel'   },
  { value: 'servico', label: 'Serviço' },
  { value: 'milhas',  label: 'Milhas'  },
]

const tipoLabels: Record<string, string> = {
  aereo: 'Aéreo',
  pacote: 'Pacote',
  hotel: 'Hotel',
  servico: 'Serviço',
  milhas: 'Milhas',
}

type StatusVariant = 'cotacao' | 'confirmada' | 'em_operacao' | 'concluida' | 'cancelada'

const AGENDA_LIMITE_INICIAL = 10

export function ReservasPage() {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [modal, setModal] = useState<{ open: boolean; reserva: Reserva | null; abaInicial?: 'operacional' }>({
    open: false,
    reserva: null,
  })
  const [showAgenda, setShowAgenda] = useState(true)
  const [agendaExpandida, setAgendaExpandida] = useState(false)

  const reservasQuery = useReservas()
  const reservas = (reservasQuery.data ?? []) as ReservaComCliente[]
  const agendaQuery = useAgendaCheckins(30)

  const filtradas = reservas.filter((r) => {
    const s = search.toLowerCase()
    const matchSearch =
      !s ||
      String(r.numero).includes(s) ||
      (r.clientes?.nome ?? '').toLowerCase().includes(s)
    const matchStatus = !filterStatus || r.status === filterStatus
    const matchTipo   = !filterTipo   || r.tipo_reserva === filterTipo
    return matchSearch && matchStatus && matchTipo
  })

  const abrirNova = () => setModal({ open: true, reserva: null })
  const abrirEditar = (r: ReservaComCliente) => setModal({ open: true, reserva: r })
  const abrirOperacional = (reservaId: string) => {
    const r = reservas.find((res) => res.id === reservaId)
    if (r) setModal({ open: true, reserva: r, abaInicial: 'operacional' })
  }
  const fecharModal = () => setModal({ open: false, reserva: null })

  const temFiltro = Boolean(search || filterStatus || filterTipo)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Reservas</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {reservasQuery.isLoading ? '…' : `${reservas.length} reservas no total`}
          </p>
        </div>
        <Button size="sm" onClick={abrirNova}>
          <Plus className="h-3.5 w-3.5" />
          Nova Reserva
        </Button>
      </div>

      {/* Seção: Próximos check-ins */}
      {showAgenda && (
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  Próximos check-ins
                  <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                    (próximos 30 dias)
                  </span>
                </span>
                {!agendaQuery.isLoading && (agendaQuery.data?.length ?? 0) > 0 && (
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {agendaQuery.data!.length}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowAgenda(false)}
                aria-label="Ocultar próximos check-ins"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>

            {agendaQuery.isLoading ? (
              <p className="text-sm text-muted-foreground py-2">Carregando…</p>
            ) : agendaQuery.error ? (
              <Alert variant="destructive">
                {(agendaQuery.error as Error).message}
              </Alert>
            ) : (agendaQuery.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-1">
                Nenhum embarque nos próximos 30 dias.
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  {(agendaExpandida
                    ? agendaQuery.data!
                    : agendaQuery.data!.slice(0, AGENDA_LIMITE_INICIAL)
                  ).map((item) => {
                    const datas = item.trecho.data_embarque
                      ? calcularCheckin(item.trecho.data_embarque, item.trecho.hora_embarque)
                      : null
                    return (
                      <button
                        key={item.reservaId}
                        type="button"
                        onClick={() => abrirOperacional(item.reservaId)}
                        className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted/60 transition-colors group"
                      >
                        <span className="shrink-0 w-12 font-mono text-xs text-muted-foreground">
                          {item.trecho.data_embarque
                            ? item.trecho.data_embarque.split('-').slice(1).reverse().join('/')
                            : '—'}
                        </span>
                        <CheckinBadge status={item.reservaMetadados.checkin_status as CheckinStatus | undefined} />
                        <span className="text-xs text-muted-foreground font-mono shrink-0">
                          #{item.reservaNumero}
                        </span>
                        <span className="flex-1 min-w-0 truncate font-medium text-foreground">
                          {item.clienteNome ?? '—'}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {item.trecho.origem_iata ?? '???'} → {item.trecho.destino_iata ?? '???'}
                        </span>
                        {datas && (
                          <span className="shrink-0 text-xs text-muted-foreground hidden lg:block">
                            check-in {formatarDataHoraLocal(datas.checkin_recomendado_em)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {agendaQuery.data!.length > AGENDA_LIMITE_INICIAL && (
                  <button
                    type="button"
                    onClick={() => setAgendaExpandida((v) => !v)}
                    className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {agendaExpandida ? (
                      <>
                        <ChevronUp className="h-3 w-3" />
                        Mostrar menos
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3" />
                        Ver todos {agendaQuery.data!.length}
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </Card>
      )}

      {!showAgenda && (
        <button
          type="button"
          onClick={() => setShowAgenda(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Clock className="h-3.5 w-3.5" />
          Mostrar próximos check-ins
          <ChevronDown className="h-3 w-3" />
        </button>
      )}

      {/* Filtros */}
      <Card>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1 min-w-48">
            <Input
              placeholder="Buscar por cliente ou número…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="h-3.5 w-3.5" />}
            />
          </div>
          <div className="w-44">
            <Select
              options={statusOptions}
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Select
              options={tipoOptions}
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
            />
          </div>
          {temFiltro && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setFilterStatus('')
                setFilterTipo('')
              }}
            >
              Limpar
            </Button>
          )}
        </div>
      </Card>

      {/* Tabela */}
      <Card>
        {reservasQuery.isLoading ? (
          <LoadingState rows={5} />
        ) : reservasQuery.error ? (
          <div className="p-4">
            <Alert variant="destructive" title="Erro ao carregar reservas">
              {(reservasQuery.error as Error).message}
            </Alert>
          </div>
        ) : filtradas.length === 0 ? (
          <EmptyState
            icon={<PlaneTakeoff className="h-6 w-6" />}
            title={temFiltro ? 'Nenhuma reserva encontrada' : 'Nenhuma reserva cadastrada'}
            description={
              temFiltro
                ? 'Tente ajustar os filtros.'
                : 'Crie a primeira reserva da agência.'
            }
            action={
              !temFiltro ? (
                <Button size="sm" onClick={abrirNova}>
                  <Plus className="h-3.5 w-3.5" />
                  Nova Reserva
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Tipo</TableHead>
                <TableHead className="hidden lg:table-cell">Embarque</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Margem</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtradas.map((r) => {
                const margemPct = (r.margem_lucro ?? 0) * 100
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => abrirEditar(r)}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.numero}
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.clientes?.nome ?? '—'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="default">
                        {tipoLabels[r.tipo_reserva] ?? r.tipo_reserva}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {r.data_embarque ? formatarData(r.data_embarque) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatarMoeda(r.valor_venda)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right">
                      {margemPct > 0 ? (
                        <span
                          className={`text-sm font-medium ${
                            margemPct >= 20 ? 'text-success' : 'text-muted-foreground'
                          }`}
                        >
                          {margemPct.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status as StatusVariant} />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        onClick={(e) => {
                          e.stopPropagation()
                          abrirEditar(r)
                        }}
                        aria-label={`Editar reserva ${r.numero}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <ReservaModal
        open={modal.open}
        onClose={fecharModal}
        reservaInicial={modal.reserva}
        abaInicial={modal.abaInicial}
      />
    </div>
  )
}
