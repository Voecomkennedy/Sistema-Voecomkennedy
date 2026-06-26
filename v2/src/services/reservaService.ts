import { supabase } from '@/lib/supabase'
import type { TablesInsert, TablesUpdate, Reserva, ReservaTrecho, ReservaPassageiro } from '@/types/database'

type ReservaInsertPayload = Omit<TablesInsert<'reservas'>, 'numero' | 'organization_id'>

export type ReservaComCliente = Reserva & {
  clientes: { id: string; nome: string } | null
}

export type PassageiroVinculado = ReservaPassageiro & {
  passageiros: { nome: string; cpf: string | null; passaporte: string | null }
}

// ── Reservas ───────────────────────────────────────────────────
export async function listarReservas(organizationId: string): Promise<ReservaComCliente[]> {
  const { data, error } = await supabase
    .from('reservas')
    .select('*, clientes!fk_reserva_cliente(id, nome)')
    .eq('organization_id', organizationId)
    .order('numero', { ascending: false })
  if (error) throw error
  return data as ReservaComCliente[]
}

export async function criarReserva(
  organizationId: string,
  payload: ReservaInsertPayload,
): Promise<Reserva> {
  const { data, error } = await supabase
    .from('reservas')
    .insert({ ...payload, organization_id: organizationId, numero: 0 })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function atualizarReserva(
  id: string,
  organizationId: string,
  payload: TablesUpdate<'reservas'>,
): Promise<Reserva> {
  const { data, error } = await supabase
    .from('reservas')
    .update(payload)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Trechos ────────────────────────────────────────────────────
export async function listarTrechos(
  reservaId: string,
  organizationId: string,
): Promise<ReservaTrecho[]> {
  const { data, error } = await supabase
    .from('reserva_trechos')
    .select('*')
    .eq('reserva_id', reservaId)
    .eq('organization_id', organizationId)
    .order('ordem')
  if (error) throw error
  return data
}

export async function criarTrecho(
  payload: TablesInsert<'reserva_trechos'>,
): Promise<ReservaTrecho> {
  const { data, error } = await supabase
    .from('reserva_trechos')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function atualizarTrecho(
  id: string,
  organizationId: string,
  payload: TablesUpdate<'reserva_trechos'>,
): Promise<ReservaTrecho> {
  const { data, error } = await supabase
    .from('reserva_trechos')
    .update(payload)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function excluirTrecho(id: string, organizationId: string): Promise<void> {
  const { error } = await supabase
    .from('reserva_trechos')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw error
}

// ── Passageiros da reserva ─────────────────────────────────────
export async function listarPassageirosReserva(
  reservaId: string,
  organizationId: string,
): Promise<PassageiroVinculado[]> {
  const { data, error } = await supabase
    .from('reserva_passageiros')
    .select('*, passageiros!fk_rp_passageiro(nome, cpf, passaporte)')
    .eq('reserva_id', reservaId)
    .eq('organization_id', organizationId)
  if (error) throw error
  return data as PassageiroVinculado[]
}

export async function vincularPassageiro(
  payload: TablesInsert<'reserva_passageiros'>,
): Promise<ReservaPassageiro> {
  const { data, error } = await supabase
    .from('reserva_passageiros')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function desvincularPassageiro(id: string, organizationId: string): Promise<void> {
  const { error } = await supabase
    .from('reserva_passageiros')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw error
}
