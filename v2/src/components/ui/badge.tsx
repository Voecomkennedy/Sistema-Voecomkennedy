import { cn } from '@/lib/utils'

type BadgeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'gold'
  | 'info'
  | 'outline'
  // Status semânticos de reserva
  | 'cotacao'
  | 'confirmada'
  | 'em_operacao'
  | 'concluida'
  | 'cancelada'
  // Urgência de check-in
  | 'critico'
  | 'urgente'
  | 'atencao'
  | 'normal'
  // Status de lançamento financeiro
  | 'fin_pendente'
  | 'fin_recebido'
  | 'fin_pago'
  | 'fin_em_atraso'
  | 'fin_cancelado'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success-subtle text-success-subtle-foreground',
  warning: 'bg-warning-subtle text-warning-subtle-foreground',
  destructive: 'bg-destructive/10 text-destructive',
  gold: 'bg-gold-subtle text-gold-subtle-foreground',
  info: 'bg-info-subtle text-info-subtle-foreground',
  outline: 'border border-border text-foreground bg-transparent',
  // Reserva status
  cotacao: 'bg-muted text-muted-foreground',
  confirmada: 'bg-success-subtle text-success-subtle-foreground',
  em_operacao: 'bg-info-subtle text-info-subtle-foreground',
  concluida: 'bg-primary/10 text-primary',
  cancelada: 'bg-destructive/10 text-destructive',
  // Check-in urgência
  critico: 'bg-destructive/10 text-destructive',
  urgente: 'bg-warning-subtle text-warning-subtle-foreground',
  atencao: 'bg-gold-subtle text-gold-subtle-foreground',
  normal: 'bg-muted text-muted-foreground',
  // Lançamento financeiro
  fin_pendente:  'bg-muted text-muted-foreground',
  fin_recebido:  'bg-success-subtle text-success-subtle-foreground',
  fin_pago:      'bg-success-subtle text-success-subtle-foreground',
  fin_em_atraso: 'bg-destructive/10 text-destructive',
  fin_cancelado: 'border border-border text-muted-foreground bg-transparent',
}

const statusLabels: Partial<Record<BadgeVariant, string>> = {
  cotacao: 'Cotação',
  confirmada: 'Confirmada',
  em_operacao: 'Em Operação',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
  critico: 'Crítico',
  urgente: 'Urgente',
  atencao: 'Atenção',
  normal: 'Normal',
}

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children ?? statusLabels[variant]}
    </span>
  )
}
