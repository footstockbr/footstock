import { cn } from '@/lib/utils/cn'

export interface PriceDisplayProps {
  /** Preco atual */
  price: number
  /** Variacao percentual (-100 a +100) */
  change?: number
  /** Exibir variacao */
  showChange?: boolean
  /** Tamanho do texto */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  'data-testid'?: string
}

const sizeMap = {
  sm: { price: 'text-sm', change: 'text-xs' },
  md: { price: 'text-base', change: 'text-xs' },
  lg: { price: 'text-xl font-bold', change: 'text-sm' },
  xl: { price: 'text-2xl font-bold', change: 'text-sm' },
}

/** Exibe preco FS$ com indicador de variacao colorido */
export function PriceDisplay({
  price,
  change,
  showChange = true,
  size = 'md',
  className,
  'data-testid': dataTestId,
}: PriceDisplayProps) {
  const isPositive = (change ?? 0) > 0
  const isNegative = (change ?? 0) < 0
  const changeColor = isPositive
    ? 'text-price-up'
    : isNegative
      ? 'text-price-down'
      : 'text-price-neutral'
  const changePrefix = isPositive ? '+' : ''

  return (
    <div className={cn('flex items-baseline gap-2 font-mono', className)} data-testid={dataTestId}>
      <span className={cn('text-text-primary tabular-nums', sizeMap[size].price)}>
        FS${price.toFixed(2)}
      </span>
      {showChange && change !== undefined && (
        <span className={cn('tabular-nums', changeColor, sizeMap[size].change)}>
          {changePrefix}
          {change.toFixed(2)}%
        </span>
      )}
    </div>
  )
}
