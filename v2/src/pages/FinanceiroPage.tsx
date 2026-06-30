import { useState, useMemo } from 'react'
import { Wallet, Plus, Pencil, X, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Alert } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ResumoFinanceiro } from '@/components/financeiro/ResumoFinanceiro'
import { LancamentoModal } from '@/components/financeiro/LancamentoModal'
import { StatusLancamentoBadge } from '@/components/financeiro/StatusLancamentoBadge'
import { useLancamentos, useCancelarLancamento } from '@/hooks/useFinanceiro'
import { calcularResumo, getDisplayStatus } from '@/services/financeiroService'
import { hojeLocalISO } from '@/lib/operacionalUtils'
import { formatarMoeda, formatarData } from '@/lib/utils'
import type { FinanceiroLancamento } from '@/types/database'
import type { TipoLancamento } from '@/types'

// ── Tipos de filtro ─────────────────────────────────────────────

type FiltroStatus = 'pendente' | 'recebido' | 'pago' | 'em_atraso' | 'cancelado' | ''
type FiltroTipo   = TipoLancamento | ''

// ── Opções de filtro ────────────────────────────────────────────

const tipoFiltroOptions = [
  { value: '',          label: 'Todos os tipos'  },
  { value: 'receita',   label: 'Receita'          },
  { value: 'despesa',   label: 'Despesa'          },
  { value: 'reembolso', label: 'Reembolso'        },
  { value: 'ajuste',    label: 'Ajuste'           },
]

const statusFiltroOptions = [
  { value: '',          label: 'Todos os status' },
  { value: 'pendente',  label: 'Pendente'        },
  { value: 'recebido',  label: 'Recebido'        },
  { value: 'pago',      label: 'Pago'            },
  { value: 'em_atraso', label: 'Em Atraso'       },
  { value: 'cancelado', label: 'Cancelado'       },
]

const TIPO_LABELS: Record<TipoLancamento, string> = {
  receita:   'Receita',
  despesa:   'Despesa',
  reembolso: 'Reembolso',
  ajuste:    'Ajuste',
}

const TIPO_DOT: Record<TipoLancamento, string> = {
  receita:   'bg-success',
  despesa:   'bg-destructive',
  reembolso: 'bg-info-subtle',
  ajuste:    'bg-warning-subtle',
}

// ── Utilitário de mês ───────────────────────────────────────────

function mesAtual(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
}

// ── Gráfico SVG nativo ──────────────────────────────────────────

interface BarChartDados {
  label: string
  receita: number
  despesa: number
}

function BarChart({ dados }: { dados: BarChartDados[] }) {
  if (dados.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Sem dados para exibir.</p>
  }
  const maxVal = Math.max(...dados.flatMap((d) => [d.receita, d.despesa]), 1) * 1.1
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary/70" />
          Receita recebida
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted-foreground/30" />
          Despesa paga
        </span>
      </div>
      <div className="flex items-end gap-2 h-36">
        {dados.map((d, i) => {
          const recH = (d.receita / maxVal) * 100
          const desH = (d.despesa / maxVal) * 100
          const isLast = i === dados.length - 1
          return (
            <div key={d.label} className="flex-1 flex flex-col items-center gap-1 group">
              <div className="w-full flex items-end gap-0.5 h-28">
                <div
                  className={`flex-1 rounded-t-sm transition-all ${isLast ? 'bg-primary' : 'bg-primary/30 group-hover:bg-primary/50'}`}
                  style={{ height: `${recH}%` }}
                  title={formatarMoeda(d.receita)}
                />
                <div
                  className={`flex-1 rounded-t-sm transition-all ${isLast ? 'bg-muted-foreground/40' : 'bg-muted-foreground/20 group-hover:bg-muted-foreground/35'}`}
                  style={{ height: `${desH}%` }}
                  title={formatarMoeda(d.despesa)}
                />
              </div>
              <span className={`text-[10px] font-medium ${isLast ? 'text-foreground' : 'text-muted-foreground'}`}>
                {d.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Página principal ────────────────────────────────────────────

const LISTA_LIMITE_INICIAL = 20

export function FinanceiroPage() {
  const [mes, setMes]             = useState(mesAtual)
  const [filterTipo,   setFilterTipo]   = useState<FiltroTipo>('')
  const [filterStatus, setFilterStatus] = useState<FiltroStatus>('')
  const [modal, setModal]         = useState<{ open: boolean; lancamento?: FinanceiroLancamento | null }>({ open: false })
  const [listaExpandida, setListaExpandida] = useState(false)
  const [cancelando, setCancelando]   = useState<string | null>(null)

  const lancamentosQuery = useLancamentos(mes)
  const cancelarMutation = useCancelarLancamento()

  const hoje = hojeLocalISO()

  // Todos os lançamentos do mês (sem filtro de tipo/status na query — filtro em JS)
  const todos = useMemo(() => lancamentosQuery.data ?? [], [lancamentosQuery.data])

  // Resumo calculado em memória sobre dados do mês
  const resumo = useMemo(() => calcularResumo(todos, hoje), [todos, hoje])

  // Dados para o gráfico — resumo do mês atual (1 barra) expandível futuramente
  const graficoDados: BarChartDados[] = [
    { label: mes.split('-')[1] + '/' + mes.split('-')[0].slice(2), receita: resumo.receita_recebida, despesa: resumo.despesa_paga },
  ]

  // Filtragem em JS
  const filtrados = useMemo(() => {
    return todos.filter((l) => {
      if (filterTipo   && l.tipo !== filterTipo) return false
      if (filterStatus) {
        const display = getDisplayStatus(l)
        if (display !== filterStatus) return false
      }
      return true
    })
  }, [todos, filterTipo, filterStatus])

  const listaVisivel = listaExpandida
    ? filtrados
    : filtrados.slice(0, LISTA_LIMITE_INICIAL)

  const handleCancelar = async (l: FinanceiroLancamento) => {
    if (!window.confirm(`Cancelar o lançamento "${l.descricao}"? Esta ação não pode ser desfeita.`)) return
    setCancelando(l.id)
    try {
      await cancelarMutation.mutateAsync(l.id)
    } finally {
      setCancelando(null)
    }
  }

  const temFiltro = Boolean(filterTipo || filterStatus)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Financeiro</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {lancamentosQuery.isLoading ? '…' : `${todos.length} lançamentos em ${mes}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="h-9 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Selecionar mês"
          />
          <Button size="sm" onClick={() => setModal({ open: true })}>
            <Plus className="h-3.5 w-3.5" />
            Novo Lançamento
          </Button>
        </div>
      </div>

      {/* Erro */}
      {lancamentosQuery.error && (
        <Alert variant="destructive">
          {(lancamentosQuery.error as Error).message}
        </Alert>
      )}

      {/* Resumo */}
      <ResumoFinanceiro resumo={resumo} loading={lancamentosQuery.isLoading} />

      {/* Layout */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Gráfico */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Receita vs Despesa</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart dados={graficoDados} />
            <div className="mt-4 border-t border-border pt-4 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Saldo realizado</p>
                <p className={`text-sm font-semibold ${resumo.saldo_realizado >= 0 ? 'text-success' : 'text-destructive'}`}>
                  {resumo.saldo_realizado >= 0 ? '' : '-'}{formatarMoeda(Math.abs(resumo.saldo_realizado))}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Em atraso</p>
                <p className={`text-sm font-semibold ${resumo.em_atraso_count > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {resumo.em_atraso_count > 0 ? formatarMoeda(resumo.em_atraso_valor) : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabela de lançamentos */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between pb-3 pt-5 flex-wrap gap-2">
            <CardTitle>Lançamentos</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-36">
                <Select
                  options={tipoFiltroOptions}
                  value={filterTipo}
                  onChange={(e) => setFilterTipo(e.target.value as FiltroTipo)}
                />
              </div>
              <div className="w-36">
                <Select
                  options={statusFiltroOptions}
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as FiltroStatus)}
                />
              </div>
              {temFiltro && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setFilterTipo(''); setFilterStatus('') }}
                >
                  Limpar
                </Button>
              )}
            </div>
          </CardHeader>

          {lancamentosQuery.isLoading ? (
            <div className="px-6 pb-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Wallet className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {temFiltro ? 'Nenhum lançamento com estes filtros.' : 'Nenhum lançamento neste mês.'}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="hidden sm:table-cell">Reserva</TableHead>
                    <TableHead className="hidden md:table-cell">Vencimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listaVisivel.map((l) => {
                    const isCancelado = l.status === 'cancelado'
                    return (
                      <TableRow
                        key={l.id}
                        className={isCancelado ? 'opacity-50' : undefined}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${TIPO_DOT[l.tipo as TipoLancamento] ?? 'bg-muted-foreground'}`} />
                            <div className="min-w-0">
                              <span className="text-sm truncate block max-w-[180px]">{l.descricao}</span>
                              <span className="text-[11px] text-muted-foreground">{TIPO_LABELS[l.tipo as TipoLancamento] ?? l.tipo}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {l.reservas ? (
                            <span className="font-mono text-xs text-muted-foreground">#{l.reservas.numero}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {formatarData(l.data_vencimento)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-medium ${l.tipo === 'receita' || l.tipo === 'reembolso' ? 'text-success' : 'text-foreground'}`}>
                            {l.tipo === 'receita' || l.tipo === 'reembolso' ? '+' : ''}{formatarMoeda(l.valor)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusLancamentoBadge lancamento={l} />
                        </TableCell>
                        <TableCell>
                          {!isCancelado && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                onClick={() => setModal({ open: true, lancamento: l })}
                                aria-label={`Editar ${l.descricao}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                onClick={() => handleCancelar(l)}
                                disabled={cancelando === l.id}
                                aria-label={`Cancelar ${l.descricao}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              {filtrados.length > LISTA_LIMITE_INICIAL && (
                <div className="px-6 py-3 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setListaExpandida((v) => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {listaExpandida ? (
                      <><ChevronUp className="h-3 w-3" />Mostrar menos</>
                    ) : (
                      <><ChevronDown className="h-3 w-3" />Ver todos {filtrados.length}</>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Erro de cancelamento */}
      {cancelarMutation.error && (
        <Alert variant="destructive">
          {(cancelarMutation.error as Error).message}
        </Alert>
      )}

      {/* Badge de tipos para referência */}
      <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
        <span>Legenda:</span>
        <Badge variant="fin_pendente">Pendente</Badge>
        <Badge variant="fin_recebido">Recebido</Badge>
        <Badge variant="fin_pago">Pago</Badge>
        <Badge variant="fin_em_atraso">Em Atraso</Badge>
        <Badge variant="fin_cancelado">Cancelado</Badge>
      </div>

      <LancamentoModal
        open={modal.open}
        onClose={() => setModal({ open: false })}
        lancamento={modal.lancamento}
      />
    </div>
  )
}
