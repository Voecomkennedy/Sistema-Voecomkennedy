import { Badge } from '@/components/ui/badge'
import { getDisplayStatus } from '@/services/financeiroService'
import type { FinanceiroLancamento } from '@/types/database'

type DisplayStatus = ReturnType<typeof getDisplayStatus>

const BADGE_VARIANT: Record<DisplayStatus, Parameters<typeof Badge>[0]['variant']> = {
  pendente:   'fin_pendente',
  recebido:   'fin_recebido',
  pago:       'fin_pago',
  em_atraso:  'fin_em_atraso',
  cancelado:  'fin_cancelado',
}

const LABEL: Record<DisplayStatus, string> = {
  pendente:   'Pendente',
  recebido:   'Recebido',
  pago:       'Pago',
  em_atraso:  'Em Atraso',
  cancelado:  'Cancelado',
}

interface StatusLancamentoBadgeProps {
  lancamento: Pick<FinanceiroLancamento, 'status' | 'data_vencimento'>
}

export function StatusLancamentoBadge({ lancamento }: StatusLancamentoBadgeProps) {
  const display = getDisplayStatus(lancamento)
  return (
    <Badge variant={BADGE_VARIANT[display]}>
      {LABEL[display]}
    </Badge>
  )
}
