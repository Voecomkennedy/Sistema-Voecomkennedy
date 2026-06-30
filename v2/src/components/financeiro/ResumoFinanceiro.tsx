import { TrendingUp, TrendingDown, Wallet, AlertCircle, Clock, CreditCard } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatarMoeda } from '@/lib/utils'
import type { ResumoMes } from '@/services/financeiroService'

interface ResumoFinanceiroProps {
  resumo: ResumoMes
  loading?: boolean
}

export function ResumoFinanceiro({ resumo, loading }: ResumoFinanceiroProps) {
  const saldoPositivo = resumo.saldo_realizado >= 0

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-5">
              <div className="h-16 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Linha principal — 4 cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Receita Recebida */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Receita Recebida</p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">
                  {formatarMoeda(resumo.receita_recebida)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">tipo receita · recebido</p>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-subtle">
                <TrendingUp className="h-4 w-4 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Despesa Paga */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Despesa Paga</p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">
                  {formatarMoeda(resumo.despesa_paga)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">tipo despesa · pago</p>
              </div>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Saldo Realizado */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Saldo Realizado</p>
                <p className={`mt-1.5 text-2xl font-bold tracking-tight ${saldoPositivo ? 'text-success' : 'text-destructive'}`}>
                  {saldoPositivo ? '' : '-'}{formatarMoeda(Math.abs(resumo.saldo_realizado))}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">recebida − paga</p>
              </div>
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${saldoPositivo ? 'bg-primary/10' : 'bg-destructive/10'}`}>
                <Wallet className={`h-4 w-4 ${saldoPositivo ? 'text-primary' : 'text-destructive'}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Em Atraso */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">Em Atraso</p>
                <p className={`mt-1.5 text-2xl font-bold tracking-tight ${resumo.em_atraso_count > 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {resumo.em_atraso_count > 0 ? formatarMoeda(resumo.em_atraso_valor) : '—'}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {resumo.em_atraso_count > 0
                    ? `${resumo.em_atraso_count} lançamento${resumo.em_atraso_count > 1 ? 's' : ''}`
                    : 'nenhum em atraso'}
                </p>
              </div>
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${resumo.em_atraso_count > 0 ? 'bg-destructive/10' : 'bg-muted'}`}>
                <AlertCircle className={`h-4 w-4 ${resumo.em_atraso_count > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Linha secundária — 2 cards menores */}
      <div className="grid grid-cols-2 gap-4">
        {/* A Receber */}
        <Card>
          <CardContent className="py-3 px-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">A Receber</p>
                  <p className="text-sm font-semibold text-foreground">{formatarMoeda(resumo.a_receber)}</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">receita pendente</p>
            </div>
          </CardContent>
        </Card>

        {/* A Pagar */}
        <Card>
          <CardContent className="py-3 px-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">A Pagar</p>
                  <p className="text-sm font-semibold text-foreground">{formatarMoeda(resumo.a_pagar)}</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">despesa pendente</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
