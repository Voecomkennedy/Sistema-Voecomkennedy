import { supabase } from '@/lib/supabase'
import type { TablesInsert, TablesUpdate } from '@/types/database'

export async function listarPassageiros(organizationId: string) {
  const { data, error } = await supabase
    .from('passageiros')
    .select('*')
    .eq('organization_id', organizationId)
    .order('nome')
  if (error) throw error
  return data
}

export async function criarPassageiro(payload: TablesInsert<'passageiros'>) {
  const { data, error } = await supabase
    .from('passageiros')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function atualizarPassageiro(
  id: string,
  organizationId: string,
  payload: TablesUpdate<'passageiros'>,
) {
  const { data, error } = await supabase
    .from('passageiros')
    .update(payload)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single()
  if (error) throw error
  return data
}
