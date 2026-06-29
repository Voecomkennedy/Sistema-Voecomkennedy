import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { buscarDocumentoReserva } from '@/services/documentoService'

export function useDocumentoReserva(reservaId: string | null) {
  const orgId = useAuthStore((s) => s.profile?.organization_id ?? '')
  return useQuery({
    queryKey: ['documento', reservaId, orgId],
    queryFn: () => buscarDocumentoReserva(reservaId!, orgId),
    enabled: Boolean(reservaId && orgId),
    staleTime: 2 * 60 * 1000,
  })
}
