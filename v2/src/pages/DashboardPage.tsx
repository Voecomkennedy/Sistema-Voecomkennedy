import { PlaneTakeoff, Users, Wallet, Clock, TrendingUp, TrendingDown, ArrowRight, AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatarMoeda } from '@/lib/utils'
import type { TipoReserva, StatusReserva, UrgenciaCheckin } from '@/types'

// ── Mock data ────────────────────────────────────────────────────
interface MockReserva {
  numero: number
  cliente: string
  tipo: TipoReserva
  destino: string
  embarque: string
  valor: number
  status: StatusReserva
}

const mockReservas: MockReserva[] = [
  { numero: 2847, cliente: 'Ana Souza', tipo: 'aereo', destino: 'GRU → MCO', embarque: '2026-07-15', valor: 4200, status: 'confirmada' },
  { numero: 2846, cliente: 'João Mendes', tipo: 'pacote', destino: 'CWB → SSA', embarque: '2026-07-12', valor: 3800, status: 'em_operacao' },
  { numero: 2845, cliente: 'Maria Lima', tipo: 'aereo', destino: 'GRU → LIS', embarque: '2026-07-10', valor: 6500, status: 'confirmada' },
  { numero: 2844, cliente: 'Carlos Ferreira', tipo: 'milhas', destino: 'CGH → LAX', embarque: '2026-07-08', valor: 1200, status: 'confirmada' },
  { numero: 2843, cliente: 'Ana Paula Costa', tipo: 'hotel', destino: 'Rio de Janeiro', embarque: '2026-07-05', valor: 2100, status: 'em_operacao' },
  { numero: 2840, cliente: 'Pedro Alves', tipo: 'aereo', destino: 'BSB → GRU', embarque: '2026-06-28', valor: 890, status: 'cotacao' },
]

interface MockCheckin {
  voo: string
  cliente: string
  rota: string
  horario: string
  urgencia: UrgenciaCheckin
}

const mockCheckins: MockCheckin[] = [
  { voo: 'LAT1234', cliente: 'João Mendes', rota: 'GRU → MCO', horario: '14:30', urgencia: 'critico' },
  { voo: 'AD4567', cliente: 'Ana Paula C.', rota: 'GRU → CNF', horario: '17:00', urgencia: 'urgente' },
  { voo: 'G31122', cliente: 'Carlos R.', rota: 'CGH → MIA', horario: '21:00', urgencia: 'atencao' },
]

const kpis = [
  {
    label: 'Reservas este mês',
    value: '47',
    delta: '+12%',
    up: true,
    icon: PlaneTakeoff,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
  },
  {
    label: 'Receita do mês',
    value: formatarMoeda(89420),
    delta: '+8,3%',
    up: true,
    icon: Wallet,
    iconBg: 'bg-gold-subtle',
    iconColor: 'text-gold',
  },
  {
    label: 'Check-ins hoje',
    value: '3',
    delta: '1 crítico',
    up: false,
    icon: Clock,
    iconBg: 'bg-destructive/10',
    iconColor: 'text-destructive',
  },
  {
    label: 'Clientes ativos',
    value: '124',
    delta: '+5 este mês',
    up: true,
    icon: Users,
    iconBg: 'bg-success-subtle',
    iconColor: 'text-success',
  },
]

const tipoLabels: Record<TipoReserva, string> = {
  aereo: 'Aéreo',
  pacote: 'Pacote',
  hotel: 'Hotel',
  servico: 'Serviço',
  milhas: 'Milhas',
}

const urgenciaLabel: Record<UrgenciaCheckin, string> = {
  critico: 'Crítico',
  urgente: 'Urgente',
  atencao: 'Atenção',
  normal: 'Normal',
}

export function DashboardPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Hoje, {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <Button size="sm">
          <PlaneTakeoff className="h-3.5 w-3.5" />
          Nova Reserva
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
                  <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">{kpi.value}</p>
                  <div className="mt-1 flex items-center gap-1">
                    {kpi.up ? (
                      <TrendingUp className="h-3 w-3 text-success" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-destructive" />
                    )}
                    <span className={`text-xs font-medium ${kpi.up ? 'text-success' : 'text-destructive'}`}>
                      {kpi.delta}
                    </span>
                  </div>
                </div>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${kpi.iconBg}`}>
                  <kpi.icon className={`h-4 w-4 ${kpi.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Últimas reservas */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between pb-4 pt-5">
            <CardTitle>Últimas Reservas</CardTitle>
            <Link to="/reservas">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
                Ver todas
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Destino</TableHead>
                <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-28">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockReservas.map((r) => (
                <TableRow key={r.numero}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.numero}</TableCell>
                  <TableCell className="font-medium">{r.cliente}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{r.destino}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="default">{tipoLabels[r.tipo]}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatarMoeda(r.valor)}</TableCell>
                  <TableCell>
                    <Badge variant={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {/* Check-ins hoje */}
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-4 pt-5">
            <CardTitle>Check-ins Hoje</CardTitle>
            <Link to="/operacional">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
                Operacional
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {mockCheckins.map((c) => (
              <div
                key={c.voo}
                className="flex items-start gap-3 rounded-lg border border-border p-3"
              >
                <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                  c.urgencia === 'critico' ? 'bg-destructive' :
                  c.urgencia === 'urgente' ? 'bg-warning' :
                  'bg-gold'
                }`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-semibold text-foreground truncate">{c.cliente}</p>
                    <Badge variant={c.urgencia} className="shrink-0">{urgenciaLabel[c.urgencia]}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.rota}</p>
                  <p className="mt-0.5 text-xs font-medium text-muted-foreground">Voo {c.voo} · {c.horario}</p>
                </div>
              </div>
            ))}
            {mockCheckins.some(c => c.urgencia === 'critico') && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/5 border border-destructive/20 p-2.5 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>1 embarque em menos de 4h</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Banner V2 em construção */}
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">V2 · Fase 1 concluída.</span>
          {' '}Dados acima são mockados para validação visual. Supabase Auth e banco serão conectados nas fases 2 e 3.
        </p>
      </div>
    </div>
  )
}
