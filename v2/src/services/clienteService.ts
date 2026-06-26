import { supabase } from '@/lib/supabase'
import type { TablesInsert, TablesUpdate } from '@/types/database'

export async function listarClientes(
  organizationId: string,
  ativo: boolean | null = true,
) {
  let query = supabase
    .from('clientes')
    .select('*')
    .eq('organization_id', organizationId)
    .order('nome')

  if (ativo !== null) {
    query = query.eq('ativo', ativo)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function criarCliente(payload: TablesInsert<'clientes'>) {
  const { data, error } = await supabase
    .from('clientes')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function atualizarCliente(
  id: string,
  organizationId: string,
  payload: TablesUpdate<'clientes'>,
) {
  const { data, error } = await supabase
    .from('clientes')
    .update(payload)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single()
  if (error) throw error
  return data
}
