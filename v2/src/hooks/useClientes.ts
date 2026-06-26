import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import * as svc from '@/services/clienteService'
import type { TablesInsert, TablesUpdate } from '@/types/database'

const queryKey = (orgId: string, ativo: boolean | null) => ['clientes', orgId, ativo]

export function useClientes(ativo: boolean | null = true) {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  return useQuery({
    queryKey: queryKey(orgId, ativo),
    queryFn: () => svc.listarClientes(orgId, ativo),
    enabled: Boolean(orgId),
  })
}

export function useCreateCliente() {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<TablesInsert<'clientes'>, 'organization_id'>) => {
      if (!orgId) throw new Error('Organização não encontrada. Faça login novamente.')
      return svc.criarCliente({ ...data, organization_id: orgId })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  })
}

export function useUpdateCliente() {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TablesUpdate<'clientes'> }) => {
      if (!orgId) throw new Error('Organização não encontrada. Faça login novamente.')
      return svc.atualizarCliente(id, orgId, data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  })
}
