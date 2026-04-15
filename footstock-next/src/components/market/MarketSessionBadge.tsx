'use client'

import { useState, useRef } from 'react'
import { cn } from '@/lib/utils'
import { MarketSession, SESSION_COLORS, SESSION_LABELS } from '@/lib/constants/market'
import { useMarketSession } from '@/hooks/useMarketSession'
import { formatCountdown } from '@/lib/services/session-service'
import { TOOLTIP_MESSAGES } from '@/components/market/MarketSessionTooltip'

interface MarketSessionBadgeProps {
  compact?: boolean
  className?: string
}

export function MarketSessionBadge({ compact = false, className }: MarketSessionBadgeProps) {
  const { session, countdownSeconds, isLoading, error } = useMarketSession()
  const [showTooltip, setShowTooltip] = useState(false)
  const tooltipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleMouseEnter() {
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current)
    setShowTooltip(true)
  }

  function handleMouseLeave() {
    tooltipTimeout.current = setTimeout(() => setShowTooltip(false), 150)
  }

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
        aria-label="Sessão de mercado: indispon��vel"
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
  const isNegociacao = session === MarketSession.TRADING || session === MarketSession.CLOSING_CALL
  const countdownText = countdownSeconds > 0 ? `em ${formatCountdown(countdownSeconds)}` : ''
  const tooltipMessage = TOOLTIP_MESSAGES[session]
  const ariaLabel = compact
    ? `Sessão: ${label}`
    : `Sessão de mercado: ${label}${countdownText ? `, próxima transição ${countdownText}` : ''}`

  return (
    <div
      className={cn('relative flex items-center gap-1.5', className)}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
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

      {showTooltip && (
        <div
          className={cn(
            'absolute top-full right-0 mt-2 z-50',
            'w-64 rounded-lg border border-[rgba(240,185,11,.15)]',
            'bg-[rgba(20,19,15,0.96)] backdrop-blur-md',
            'px-3 py-2.5 shadow-lg',
            'pointer-events-none'
          )}
          role="tooltip"
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            <span className="text-xs font-semibold text-[#EAECEF]">{label}</span>
          </div>
          <p className="text-[11px] leading-relaxed text-[#B7BDC6]">
            {tooltipMessage}
          </p>
        </div>
      )}
    </div>
  )
}
