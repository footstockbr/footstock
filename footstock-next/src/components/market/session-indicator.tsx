'use client'

// ============================================================================
// Foot Stock — SessionIndicator
// Badge colorido da sessão de mercado atual com countdown e auto-refresh 15s.
// ============================================================================

import { cn } from '@/lib/utils'
import { MarketSession, SESSION_COLORS, SESSION_LABELS } from '@/lib/constants/market'
import { useMarketSession, useCountdown } from '@/hooks/useMarketSession'
import { formatCountdown } from '@/lib/services/session-service'

interface SessionIndicatorProps {
  /** Modo compacto: exibe apenas o dot colorido, sem texto e sem countdown. */
  compact?: boolean
  className?: string
}

export function SessionIndicator({ compact = false, className }: SessionIndicatorProps) {
  const { session, countdownSeconds, isLoading, error } = useMarketSession()

  if (isLoading) {
    return (
      <div
        className={cn('flex items-center gap-1.5', className)}
        role="status"
        aria-live="polite"
        aria-label="Carregando sessão de mercado"
      >
        <span className="w-2 h-2 rounded-full bg-[#3a3730] animate-pulse shrink-0" />
        {!compact && <span className="w-16 h-3 rounded bg-[#3a3730] animate-pulse" />}
      </div>
    )
  }

  if (error) {
    return (
      <div
        className={cn('flex items-center gap-1.5', className)}
        role="status"
        aria-live="polite"
        aria-label="Sessão de mercado: indisponível"
      >
        <span className="w-2 h-2 rounded-full bg-[#6b7280] shrink-0" />
        {!compact && (
          <span className="text-xs font-medium text-[#6b7280]">Indisponível</span>
        )}
      </div>
    )
  }

  const color = SESSION_COLORS[session]
  const label = SESSION_LABELS[session]
  const isNegociacao = session === MarketSession.REGULAR
  const countdownText = countdownSeconds > 0 ? `em ${formatCountdown(countdownSeconds)}` : ''
  const ariaLabel = compact
    ? `Sessão: ${label}`
    : `Sessão de mercado: ${label}${countdownText ? `, próxima transição ${countdownText}` : ''}`

  return (
    <div
      className={cn('flex items-center gap-1.5', className)}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
    >
      {/* Dot — pulsante apenas em NEGOCIACAO */}
      <span
        className={cn(
          'w-2 h-2 rounded-full shrink-0 transition-all duration-300',
          isNegociacao && 'animate-pulse'
        )}
        style={{
          backgroundColor: color,
          boxShadow: `0 0 6px ${color}`,
        }}
        aria-hidden="true"
      />

      {!compact && (
        <>
          <span
            className="text-xs font-medium transition-colors duration-300"
            style={{ color }}
          >
            {label}
          </span>
          {countdownText && (
            <span className="text-xs text-[#929AA5]">{countdownText}</span>
          )}
        </>
      )}
    </div>
  )
}
