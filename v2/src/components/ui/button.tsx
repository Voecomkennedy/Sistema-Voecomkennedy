import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

type ButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary' | 'gold' | 'link'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  default:
    'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
  outline:
    'border border-border bg-transparent text-foreground hover:bg-muted hover:border-border/80',
  ghost:
    'bg-transparent text-foreground hover:bg-muted',
  destructive:
    'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm',
  secondary:
    'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  gold:
    'bg-gold text-gold-foreground hover:bg-gold/90 shadow-sm',
  link:
    'bg-transparent text-primary underline-offset-4 hover:underline p-0 h-auto',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-6 text-sm gap-2 rounded-lg',
  icon: 'h-9 w-9 rounded-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'default', size = 'md', loading, disabled, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {loading ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {children}
          </>
        ) : (
          children
        )}
      </button>
    )
  },
)
Button.displayName = 'Button'
