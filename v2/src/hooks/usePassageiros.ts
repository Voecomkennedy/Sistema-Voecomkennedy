import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import * as svc from '@/services/passageiroService'
import type { TablesInsert, TablesUpdate } from '@/types/database'

const queryKey = (orgId: string) => ['passageiros', orgId]

export function usePassageiros() {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  return useQuery({
    queryKey: queryKey(orgId),
    queryFn: () => svc.listarPassageiros(orgId),
    enabled: Boolean(orgId),
  })
}

export function useCreatePassageiro() {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<TablesInsert<'passageiros'>, 'organization_id'>) => {
      if (!orgId) throw new Error('Organização não encontrada. Faça login novamente.')
      return svc.criarPassageiro({ ...data, organization_id: orgId })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passageiros'] }),
  })
}

export function useUpdatePassageiro() {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TablesUpdate<'passageiros'> }) => {
      if (!orgId) throw new Error('Organização não encontrada. Faça login novamente.')
      return svc.atualizarPassageiro(id, orgId, data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passageiros'] }),
  })
}

export function useDeletePassageiro() {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => {
      if (!orgId) throw new Error('Organização não encontrada. Faça login novamente.')
      return svc.excluirPassageiro(id, orgId)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['passageiros'] }),
  })
}
