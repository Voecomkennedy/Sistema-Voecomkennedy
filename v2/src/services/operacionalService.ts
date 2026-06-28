import { supabase } from '@/lib/supabase'
import { hojeLocalISO, addDiasLocalISO } from '@/lib/operacionalUtils'
import type { ReservaTrecho } from '@/types/database'
import type { CheckinStatus } from '@/lib/operacionalUtils'

// ── Tipos ──────────────────────────────────────────────────────

export interface ReservaMetadados {
  checkin_status?: CheckinStatus
  checkin_observacao?: string
  checkin_atualizado_em?: string
  operacional_observacao?: string
}

export interface TrechoAgenda extends ReservaTrecho {
  reservas: {
    id: string
    numero: number
    status: string
    metadados: ReservaMetadados
    clientes: { id: string; nome: string } | null
  }
}

// ── Metadados operacionais ─────────────────────────────────────

/**
 * Atualiza campos operacionais nos metadados da reserva via merge JS.
 * Nunca sobrescreve campos de outras features presentes em metadados.
 */
export async function atualizarMetadados(
  reservaId: string,
  orgId: string,
  patch: Partial<ReservaMetadados>,
): Promise<void> {
  const { data, error: fetchError } = await supabase
    .from('reservas')
    .select('metadados')
    .eq('id', reservaId)
    .eq('organization_id', orgId)
    .single()

  if (fetchError) throw fetchError

  const atual  = (data?.metadados ?? {}) as Record<string, unknown>
  const merged = { ...atual, ...patch }

  const { error: updateError } = await supabase
    .from('reservas')
    .update({ metadados: merged })
    .eq('id', reservaId)
    .eq('organization_id', orgId)

  if (updateError) throw updateError
}

// ── Agenda de check-ins ────────────────────────────────────────

/**
 * Busca todos os trechos futuros da organização dentro do período.
 * Sem filtro de sentido — agrupamento por reserva é feito em JS.
 */
export async function listarTrechosFuturos(
  orgId: string,
  diasAFrente = 30,
): Promise<TrechoAgenda[]> {
  const hoje   = hojeLocalISO()
  const limite = addDiasLocalISO(diasAFrente)

  const { data, error } = await supabase
    .from('reserva_trechos')
    .select(`
      id, reserva_id, sentido, ordem,
      origem_iata, destino_iata,
      data_embarque, hora_embarque,
      reservas!inner(
        id, numero, status, metadados,
        clientes!fk_reserva_cliente(id, nome)
      )
    `)
    .eq('reservas.organization_id', orgId)
    .gte('data_embarque', hoje)
    .lte('data_embarque', limite)
    .order('data_embarque', { ascending: true })
    .order('hora_embarque', { ascending: true, nullsFirst: false })
    .order('ordem',         { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as TrechoAgenda[]
}
