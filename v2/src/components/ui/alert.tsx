import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type AlertVariant = 'default' | 'success' | 'warning' | 'destructive' | 'info'

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant
  title?: string
  onClose?: () => void
}

const variantStyles: Record<AlertVariant, { wrapper: string; icon: React.ReactNode }> = {
  default: {
    wrapper: 'border-border bg-muted/50 text-foreground',
    icon: <Info className="h-4 w-4 text-muted-foreground" />,
  },
  success: {
    wrapper: 'border-success/30 bg-success-subtle text-success-subtle-foreground',
    icon: <CheckCircle2 className="h-4 w-4 text-success" />,
  },
  warning: {
    wrapper: 'border-warning/30 bg-warning-subtle text-warning-subtle-foreground',
    icon: <AlertTriangle className="h-4 w-4 text-warning" />,
  },
  destructive: {
    wrapper: 'border-destructive/30 bg-destructive/5 text-destructive',
    icon: <AlertCircle className="h-4 w-4 text-destructive" />,
  },
  info: {
    wrapper: 'border-info/30 bg-info-subtle text-info-subtle-foreground',
    icon: <Info className="h-4 w-4 text-info" />,
  },
}

export function Alert({ variant = 'default', title, onClose, className, children, ...props }: AlertProps) {
  const { wrapper, icon } = variantStyles[variant]

  return (
    <div
      role="alert"
      className={cn('relative flex gap-3 rounded-lg border p-4', wrapper, className)}
      {...props}
    >
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        {title && <p className="mb-0.5 text-sm font-medium">{title}</p>}
        {children && <div className="text-sm opacity-90">{children}</div>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Fechar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
