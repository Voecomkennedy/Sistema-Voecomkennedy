import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PlaneTakeoff, Users, Wallet, Clock, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LoadingState } from '@/components/ui/skeleton'
import { useReservas } from '@/hooks/useReservas'
import { useClientes } from '@/hooks/useClientes'
import { useLancamentos } from '@/hooks/useFinanceiro'
import { useAgendaCheckins } from '@/hooks/useOperacional'
import { calcularResumo } from '@/services/financeiroService'
import { hojeLocalISO, parseEmbarqueLocal } from '@/lib/operacionalUtils'
import { formatarMoeda, formatarData } from '@/lib/utils'
import type { ReservaComCliente } from '@/services/reservaService'

const STATUS_LABELS: Record<string, string> = {
  cotacao:      'Cotação',
  confirmada:   'Confirmada',
  em_operacao:  'Em Operação',
  concluida:    'Concluída',
  cancelada:    'Cancelada',
}

const TIPO_LABELS: Record<string, string> = {
  aereo:   'Aéreo',
  pacote:  'Pacote',
  hotel:   'Hotel',
  servico: 'Serviço',
  milhas:  'Milhas',
}

function urgenciaCheckin(dataEmbarque: string, horaEmbarque?: string | null): 'critico' | 'urgente' | 'atencao' | 'normal' {
  const embarque = parseEmbarqueLocal(dataEmbarque, horaEmbarque)
  const diffH = (embarque.getTime() - Date.now()) / 3600000
  if (diffH < 0)   return 'normal'
  if (diffH <= 24) return 'critico'
  if (diffH <= 48) return 'urgente'
  if (diffH <= 168) return 'atencao'
  return 'normal'
}

function urgenciaCor(u: string) {
  if (u === 'critico') return 'bg-destructive'
  if (u === 'urgente') return 'bg-warning'
  return 'bg-gold'
}

export function DashboardPage() {
  const navigate = useNavigate()
  const hoje = hojeLocalISO()
  const mesAtual = hoje.slice(0, 7)

  const reservasQuery  = useReservas()
  const clientesQuery  = useClientes()
  const lancamentosQuery = useLancamentos(mesAtual)
  const agendaQuery    = useAgendaCheckins(7)

  const resumoMes = useMemo(() => {
    if (!lancamentosQuery.data) return null
    return calcularResumo(lancamentosQuery.data, hoje)
  }, [lancamentosQuery.data, hoje])

  const reservasMes = useMemo(() => {
    if (!reservasQuery.data) return []
    const [ano, mes] = mesAtual.split('-')
    const inicio = `${ano}-${mes}-01`
    const ultimoDia = new Date(Number(ano), Number(mes), 0).getDate()
    const fim = `${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`
    return reservasQuery.data.filter(
      (r) => r.data_reserva >= inicio && r.data_reserva <= fim,
    )
  }, [reservasQuery.data, mesAtual])

  const ultimasReservas = (reservasQuery.data ?? []).slice(0, 6) as ReservaComCliente[]
  const proximosCheckins = (agendaQuery.data ?? []).slice(0, 4)

  const isLoading = reservasQuery.isLoading || clientesQuery.isLoading || lancamentosQuery.isLoading

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Hoje, {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Button size="sm" onClick={() => navigate('/reservas')}>
          <PlaneTakeoff className="h-3.5 w-3.5" />
          Nova Reserva
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Reservas este mês</p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">
                  {isLoading ? '—' : reservasMes.length}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isLoading ? '' : `${reservasQuery.data?.length ?? 0} no total`}
                </p>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <PlaneTakeoff className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Receita recebida</p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">
                  {lancamentosQuery.isLoading ? '—' : formatarMoeda(resumoMes?.receita_recebida ?? 0)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {lancamentosQuery.isLoading ? '' : `${formatarMoeda(resumoMes?.a_receber ?? 0)} a receber`}
                </p>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-subtle">
                <Wallet className="h-4 w-4 text-gold" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Check-ins (7 dias)</p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">
                  {agendaQuery.isLoading ? '—' : agendaQuery.data?.length ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {agendaQuery.isLoading ? '' :
                    agendaQuery.data?.filter(i => i.trecho.data_embarque === hoje).length
                      ? `${agendaQuery.data?.filter(i => i.trecho.data_embarque === hoje).length} hoje`
                      : 'nenhum hoje'}
                </p>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                <Clock className="h-4 w-4 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Clientes ativos</p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">
                  {clientesQuery.isLoading ? '—' : clientesQuery.data?.length ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">cadastrados</p>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-subtle">
                <Users className="h-4 w-4 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
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
          {reservasQuery.isLoading ? (
            <div className="px-4 pb-4"><LoadingState rows={4} /></div>
          ) : ultimasReservas.length === 0 ? (
            <div className="px-4 pb-6 text-center text-sm text-muted-foreground">
              Nenhuma reserva cadastrada ainda.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                  <TableHead className="hidden md:table-cell">Data</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ultimasReservas.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.numero}</TableCell>
                    <TableCell className="font-medium">{r.clientes?.nome ?? '—'}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="default">{TIPO_LABELS[r.tipo_reserva] ?? r.tipo_reserva}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {r.data_reserva ? formatarData(r.data_reserva) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatarMoeda(r.valor_venda)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status as 'cotacao' | 'confirmada' | 'em_operacao' | 'concluida' | 'cancelada'}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {/* Próximos check-ins */}
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-4 pt-5">
            <CardTitle>Próximos Check-ins</CardTitle>
            <Link to="/operacional">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
                Operacional
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {agendaQuery.isLoading ? (
              <LoadingState rows={3} />
            ) : proximosCheckins.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum embarque nos próximos 7 dias.
              </p>
            ) : (
              proximosCheckins.map((item) => {
                const urg = urgenciaCheckin(
                  item.trecho.data_embarque ?? '',
                  item.trecho.hora_embarque,
                )
                const urgLabel = { critico: 'Crítico', urgente: 'Urgente', atencao: 'Atenção', normal: 'Normal' }[urg]
                return (
                  <div
                    key={item.reservaId}
                    className="flex items-start gap-3 rounded-lg border border-border p-3"
                  >
                    <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${urgenciaCor(urg)}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {item.clienteNome ?? `Reserva #${item.reservaNumero}`}
                        </p>
                        <Badge variant={urg as 'critico' | 'urgente' | 'atencao' | 'normal'} className="shrink-0">
                          {urgLabel}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.trecho.origem_iata ?? '?'} → {item.trecho.destino_iata ?? '?'}
                      </p>
                      {item.trecho.data_embarque && (
                        <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                          {formatarData(item.trecho.data_embarque)}
                          {item.trecho.hora_embarque ? ` · ${item.trecho.hora_embarque.slice(0, 5)}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
