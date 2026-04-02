'use client'

// ============================================================================
// Foot Stock — AssetDetailPage
// Orquestra chart, orderbook, stats e comparação do detalhe de ativo.
// ============================================================================

import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowUp, ArrowDown, Minus, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatFS } from '@/lib/utils/formatCurrency'
import { useMarketTick } from '@/hooks/useMarketTick'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { getClubDisplayName } from '@/lib/constants/clubs'
import { PLAN_TYPE } from '@/lib/enums'
import { DynamicPriceChart } from './PriceChart'
import { OrderBookPanel } from './OrderBookPanel'
import { AssetStats } from './AssetStats'
import { SentimentGauge } from './SentimentGauge'
import { CompareMode } from './CompareMode'
import type { Division } from '@/lib/enums'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Ativo serializado — vindo do Server Component (Decimal → number) */
export interface SerializedAsset {
  id: string
  ticker: string
  name: string
  division: Division
  cluster: string
  currentPrice: number
  openPrice: number
  closePrice: number
  volume: number
  marketCap: number
  colorPrimary: string
  colorSecondary: string
  logoUrl: string | null
}

export interface AssetDetailPageProps {
  ticker: string
  assetData: SerializedAsset
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

type Tab = 'grafico' | 'book' | 'stats' | 'comparar'

const TABS: { id: Tab; label: string }[] = [
  { id: 'grafico', label: 'Gráfico' },
  { id: 'book', label: 'Book' },
  { id: 'stats', label: 'Stats' },
  { id: 'comparar', label: 'Comparar' },
]

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function AssetDetailPage({ ticker, assetData }: AssetDetailPageProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const rawTab = searchParams?.get('tab') ?? 'grafico'
  const activeTab: Tab = TABS.some((t) => t.id === rawTab)
    ? (rawTab as Tab)
    : 'grafico'

  const { ticks } = useMarketTick({ tickers: [ticker] })
  const { data: user } = useCurrentUser()

  const tick = ticks.get(ticker)
  const planType = user?.planType ?? PLAN_TYPE.JOGADOR

  // Preço ao vivo ou fallback do servidor
  const livePrice = tick?.price ?? assetData.currentPrice
  const change = tick
    ? tick.change
    : livePrice - assetData.closePrice
  const changePercent = tick
    ? tick.changePercent
    : assetData.closePrice !== 0
    ? ((livePrice - assetData.closePrice) / assetData.closePrice) * 100
    : 0

  const isPositive = change >= 0
  const isZero = change === 0
  const displayName = getClubDisplayName(ticker, assetData.name)

  // Sentimento derivado da variação percentual (clamped -1..+1)
  const sentimentValue = Math.max(-1, Math.min(1, changePercent / 10))

  // Spread sintético baseado no preço
  const spread = livePrice * 0.001
  const bid = livePrice
  const ask = livePrice + spread

  function handleTabChange(tab: Tab) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('tab', tab)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col min-h-0">
      {/* Header */}
      <header className="flex flex-col gap-1 pb-4 border-b border-[#2B3139]">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Cor do clube */}
          <div
            className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold text-white"
            style={{ background: assetData.colorPrimary }}
            aria-hidden="true"
          >
            {ticker.slice(0, 2)}
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-[#EAECEF] font-mono">{ticker.toUpperCase()}</h1>
              <span className="text-xs text-[#929AA5] border border-[#2B3139] rounded px-1.5 py-0.5">
                {assetData.division === 'SERIE_A' ? 'Série A' : 'Série B'}
              </span>
            </div>
            <p className="text-sm text-[#929AA5] truncate">{displayName}</p>
          </div>

          {/* Preço e variação */}
          <div className="ml-auto text-right shrink-0">
            <p className="text-2xl font-bold font-mono text-[#EAECEF]">
              {formatFS(livePrice)}
            </p>
            <span
              className={cn(
                'flex items-center justify-end gap-1 text-sm font-mono font-medium',
                isZero
                  ? 'text-[#929AA5]'
                  : isPositive
                  ? 'text-[#0ECB81]'
                  : 'text-[#F6465D]'
              )}
            >
              {isZero ? (
                <Minus className="w-3.5 h-3.5" />
              ) : isPositive ? (
                <ArrowUp className="w-3.5 h-3.5" />
              ) : (
                <ArrowDown className="w-3.5 h-3.5" />
              )}
              {isPositive && change > 0 ? '+' : ''}
              {formatFS(change)} ({isPositive && changePercent > 0 ? '+' : ''}
              {changePercent.toFixed(2)}%)
            </span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav
        aria-label="Seções do ativo"
        className="flex gap-0 border-b border-[#2B3139] mt-0"
        role="tablist"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              'px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab.id
                ? 'border-[#F0B90B] text-[#F0B90B]'
                : 'border-transparent text-[#929AA5] hover:text-[#EAECEF]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Conteúdo das tabs */}
      <div className="flex-1 pt-4">
        {/* Tab: Gráfico */}
        {activeTab === 'grafico' && (
          <div
            id="panel-grafico"
            role="tabpanel"
            aria-labelledby="tab-grafico"
            className="flex flex-col gap-4"
          >
            <DynamicPriceChart ticker={ticker} planType={planType} />

            {/* Gauge de sentimento */}
            <div className="flex justify-center pt-2">
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs text-[#929AA5] flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Sentimento do Mercado
                </span>
                <SentimentGauge value={sentimentValue} />
              </div>
            </div>
          </div>
        )}

        {/* Tab: Book */}
        {activeTab === 'book' && (
          <div
            id="panel-book"
            role="tabpanel"
            aria-labelledby="tab-book"
            className="rounded-xl border border-[#2B3139] bg-[#181A20] overflow-hidden"
          >
            <OrderBookPanel
              ticker={ticker}
              bid={bid}
              ask={ask}
              spread={spread}
            />
          </div>
        )}

        {/* Tab: Stats */}
        {activeTab === 'stats' && (
          <div
            id="panel-stats"
            role="tabpanel"
            aria-labelledby="tab-stats"
            className="flex flex-col gap-6"
          >
            <AssetStats
              asset={{
                marketCap: assetData.marketCap,
                currentPrice: livePrice,
                openPrice: assetData.openPrice,
                closePrice: assetData.closePrice,
                volume: tick?.volume ?? assetData.volume,
                ticker,
              }}
            />

            {/* Gauge no painel de stats */}
            <div className="flex justify-center pt-2">
              <div className="flex flex-col items-center gap-1">
                <span className="text-xs text-[#929AA5]">Sentimento do Mercado</span>
                <SentimentGauge value={sentimentValue} />
              </div>
            </div>
          </div>
        )}

        {/* Tab: Comparar */}
        {activeTab === 'comparar' && (
          <div
            id="panel-comparar"
            role="tabpanel"
            aria-labelledby="tab-comparar"
            className="rounded-xl border border-[#2B3139] bg-[#181A20]"
          >
            <CompareMode
              baseTicker={ticker}
              allAssets={[]}
              canCompare={
                planType === PLAN_TYPE.CRAQUE || planType === PLAN_TYPE.LENDA
              }
              onCompare={(tickers) => {
                const params = new URLSearchParams(searchParams?.toString() ?? '')
                params.set('compare', tickers.join(','))
                router.replace(`?${params.toString()}`, { scroll: false })
              }}
              onClose={() => handleTabChange('grafico')}
            />
          </div>
        )}
      </div>

      {/* Barra fixa de ação (bottom) */}
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-40',
          'flex gap-3 p-3 pb-safe',
          'bg-[#0B0E11]/95 backdrop-blur border-t border-[#2B3139]',
          'lg:static lg:mt-6 lg:bg-transparent lg:border-0 lg:backdrop-blur-none lg:pb-3 lg:z-auto'
        )}
      >
        <Link
          href={`/ordens/nova?ticker=${ticker}&side=BUY`}
          className={cn(
            'flex-1 py-3 rounded-xl text-center text-sm font-bold transition-colors',
            'bg-[#0ECB81] text-[#0B0E11] hover:bg-[#0ECB81]/90 active:scale-95'
          )}
        >
          Comprar
        </Link>
        <Link
          href={`/ordens/nova?ticker=${ticker}&side=SELL`}
          className={cn(
            'flex-1 py-3 rounded-xl text-center text-sm font-bold transition-colors',
            'bg-[#F6465D] text-white hover:bg-[#F6465D]/90 active:scale-95'
          )}
        >
          Vender
        </Link>
      </div>
    </div>
  )
}
