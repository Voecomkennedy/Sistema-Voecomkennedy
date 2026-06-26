import { Badge } from '@/components/ui/badge'
import { statusCheckinVariant, statusCheckinLabel } from '@/lib/operacionalUtils'
import type { CheckinStatus } from '@/lib/operacionalUtils'

interface CheckinBadgeProps {
  status?: CheckinStatus
}

export function CheckinBadge({ status }: CheckinBadgeProps) {
  return (
    <Badge variant={statusCheckinVariant(status)}>
      {statusCheckinLabel(status)}
    </Badge>
  )
}
