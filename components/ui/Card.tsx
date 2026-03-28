import { cn } from '@/lib/utils/cn'

export type CardVariant = 'default' | 'elevated' | 'outlined'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Variante visual do card */
  variant?: CardVariant
  /** Padding interno — padrao md */
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-bg-card border border-border-default',
  elevated: 'bg-bg-elevated border border-border-default shadow-lg',
  outlined: 'bg-transparent border border-border-default',
}

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

/** Container de conteudo com fundo dark */
export function Card({
  variant = 'default',
  padding = 'md',
  children,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn('rounded-lg', variantStyles[variant], paddingStyles[padding], className)}
      {...props}
    >
      {children}
    </div>
  )
}

/** Header do Card */
export function CardHeader({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)} {...props}>
      {children}
    </div>
  )
}

/** Titulo do Card */
export function CardTitle({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-sm font-semibold text-text-primary', className)} {...props}>
      {children}
    </h3>
  )
}
