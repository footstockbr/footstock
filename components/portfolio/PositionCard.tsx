'use client'
// ============================================================================
// Foot Stock — PositionCard (module-15, TASK-3/ST001)
// Card reutilizável para posição REGULAR ou SHORT.
// Rastreabilidade: INT-034, INT-035
// ============================================================================

import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils/cn'
import { Avatar } from '@/components/ui/Avatar'
import { Btn } from '@/components/ui/Btn'
import { PriceDisplay } from '@/components/ui/PriceDisplay'
import { InfoIcon } from '@/components/ui/InfoIcon'
import { FIELD_TERM_MAP } from '@/lib/data/glossary'
import { formatFS } from '@/lib/utils/formatCurrency'
import { POSITION_VARIANT } from '@/lib/enums'
import type { PositionVariant } from '@/lib/enums'
import type { PositionWithPnL } from '@/types/portfolio'

interface PositionCardProps {
  position: PositionWithPnL
  variant: PositionVariant
  onBuyMore?: () => void
  onSell?: () => void
  onCloseShort?: () => void
}

function clubLogoUrl(ticker: string): string {
  return `/assets/clubs/${ticker.toLowerCase()}.png`
}

// RESOLVED: T007 – ariaLabel + pnlColor recomputados a cada render → useMemo + React.memo
function PositionCardInner({
  position,
  variant,
  onBuyMore,
  onSell,
  onCloseShort,
}: PositionCardProps) {
  const pnlColor = useMemo(
    () =>
      position.pnL > 0
        ? 'text-price-up'
        : position.pnL < 0
          ? 'text-price-down'
          : 'text-price-neutral',
    [position.pnL]
  )

  const pnlArrow = useMemo(
    () => (position.pnL > 0 ? '▲' : position.pnL < 0 ? '▼' : '—'),
    [position.pnL]
  )

  const pnlPct = useMemo(
    () =>
      position.pnLPercent !== 0
        ? `${position.pnL >= 0 ? '+' : ''}${position.pnLPercent.toFixed(2)}%`
        : '0,00%',
    [position.pnL, position.pnLPercent]
  )

  const ariaLabel = useMemo(
    () =>
      `Posição em ${position.ticker}: ${position.qty} ações, P&L ${position.pnL >= 0 ? '+' : ''}${position.pnLPercent.toFixed(2)}%`,
    [position.ticker, position.qty, position.pnL, position.pnLPercent]
  )

  return (
    <article
      className="flex items-start justify-between p-3 bg-bg-card rounded-xl border border-border-muted hover:bg-bg-elevated transition-colors"
      aria-label={ariaLabel}
    >
      {/* Lado esquerdo: avatar + info */}
      <div className="flex items-center gap-3 min-w-0">
        <Avatar
          src={clubLogoUrl(position.ticker)}
          alt={position.clubName}
          size="sm"
          className="flex-shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{position.ticker}</p>
          <p className="text-xs text-text-muted">{position.qty} ações</p>
        </div>
      </div>

      {/* Centro: preço (somente REGULAR) */}
      {variant === POSITION_VARIANT.REGULAR && (
        <div className="hidden sm:block mx-2">
          <PriceDisplay
            price={position.currentPrice}
            change={position.avgPrice > 0
              ? ((position.currentPrice - position.avgPrice) / position.avgPrice) * 100
              : 0}
            size="sm"
          />
        </div>
      )}

      {/* Lado direito: P&L + ações */}
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <p className={cn('text-sm font-medium', pnlColor)}>
          {pnlArrow} {formatFS(position.pnL)}
        </p>
        <p className={cn('text-xs', pnlColor)}>{pnlPct}</p>

        {variant === POSITION_VARIANT.REGULAR && (
          <div className="flex gap-1 mt-1">
            <Btn
              variant="ghost"
              size="sm"
              onClick={onBuyMore}
              aria-label={`Comprar mais ${position.ticker}`}
            >
              Comprar Mais
            </Btn>
            <Btn
              variant="ghost"
              size="sm"
              onClick={onSell}
              aria-label={`Vender ${position.ticker}`}
            >
              Vender
            </Btn>
          </div>
        )}

        {variant === POSITION_VARIANT.SHORT && (
          <div className="mt-1">
            <p className="text-xs text-text-muted">
              Margem <InfoIcon glossarySlug={FIELD_TERM_MAP['margem']} />: {formatFS(position.marginBlocked ?? 0)}
            </p>
            <p className="text-xs text-text-muted">
              Aluguel: {formatFS(position.accruedRent ?? 0)}
            </p>
            <Btn
              variant="ghost"
              size="sm"
              className="mt-1 border-error text-error hover:bg-error/10"
              onClick={onCloseShort}
              aria-label={`Fechar short ${position.ticker}`}
            >
              Fechar Short
            </Btn>
          </div>
        )}
      </div>
    </article>
  )
}

export const PositionCard = memo(PositionCardInner)
