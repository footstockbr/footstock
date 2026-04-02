// ============================================================================
// Foot Stock — RateLimitBadge (module-21/TASK-3/ST004)
// Badge com análises restantes na hora + countdown quando esgotado
// ============================================================================

'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/utils/cn'

interface RateLimitBadgeProps {
  remaining: number
  resetAt: number
  isLoading: boolean
}

function formatCountdown(resetAt: number): string {
  if (!resetAt || isNaN(resetAt)) return '00:00'
  const diff = Math.max(0, resetAt - Date.now())
  const totalSeconds = Math.floor(diff / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * Exibe análises restantes com código de cor por urgência.
 * Quando remaining=0: mostra countdown regressivo até resetAt.
 * aria-live="polite" para screen readers.
 */
export function RateLimitBadge({ remaining, resetAt, isLoading }: RateLimitBadgeProps) {
  const [countdown, setCountdown] = useState(() => formatCountdown(resetAt))

  useEffect(() => {
    if (remaining > 0) return

    // Atualizar countdown a cada segundo quando esgotado
    setCountdown(formatCountdown(resetAt))
    const interval = setInterval(() => {
      setCountdown(formatCountdown(resetAt))
    }, 1000)

    return () => clearInterval(interval)
  }, [remaining, resetAt])

  if (isLoading) {
    return <Skeleton className="h-7 w-36 rounded-full" />
  }

  const color =
    remaining >= 5
      ? 'text-emerald-400'
      : remaining >= 1
      ? 'text-yellow-400'
      : 'text-red-400'

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full',
        'border border-[#1e2a3a] bg-[#0f1923] px-3 py-1.5',
        'text-xs font-medium',
        color
      )}
    >
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {remaining > 0 ? (
        <span>{remaining} análise{remaining !== 1 ? 's' : ''} restante{remaining !== 1 ? 's' : ''}</span>
      ) : (
        <span>Disponível em {countdown}</span>
      )}
    </div>
  )
}
