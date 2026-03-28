'use client'

// ============================================================================
// Foot Stock — AssetCard
// Card de ativo com preço real-time via SSE, flash de preço e acessibilidade.
// Exibe NOME FICTÍCIO (asset.name) — nunca o nome real do clube.
// ============================================================================

import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { WifiOff, Star } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Badge } from '@/components/ui/Badge'
import { Spark } from '@/components/ui/Spark'
import { PriceDisplay } from '@/components/ui/PriceDisplay'
import { useMarketTick } from '@/hooks/useMarketTick'
import { usePriceFlash } from '@/hooks/usePriceFlash'
import type { AssetListItem } from '@/types/market'
import type { Sentiment } from '@/lib/enums'

interface AssetCardProps {
  asset: AssetListItem
  isFavorite?: boolean
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

export default function AssetCard({ asset, isFavorite = false, onClick, className }: AssetCardProps) {
  const router = useRouter()

  // Hook SSE — subscreve apenas o ticker deste card
  const { ticks, isConnected } = useMarketTick({
    tickers: [asset.ticker],
  })

  const tick = ticks.get(asset.ticker)

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
    `Ativo: ${asset.name}`,
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
        'hover:border-violet-500/30 transition-colors',
        'focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2',
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
            alt={asset.name}
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
            {asset.name}
          </span>
        </div>

        <Badge
          data-testid="asset-card-sentiment-badge"
          variant="sentiment"
          sentiment={asset.sentiment}
          className="flex-shrink-0"
        >
          {sentimentLabel(asset.sentiment)}
        </Badge>
      </div>

      {/* Linha 2: Preço + Variação */}
      <div className={cn('flex items-baseline gap-3 rounded px-1', flashClass)}>
        <PriceDisplay
          data-testid="asset-card-price"
          price={displayPrice}
          change={displayChange}
          showChange={false}
          size="sm"
        />
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
        <Spark
          data-testid="asset-card-sparkline"
          data={asset.priceHistory}
          width={60}
          height={28}
        />
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
      {!isConnected && (
        <WifiOff
          data-testid="asset-card-offline-icon"
          size={12}
          className="absolute top-2 right-2 text-text-tertiary"
          aria-hidden="true"
        />
      )}

      {/* Label favorito */}
      {isFavorite && (
        <Star
          size={12}
          className="absolute top-2 left-2 text-violet-400 fill-violet-400"
          aria-hidden="true"
        />
      )}
    </article>
  )
}
