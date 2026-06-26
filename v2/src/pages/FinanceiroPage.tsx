import { Wallet, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, DollarSign } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatarMoeda, formatarData } from '@/lib/utils'
import type { TipoLancamento } from '@/types'

// ── Mock data ──────────────────────────────────────────────────────
const kpis = [
  { label: 'Receita Bruta', value: 89420, delta: '+8,3%', up: true, icon: TrendingUp, color: 'text-success', iconBg: 'bg-success-subtle' },
  { label: 'Despesas', value: 71280, delta: '-2,1%', up: true, icon: TrendingDown, color: 'text-muted-foreground', iconBg: 'bg-muted' },
  { label: 'Lucro Líquido', value: 18140, delta: '+34,7%', up: true, icon: Wallet, color: 'text-gold', iconBg: 'bg-gold-subtle' },
  { label: 'Margem Média', value: null, display: '20,3%', delta: '+4,2pp', up: true, icon: DollarSign, color: 'text-primary', iconBg: 'bg-primary/10' },
]

const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun']
const receitas = [72000, 68000, 81000, 76000, 83000, 89420]
const despesas = [58000, 55000, 65000, 60000, 68000, 71280]
const maxVal = Math.max(...receitas) * 1.1

interface MockLancamento {
  id: number
  tipo: TipoLancamento
  descricao: string
  reserva: number | null
  valor: number
  data: string
}

const mockLancamentos: MockLancamento[] = [
  { id: 1, tipo: 'receita', descricao: 'Reserva #2847 — Ana Souza', reserva: 2847, valor: 4200, data: '2026-06-25' },
  { id: 2, tipo: 'receita', descricao: 'Reserva #2845 — Maria Lima', reserva: 2845, valor: 6500, data: '2026-06-24' },
  { id: 3, tipo: 'despesa', descricao: 'Passagens LATAM · Forn. #41', reserva: 2845, valor: -3800, data: '2026-06-23' },
  { id: 4, tipo: 'receita', descricao: 'Reserva #2846 — João Mendes', reserva: 2846, valor: 3800, data: '2026-06-22' },
  { id: 5, tipo: 'despesa', descricao: 'Passagens Azul · Forn. #12', reserva: 2846, valor: -2900, data: '2026-06-22' },
  { id: 6, tipo: 'receita', descricao: 'Reserva #2844 — Carlos F.', reserva: 2844, valor: 1200, data: '2026-06-20' },
  { id: 7, tipo: 'despesa', descricao: 'Hotel Rio Palace · Forn. #8', reserva: 2843, valor: -1680, data: '2026-06-19' },
]

function BarChart() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary/70" />
          Receita
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted-foreground/30" />
          Despesa
        </span>
      </div>
      <div className="flex items-end gap-2 h-36">
        {meses.map((mes, i) => {
          const recH = (receitas[i] / maxVal) * 100
          const desH = (despesas[i] / maxVal) * 100
          const isLast = i === meses.length - 1
          return (
            <div key={mes} className="flex-1 flex flex-col items-center gap-1 group">
              <div className="w-full flex items-end gap-0.5 h-28">
                <div
                  className={`flex-1 rounded-t-sm transition-all ${isLast ? 'bg-primary' : 'bg-primary/30 group-hover:bg-primary/50'}`}
                  style={{ height: `${recH}%` }}
                  title={formatarMoeda(receitas[i])}
                />
                <div
                  className={`flex-1 rounded-t-sm transition-all ${isLast ? 'bg-muted-foreground/40' : 'bg-muted-foreground/20 group-hover:bg-muted-foreground/35'}`}
                  style={{ height: `${desH}%` }}
                  title={formatarMoeda(despesas[i])}
                />
              </div>
              <span className={`text-[10px] font-medium ${isLast ? 'text-foreground' : 'text-muted-foreground'}`}>
                {mes}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function FinanceiroPage() {
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Financeiro</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Junho 2026 — dados mockados</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
                  <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">
                    {kpi.display ?? formatarMoeda(kpi.value!)}
                  </p>
                  <div className="mt-1 flex items-center gap-1">
                    {kpi.up ? (
                      <ArrowUpRight className="h-3 w-3 text-success" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 text-destructive" />
                    )}
                    <span className={`text-xs font-medium ${kpi.up ? 'text-success' : 'text-destructive'}`}>
                      {kpi.delta} vs mês ant.
                    </span>
                  </div>
                </div>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${kpi.iconBg}`}>
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Receita vs Despesa</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart />
            <div className="mt-4 border-t border-border pt-4 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Melhor mês</p>
                <p className="text-sm font-semibold text-foreground">{formatarMoeda(89420)}</p>
                <p className="text-[11px] text-muted-foreground">Jun 2026</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Crescimento 6m</p>
                <p className="text-sm font-semibold text-success">+24,2%</p>
                <p className="text-[11px] text-muted-foreground">Jan → Jun</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent lancamentos */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between pb-4 pt-5">
            <CardTitle>Lançamentos Recentes</CardTitle>
            <Badge variant="info">{mockLancamentos.length} este mês</Badge>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead className="hidden sm:table-cell">Reserva</TableHead>
                <TableHead className="hidden md:table-cell">Data</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockLancamentos.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${l.tipo === 'receita' ? 'bg-success' : 'bg-destructive'}`} />
                      <span className="text-sm truncate max-w-[180px]">{l.descricao}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {l.reserva ? (
                      <span className="font-mono text-xs text-muted-foreground">#{l.reserva}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {formatarData(l.data)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`font-medium ${l.valor > 0 ? 'text-success' : 'text-destructive'}`}>
                      {l.valor > 0 ? '+' : ''}{formatarMoeda(l.valor)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Dados mockados — Supabase será conectado na Fase 3. Recharts será adicionado na Fase 7.
      </p>
    </div>
  )
}
