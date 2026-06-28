import { supabase } from '@/lib/supabase'
import { hojeLocalISO } from '@/lib/operacionalUtils'
import type { FinanceiroLancamento, TablesInsert, TablesUpdate } from '@/types/database'
import type { TipoLancamento, StatusLancamento } from '@/types'

// ── Tipos ──────────────────────────────────────────────────────

export interface LancamentoComReserva extends FinanceiroLancamento {
  reservas: { id: string; numero: number } | null
}

export interface ResumoMes {
  receita_recebida: number
  despesa_paga:     number
  saldo_realizado:  number
  a_receber:        number
  a_pagar:          number
  em_atraso_count:  number
  em_atraso_valor:  number
}

export interface LancamentoFiltros {
  tipo?:   TipoLancamento | ''
  status?: StatusLancamento | 'em_atraso' | ''
  mes?:    string   // 'YYYY-MM'
}

export type LancamentoInsert = Omit<
  TablesInsert<'financeiro_lancamentos'>,
  'id' | 'organization_id' | 'criado_em' | 'atualizado_em' | 'moeda' | 'status'
>

export type LancamentoUpdate = Omit<
  TablesUpdate<'financeiro_lancamentos'>,
  'id' | 'organization_id' | 'criado_em' | 'atualizado_em' | 'criado_por'
>

// ── Status permitidos por tipo ─────────────────────────────────

export const STATUS_POR_TIPO: Record<TipoLancamento, StatusLancamento[]> = {
  receita:   ['pendente', 'recebido', 'cancelado'],
  despesa:   ['pendente', 'pago',     'cancelado'],
  reembolso: ['pendente', 'recebido', 'pago', 'cancelado'],
  ajuste:    ['pendente', 'recebido', 'pago', 'cancelado'],
}

// ── Queries ────────────────────────────────────────────────────

export async function listarLancamentos(
  orgId: string,
  filtros?: LancamentoFiltros,
): Promise<LancamentoComReserva[]> {
  let query = supabase
    .from('financeiro_lancamentos')
    .select('*, reservas!fk_fin_reserva(id, numero)')
    .eq('organization_id', orgId)
    .order('data_vencimento', { ascending: false })
    .order('criado_em',       { ascending: false })

  if (filtros?.tipo) {
    query = query.eq('tipo', filtros.tipo)
  }

  // em_atraso é filtrado em JS — nunca via query status='em_atraso'
  if (filtros?.status && filtros.status !== 'em_atraso') {
    query = query.eq('status', filtros.status)
  }

  if (filtros?.mes) {
    const [ano, mes] = filtros.mes.split('-')
    const inicio = `${ano}-${mes}-01`
    const ultimoDia = new Date(Number(ano), Number(mes), 0).getDate()
    const fim = `${ano}-${mes}-${String(ultimoDia).padStart(2, '0')}`
    query = query.gte('data_vencimento', inicio).lte('data_vencimento', fim)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as LancamentoComReserva[]
}

// ── Cálculo de resumo (JS puro — sem query extra) ──────────────

export function calcularResumo(lancamentos: LancamentoComReserva[], hoje: string): ResumoMes {
  // reembolso e ajuste não entram nos KPIs desta fase
  // cancelado nunca entra no resumo

  const receita_recebida = lancamentos
    .filter(l => l.tipo === 'receita' && l.status === 'recebido')
    .reduce((s, l) => s + l.valor, 0)

  const despesa_paga = lancamentos
    .filter(l => l.tipo === 'despesa' && l.status === 'pago')
    .reduce((s, l) => s + l.valor, 0)

  const a_receber = lancamentos
    .filter(l => l.tipo === 'receita' && l.status === 'pendente')
    .reduce((s, l) => s + l.valor, 0)

  const a_pagar = lancamentos
    .filter(l => l.tipo === 'despesa' && l.status === 'pendente')
    .reduce((s, l) => s + l.valor, 0)

  const emAtraso = lancamentos.filter(
    l => l.status === 'pendente' && l.data_vencimento < hoje,
  )

  return {
    receita_recebida,
    despesa_paga,
    saldo_realizado:  receita_recebida - despesa_paga,
    a_receber,
    a_pagar,
    em_atraso_count:  emAtraso.length,
    em_atraso_valor:  emAtraso.reduce((s, l) => s + l.valor, 0),
  }
}

// ── Derivação de display status (nunca gravar em_atraso no banco) ──

export function getDisplayStatus(l: Pick<FinanceiroLancamento, 'status' | 'data_vencimento'>): StatusLancamento | 'em_atraso' {
  if (l.status === 'pendente' && l.data_vencimento < hojeLocalISO()) return 'em_atraso'
  return l.status as StatusLancamento
}

// ── Mutações ───────────────────────────────────────────────────

export async function criarLancamento(
  orgId: string,
  userId: string,
  dados: LancamentoInsert,
): Promise<FinanceiroLancamento> {
  const { data, error } = await supabase
    .from('financeiro_lancamentos')
    .insert({
      organization_id: orgId,
      tipo:            dados.tipo,
      categoria:       dados.categoria,
      descricao:       dados.descricao,
      valor:           dados.valor,
      data_vencimento: dados.data_vencimento,
      status:          'pendente',
      moeda:           'BRL',
      criado_por:      userId,
      reserva_id:      dados.reserva_id ?? null,
      data_pagamento:  dados.data_pagamento ?? null,
      // Não inclui atualizado_em — trigger trg_fin_updated_at cuida disso
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function atualizarLancamento(
  orgId: string,
  id: string,
  patch: LancamentoUpdate,
): Promise<FinanceiroLancamento> {
  // Não inclui atualizado_em — trigger trg_fin_updated_at cuida disso
  const { data, error } = await supabase
    .from('financeiro_lancamentos')
    .update(patch)
    .eq('organization_id', orgId)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function cancelarLancamento(orgId: string, id: string): Promise<void> {
  // Não inclui atualizado_em — trigger trg_fin_updated_at cuida disso
  // data_pagamento não é alterada no cancelamento
  const { error } = await supabase
    .from('financeiro_lancamentos')
    .update({ status: 'cancelado' })
    .eq('organization_id', orgId)
    .eq('id', id)
  if (error) throw error
}
