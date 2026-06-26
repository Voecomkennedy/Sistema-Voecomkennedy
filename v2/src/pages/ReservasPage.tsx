import { useState } from 'react'
import { PlaneTakeoff, Plus, Search, Filter, MoreHorizontal } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { formatarMoeda, formatarData } from '@/lib/utils'
import type { TipoReserva, StatusReserva } from '@/types'

interface MockReserva {
  numero: number
  cliente: string
  tipo: TipoReserva
  destino: string
  embarque: string
  valor: number
  margem: number
  status: StatusReserva
  criado: string
}

const mockReservas: MockReserva[] = [
  { numero: 2847, cliente: 'Ana Souza', tipo: 'aereo', destino: 'GRU → MCO', embarque: '2026-07-15', valor: 4200, margem: 18.5, status: 'confirmada', criado: '2026-06-20' },
  { numero: 2846, cliente: 'João Mendes', tipo: 'pacote', destino: 'CWB → SSA (All Inc.)', embarque: '2026-07-12', valor: 3800, margem: 22.1, status: 'em_operacao', criado: '2026-06-18' },
  { numero: 2845, cliente: 'Maria Lima', tipo: 'aereo', destino: 'GRU → LIS', embarque: '2026-07-10', valor: 6500, margem: 15.8, status: 'confirmada', criado: '2026-06-17' },
  { numero: 2844, cliente: 'Carlos Ferreira', tipo: 'milhas', destino: 'CGH → LAX', embarque: '2026-07-08', valor: 1200, margem: 31.2, status: 'confirmada', criado: '2026-06-16' },
  { numero: 2843, cliente: 'Ana Paula Costa', tipo: 'hotel', destino: 'Rio de Janeiro', embarque: '2026-07-05', valor: 2100, margem: 19.0, status: 'em_operacao', criado: '2026-06-14' },
  { numero: 2842, cliente: 'Roberto Santos', tipo: 'pacote', destino: 'BEL → MIA (7d)', embarque: '2026-07-02', valor: 8900, margem: 24.3, status: 'concluida', criado: '2026-06-10' },
  { numero: 2841, cliente: 'Fernanda Oliveira', tipo: 'servico', destino: 'Transfer Aeroporto', embarque: '2026-07-01', valor: 350, margem: 40.0, status: 'concluida', criado: '2026-06-09' },
  { numero: 2840, cliente: 'Pedro Alves', tipo: 'aereo', destino: 'BSB → GRU', embarque: '2026-06-28', valor: 890, margem: 0, status: 'cotacao', criado: '2026-06-08' },
  { numero: 2839, cliente: 'Luciana Ramos', tipo: 'aereo', destino: 'REC → BOG', embarque: '2026-06-25', valor: 3100, margem: 17.6, status: 'cancelada', criado: '2026-06-05' },
]

const tipoLabels: Record<TipoReserva, string> = {
  aereo: 'Aéreo',
  pacote: 'Pacote',
  hotel: 'Hotel',
  servico: 'Serviço',
  milhas: 'Milhas',
}

const statusOptions = [
  { value: '', label: 'Todos os status' },
  { value: 'cotacao', label: 'Cotação' },
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'em_operacao', label: 'Em Operação' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'cancelada', label: 'Cancelada' },
]

const tipoOptions = [
  { value: '', label: 'Todos os tipos' },
  { value: 'aereo', label: 'Aéreo' },
  { value: 'pacote', label: 'Pacote' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'servico', label: 'Serviço' },
  { value: 'milhas', label: 'Milhas' },
]

export function ReservasPage() {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTipo, setFilterTipo] = useState('')

  const filtered = mockReservas.filter((r) => {
    const matchSearch =
      !search ||
      r.cliente.toLowerCase().includes(search.toLowerCase()) ||
      String(r.numero).includes(search) ||
      r.destino.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !filterStatus || r.status === filterStatus
    const matchTipo = !filterTipo || r.tipo === filterTipo
    return matchSearch && matchStatus && matchTipo
  })

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Reservas</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {mockReservas.length} reservas no total
          </p>
        </div>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5" />
          Nova Reserva
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1 min-w-48">
            <Input
              placeholder="Buscar por cliente, nº ou destino…"
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
          {(search || filterStatus || filterTipo) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(''); setFilterStatus(''); setFilterTipo('') }}
            >
              <Filter className="h-3.5 w-3.5" />
              Limpar
            </Button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<PlaneTakeoff className="h-6 w-6" />}
            title="Nenhuma reserva encontrada"
            description="Tente ajustar os filtros ou criar uma nova reserva."
            action={<Button size="sm"><Plus className="h-3.5 w-3.5" />Nova Reserva</Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead className="hidden md:table-cell">Tipo</TableHead>
                <TableHead className="hidden lg:table-cell">Embarque</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Margem</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.numero} className="cursor-pointer">
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.numero}</TableCell>
                  <TableCell className="font-medium">{r.cliente}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[180px] truncate">{r.destino}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="default">{tipoLabels[r.tipo]}</Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    {formatarData(r.embarque)}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatarMoeda(r.valor)}</TableCell>
                  <TableCell className="hidden lg:table-cell text-right">
                    {r.margem > 0 ? (
                      <span className={`text-sm font-medium ${r.margem >= 20 ? 'text-success' : 'text-muted-foreground'}`}>
                        {r.margem.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status} />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Dados mockados — Supabase será conectado na Fase 3
      </p>
    </div>
  )
}
