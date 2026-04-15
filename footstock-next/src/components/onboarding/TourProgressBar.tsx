'use client'

/**
 * T-013 — Barra de progresso do tour ("Passo X de Y").
 */

import { cn } from '@/lib/utils'

interface TourProgressBarProps {
  current: number    // índice zero-based
  total: number
  className?: string
}

export function TourProgressBar({ current, total, className }: TourProgressBarProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs text-[#929AA5]" aria-live="polite">
        Passo {current + 1} de {total}
      </span>
      <div
        className="flex gap-1"
        role="progressbar"
        aria-valuenow={current + 1}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label="Progresso do tour"
      >
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-all duration-300',
              i <= current ? 'bg-[#F0B90B]' : 'bg-[rgba(240,185,11,.18)]'
            )}
          />
        ))}
      </div>
    </div>
  )
}
