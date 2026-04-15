'use client'

// T-022: Badge que indica delay de cotação por plano.
// Retorna null quando isDelayed=false — não ocupa espaço no layout para LENDA.
import { cn } from '@/lib/utils'
import { Clock } from 'lucide-react'

interface PriceBadgeProps {
  isDelayed: boolean
  delayMinutes: number
  className?: string
  size?: 'sm' | 'md'
  /** 'chip' = badge arredondado; 'inline' = texto sem borda */
  variant?: 'chip' | 'inline'
}

/**
 * Exibe badge de cotação atrasada para planos CRAQUE e JOGADOR.
 * Nunca exibido para LENDA (retorna null).
 *
 * Exemplos:
 * - JOGADOR: "Cotação com 1h de atraso"
 * - CRAQUE: "Cotação com 30min de atraso"
 */
export function PriceBadge({
  isDelayed,
  delayMinutes,
  className,
  size = 'sm',
  variant = 'chip',
}: PriceBadgeProps) {
  if (!isDelayed || delayMinutes <= 0) return null

  const label =
    delayMinutes >= 60
      ? `Cotação com ${Math.round(delayMinutes / 60)}h de atraso`
      : `Cotação com ${Math.round(delayMinutes)}min de atraso`

  if (variant === 'inline') {
    return (
      <span
        className={cn(
          'text-[#F59E0B] font-semibold',
          size === 'sm' ? 'text-[10px]' : 'text-xs',
          className
        )}
        aria-label={label}
        data-testid="price-badge-inline"
      >
        {label}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 bg-[#F59E0B]/20 text-[#F59E0B] font-semibold rounded-full border border-[#F59E0B]/30 select-none',
        size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1',
        className
      )}
      aria-label={label}
      data-testid="price-badge"
    >
      <Clock className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} aria-hidden="true" />
      {label}
    </span>
  )
}
