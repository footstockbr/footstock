import { cn } from '@/lib/utils/cn'
import { Card } from './Card'

export interface StatCardProps {
  label: string
  value: string | number
  subValue?: string
  icon?: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
  isLoading?: boolean
  className?: string
}

const trendStyles = {
  up: 'text-price-up',
  down: 'text-price-down',
  neutral: 'text-price-neutral',
}

/**
 * Card de estatistica com label, valor principal, subvalor e indicador de tendencia.
 * Suporta skeleton loading.
 */
export function StatCard({
  label,
  value,
  subValue,
  icon,
  trend,
  isLoading,
  className,
}: StatCardProps) {
  if (isLoading) {
    return (
      <Card className={cn('flex flex-col gap-2', className)}>
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-7 w-32 rounded" />
        <div className="skeleton h-3 w-20 rounded" />
      </Card>
    )
  }

  return (
    <Card className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted uppercase tracking-wide">{label}</span>
        {icon && (
          <span className="text-text-muted" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            'text-xl font-bold font-mono tabular-nums',
            trend ? trendStyles[trend] : 'text-text-primary'
          )}
        >
          {value}
        </span>
        {subValue && (
          <span className={cn('text-xs', trend ? trendStyles[trend] : 'text-text-secondary')}>
            {subValue}
          </span>
        )}
      </div>
    </Card>
  )
}
