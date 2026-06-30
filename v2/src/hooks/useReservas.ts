import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import * as svc from '@/services/reservaService'
import type { TablesInsert, TablesUpdate } from '@/types/database'

type CreateReservaInput = Omit<
  TablesInsert<'reservas'>,
  'numero' | 'organization_id' | 'consultor_id'
>
type CreateTrechoInput = Omit<
  TablesInsert<'reserva_trechos'>,
  'reserva_id' | 'organization_id'
>

const qkReservas = (orgId: string) => ['reservas', orgId] as const
const qkTrechos = (reservaId: string, orgId: string) => ['trechos', reservaId, orgId] as const
const qkPassageirosReserva = (reservaId: string, orgId: string) =>
  ['reserva-passageiros', reservaId, orgId] as const

export function useReservas() {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  return useQuery({
    queryKey: qkReservas(orgId),
    queryFn: () => svc.listarReservas(orgId),
    enabled: Boolean(orgId),
  })
}

export function useCreateReserva() {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  const userId = useAuthStore((s) => s.profile?.id ?? '')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateReservaInput) => {
      if (!orgId) throw new Error('Organização não encontrada. Faça login novamente.')
      return svc.criarReserva(orgId, { ...data, consultor_id: userId || null })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas'] }),
  })
}

export function useUpdateReserva() {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TablesUpdate<'reservas'> }) => {
      if (!orgId) throw new Error('Organização não encontrada. Faça login novamente.')
      return svc.atualizarReserva(id, orgId, data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas'] }),
  })
}

export function useCancelarReserva() {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo?: string | null }) => {
      if (!orgId) throw new Error('Organização não encontrada. Faça login novamente.')
      return svc.cancelarReserva(id, orgId, motivo)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas'] }),
  })
}

// ── Trechos ────────────────────────────────────────────────────
export function useTrechos(reservaId: string | null) {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  return useQuery({
    queryKey: qkTrechos(reservaId ?? '', orgId),
    queryFn: () => svc.listarTrechos(reservaId!, orgId),
    enabled: Boolean(reservaId && orgId),
  })
}

export function useCreateTrecho() {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ reservaId, data }: { reservaId: string; data: CreateTrechoInput }) => {
      if (!orgId) throw new Error('Organização não encontrada. Faça login novamente.')
      return svc.criarTrecho({ ...data, reserva_id: reservaId, organization_id: orgId })
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: qkTrechos(vars.reservaId, orgId) }),
  })
}

export function useUpdateTrecho() {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      reservaId: string
      data: TablesUpdate<'reserva_trechos'>
    }) => {
      if (!orgId) throw new Error('Organização não encontrada. Faça login novamente.')
      return svc.atualizarTrecho(id, orgId, data)
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: qkTrechos(vars.reservaId, orgId) }),
  })
}

export function useDeleteTrecho() {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; reservaId: string }) => {
      if (!orgId) throw new Error('Organização não encontrada. Faça login novamente.')
      return svc.excluirTrecho(id, orgId)
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: qkTrechos(vars.reservaId, orgId) }),
  })
}

// ── Passageiros da reserva ─────────────────────────────────────
export function usePassageirosReserva(reservaId: string | null) {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  return useQuery({
    queryKey: qkPassageirosReserva(reservaId ?? '', orgId),
    queryFn: () => svc.listarPassageirosReserva(reservaId!, orgId),
    enabled: Boolean(reservaId && orgId),
  })
}

export function useVincularPassageiro() {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      reservaId,
      passageiroId,
      tipo,
    }: {
      reservaId: string
      passageiroId: string
      tipo: string
    }) => {
      if (!orgId) throw new Error('Organização não encontrada. Faça login novamente.')
      return svc.vincularPassageiro({
        reserva_id: reservaId,
        passageiro_id: passageiroId,
        organization_id: orgId,
        tipo,
      })
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: qkPassageirosReserva(vars.reservaId, orgId) }),
  })
}

export function useDesvincularPassageiro() {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; reservaId: string }) => {
      if (!orgId) throw new Error('Organização não encontrada. Faça login novamente.')
      return svc.desvincularPassageiro(id, orgId)
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: qkPassageirosReserva(vars.reservaId, orgId) }),
  })
}
