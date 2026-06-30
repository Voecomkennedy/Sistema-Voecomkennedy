import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import * as svc from '@/services/financeiroService'
import type { LancamentoFiltros, LancamentoInsert, LancamentoUpdate } from '@/services/financeiroService'

const qkLancamentos = (orgId: string, mes: string) =>
  ['lancamentos', orgId, mes] as const

export function useLancamentos(mes: string, filtros?: Omit<LancamentoFiltros, 'mes'>) {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  return useQuery({
    queryKey: [...qkLancamentos(orgId, mes), filtros] as const,
    queryFn: () => svc.listarLancamentos(orgId, { ...filtros, mes }),
    enabled: Boolean(orgId),
    staleTime: 5 * 60 * 1000,
  })
}

export function useCriarLancamento() {
  const orgId  = useAuthStore((s) => s.profile?.organization_id ?? '')
  const userId = useAuthStore((s) => s.profile?.id)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dados: LancamentoInsert) => {
      if (!orgId)  throw new Error('Organização não encontrada. Faça login novamente.')
      if (!userId) throw new Error('Sessão expirada. Faça login novamente.')
      return svc.criarLancamento(orgId, userId, dados)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lancamentos'] }),
  })
}

export function useAtualizarLancamento() {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: LancamentoUpdate }) => {
      if (!orgId) throw new Error('Organização não encontrada. Faça login novamente.')
      return svc.atualizarLancamento(orgId, id, patch)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lancamentos'] }),
  })
}

export function useCancelarLancamento() {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => {
      if (!orgId) throw new Error('Organização não encontrada. Faça login novamente.')
      return svc.cancelarLancamento(orgId, id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lancamentos'] }),
  })
}
