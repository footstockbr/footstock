'use client'

// ============================================================================
// Foot Stock — AssetCard
// Card de ativo com preço real-time via SSE, flash de preço e acessibilidade.
// Exibe NOME FICTÍCIO (asset.name) — nunca o nome real do clube.
// ============================================================================

import { memo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { WifiOff, Star } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Badge } from '@/components/ui/Badge'
import { Spark } from '@/components/ui/Spark'
import { PriceDisplay } from '@/components/ui/PriceDisplay'
import { InfoIcon } from '@/components/ui/InfoIcon'
import { FIELD_TERM_MAP } from '@/lib/data/glossary'
import type { TickData } from '@/hooks/useMarketTick'
import { usePriceFlash } from '@/hooks/usePriceFlash'
import type { AssetListItem } from '@/types/market'
import type { Sentiment } from '@/lib/enums'
import { getClubDisplayName } from '@/lib/constants/clubs'

interface AssetCardProps {
  asset: AssetListItem
  isFavorite?: boolean
  tick?: TickData
  isStreamConnected?: boolean
  onClick?: () => void
  className?: string
}

function sentimentLabel(sentiment: Sentiment): string {
  switch (sentiment) {
    case 'MUITO_POSITIVO': return 'MUITO BULLISH'
    case 'POSITIVO': return 'BULLISH'
    case 'NEUTRO': return 'NEUTRO'
    case 'NEGATIVO': return 'BEARISH'
    case 'MUITO_NEGATIVO': return 'MUITO BEARISH'
  }
}

// RESOLVED: T003 – React.memo ausente em AssetCard (hot path SSE)
function AssetCardInner({
  asset,
  isFavorite = false,
  tick,
  isStreamConnected = true,
  onClick,
  className,
}: AssetCardProps) {
  const router = useRouter()
  const displayName = getClubDisplayName(asset.ticker, asset.name)

  // Preços: tick em tempo real tem prioridade; fallback para snapshot da API
  const displayPrice = tick?.price ?? asset.currentPrice
  const displayChange = tick?.changePercent ?? asset.change24h

  // Flash de preço
  const flash = usePriceFlash(displayPrice)
  // Não processar flash se ativo está suspenso
  const flashClass = asset.isHalted
    ? undefined
    : flash === 'up'
      ? 'animate-tick-up'
      : flash === 'down'
        ? 'animate-tick-down'
        : undefined

  function handleClick() {
    if (asset.isHalted) return
    onClick?.()
    router.push(`/mercado/${asset.ticker}`)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  const ariaLabel = [
    `Ativo: ${displayName}`,
    `preço: FS$ ${displayPrice.toFixed(2)}`,
    `variação: ${displayChange >= 0 ? '+' : ''}${displayChange.toFixed(2)}%`,
    asset.isHalted ? 'SUSPENSO' : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      data-testid="asset-card"
      data-testid-ticker={asset.ticker}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative flex flex-col gap-2 p-3 rounded-xl',
        'bg-bg-card border border-border-default cursor-pointer min-h-[88px]',
        'hover:border-accent/30 transition-colors',
        'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
        asset.isHalted && 'opacity-70 pointer-events-none cursor-not-allowed',
        className
      )}
    >
      {/* Linha 1: Avatar + Ticker + Nome + Badge sentimento */}
      <div className="flex items-center gap-2">
        {/* Escudo 40x40 */}
        {asset.logoUrl ? (
          <Image
            src={asset.logoUrl}
            alt={displayName}
            width={40}
            height={40}
            className="rounded-full flex-shrink-0 object-cover"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
            style={{ backgroundColor: asset.colorPrimary }}
            aria-hidden="true"
          >
            {asset.ticker.slice(0, 3)}
          </div>
        )}

        <div className="flex flex-col min-w-0 flex-1">
          <span
            data-testid="asset-card-ticker"
            className="text-sm font-mono font-bold text-text-primary"
          >
            {asset.ticker}
          </span>
          <span
            data-testid="asset-card-name"
            className="text-xs text-text-secondary truncate"
          >
            {displayName}
          </span>
        </div>

        <span className="flex items-center gap-1 flex-shrink-0">
          <Badge
            data-testid="asset-card-sentiment-badge"
            variant="sentiment"
            sentiment={asset.sentiment}
          >
            {sentimentLabel(asset.sentiment)}
          </Badge>
          <InfoIcon glossarySlug={FIELD_TERM_MAP['sentimento-de-mercado']} />
        </span>
      </div>

      {/* Linha 2: Preço + Variação */}
      <div className={cn('flex items-baseline gap-3 rounded px-1', flashClass)}>
        <span className="inline-flex items-center gap-1">
          <PriceDisplay
            data-testid="asset-card-price"
            price={displayPrice}
            change={displayChange}
            showChange={false}
            size="sm"
          />
          <InfoIcon glossarySlug={FIELD_TERM_MAP['preco-fs']} />
        </span>
        <span
          data-testid="asset-card-change"
          className={cn(
            'text-xs font-mono tabular-nums',
            displayChange >= 0 ? 'text-price-up' : 'text-price-down'
          )}
        >
          {displayChange >= 0 ? '▲' : '▼'} {Math.abs(displayChange).toFixed(2)}%
        </span>
      </div>

      {/* Linha 3: Sparkline + OFI */}
      <div className="flex items-end justify-between">
        <span className="inline-flex items-end gap-1">
          <Spark
            data-testid="asset-card-sparkline"
            data={asset.priceHistory}
            width={60}
            height={28}
          />
          <InfoIcon glossarySlug={FIELD_TERM_MAP['volatilidade']} />
        </span>
        {/* Mini-barra OFI: buy/sell visual */}
        <div
          data-testid="asset-card-ofi-bar"
          className="h-1.5 w-16 rounded-full overflow-hidden bg-bg-elevated flex"
          aria-hidden="true"
        >
          <div
            className="h-full bg-price-up"
            style={{ width: displayChange >= 0 ? '60%' : '40%' }}
          />
          <div className="h-full bg-price-down flex-1" />
        </div>
      </div>

      {/* Badge SUSPENSO */}
      {asset.isHalted && (
        <span
          data-testid="asset-card-halted-badge"
          className="absolute top-2 right-2 bg-error/80 text-error-foreground text-xs font-bold px-2 py-0.5 rounded"
        >
          SUSPENSO
        </span>
      )}

      {/* Ícone offline */}
      {!isStreamConnected && (
        <WifiOff
          data-testid="asset-card-offline-icon"
          size={12}
          className="absolute top-2 right-2 text-text-muted"
          aria-hidden="true"
        />
      )}

      {/* Label favorito */}
      {isFavorite && (
        <Star
          size={12}
          className="absolute top-2 left-2 text-accent-gold fill-accent-gold"
          aria-hidden="true"
        />
      )}
    </article>
  )
}

const AssetCard = memo(AssetCardInner, (prev, next) =>
  prev.asset.ticker === next.asset.ticker &&
  prev.tick?.price === next.tick?.price &&
  prev.tick?.changePercent === next.tick?.changePercent &&
  prev.isStreamConnected === next.isStreamConnected &&
  prev.isFavorite === next.isFavorite &&
  prev.asset.isHalted === next.asset.isHalted &&
  prev.className === next.className
)

export default AssetCard
