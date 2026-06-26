import { useState } from 'react'
import { PlaneTakeoff, Plus, Search, Pencil } from 'lucide-react'
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
import { useReservas } from '@/hooks/useReservas'
import { formatarMoeda, formatarData } from '@/lib/utils'
import type { Reserva } from '@/types/database'
import type { ReservaComCliente } from '@/services/reservaService'

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

export function ReservasPage() {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [modal, setModal] = useState<{ open: boolean; reserva: Reserva | null }>({
    open: false,
    reserva: null,
  })

  const reservasQuery = useReservas()
  const reservas = (reservasQuery.data ?? []) as ReservaComCliente[]

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
      />
    </div>
  )
}
