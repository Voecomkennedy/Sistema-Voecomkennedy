import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import * as svc from '@/services/operacionalService'
import { getPrimeiroTrechoRepresentativo } from '@/lib/operacionalUtils'
import type { ReservaMetadados, TrechoAgenda } from '@/services/operacionalService'

export type { ReservaMetadados }

// ── Representativo por reserva ─────────────────────────────────

export interface ItemAgenda {
  reservaId: string
  reservaNumero: number
  reservaStatus: string
  reservaMetadados: ReservaMetadados
  clienteNome: string | null
  trecho: TrechoAgenda
}

/**
 * Agrupa trechos por reserva_id e seleciona o representativo:
 *   a) primeiro com sentido = 'ida'
 *   b) caso contrário, primeiro trecho disponível
 * Retorna array serializable (não Map) compatível com React Query.
 */
function buildAgenda(trechos: TrechoAgenda[]): ItemAgenda[] {
  const porReserva = new Map<string, TrechoAgenda[]>()
  for (const t of trechos) {
    const lista = porReserva.get(t.reserva_id) ?? []
    lista.push(t)
    porReserva.set(t.reserva_id, lista)
  }

  const resultado: ItemAgenda[] = []
  for (const lista of porReserva.values()) {
    const trecho = getPrimeiroTrechoRepresentativo(lista)
    if (!trecho) continue
    const r = trecho.reservas
    resultado.push({
      reservaId:        r.id,
      reservaNumero:    r.numero,
      reservaStatus:    r.status,
      reservaMetadados: (r.metadados ?? {}) as ReservaMetadados,
      clienteNome:      r.clientes?.nome ?? null,
      trecho,
    })
  }

  // Garantir ordenação por data_embarque / hora_embarque após agrupamento
  resultado.sort((a, b) => {
    const da = a.trecho.data_embarque ?? ''
    const db = b.trecho.data_embarque ?? ''
    if (da !== db) return da < db ? -1 : 1
    const ha = a.trecho.hora_embarque ?? ''
    const hb = b.trecho.hora_embarque ?? ''
    return ha < hb ? -1 : 1
  })

  return resultado
}

// ── Hook: agenda de check-ins ──────────────────────────────────

export function useAgendaCheckins(diasAFrente = 30) {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  return useQuery({
    queryKey: ['agenda-checkins', orgId, diasAFrente] as const,
    queryFn: async () => {
      const trechos = await svc.listarTrechosFuturos(orgId, diasAFrente)
      return buildAgenda(trechos)
    },
    enabled: Boolean(orgId),
    staleTime: 5 * 60 * 1000,
  })
}

// ── Hook: atualizar metadados ──────────────────────────────────

export function useAtualizarMetadados() {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      reservaId,
      patch,
    }: {
      reservaId: string
      patch: Partial<ReservaMetadados>
    }) => {
      if (!orgId) throw new Error('Organização não encontrada. Faça login novamente.')
      return svc.atualizarMetadados(reservaId, orgId, patch)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservas'] })
      qc.invalidateQueries({ queryKey: ['agenda-checkins'] })
    },
  })
}
