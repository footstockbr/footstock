'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface HaltedBadgeProps {
  haltedUntil?: number | null  // Unix ms estimado para retomada
  haltReason?: string | null
  size?: 'sm' | 'md'
  className?: string
}

/** Countdown em segundos até o ativo retomar (atualiza a cada segundo). */
function useCountdown(haltedUntil?: number | null): number {
  const [seconds, setSeconds] = useState<number>(() => {
    if (!haltedUntil) return 0
    return Math.max(0, Math.ceil((haltedUntil - Date.now()) / 1000))
  })

  useEffect(() => {
    if (!haltedUntil) return
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((haltedUntil - Date.now()) / 1000))
      setSeconds(remaining)
      if (remaining <= 0) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [haltedUntil])

  return seconds
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`
}

/**
 * HaltedBadge — badge visual para ativo suspenso por circuit breaker.
 * Exibe "SUSPENSO" com countdown opcional até a retomada.
 */
export function HaltedBadge({ haltedUntil, haltReason: _haltReason, size = 'sm', className }: HaltedBadgeProps) {
  const seconds = useCountdown(haltedUntil)
  const countdown = formatCountdown(seconds)

  return (
    <div className={cn('inline-flex flex-col items-center gap-0.5', className)}>
      <span
        data-testid="halted-badge"
        className={cn(
          'font-semibold tracking-widest uppercase bg-[rgba(240,185,11,.12)] text-[#F0B90B] border border-[rgba(240,185,11,.3)] rounded-sm',
          size === 'sm' ? 'text-[9px] px-1.5 py-0.5' : 'text-[11px] px-2 py-1'
        )}
      >
        Pausado
      </span>
      {countdown && (
        <span
          data-testid="halted-badge-countdown"
          className={cn(
            'font-mono text-[#929AA5]',
            size === 'sm' ? 'text-[9px]' : 'text-[11px]'
          )}
        >
          {countdown}
        </span>
      )}
    </div>
  )
}
