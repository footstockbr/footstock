'use client'

// ============================================================================
// Foot Stock — AssetDetailPage
// Orquestra chart, OFI, orderbook, stats, comparação e gráfico comparativo.
// ============================================================================

import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowUp, ArrowDown, Minus, TrendingUp } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils/cn'
import { formatFS } from '@/lib/utils/formatCurrency'
import { useMarketTick } from '@/hooks/useMarketTick'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { getClubDisplayName } from '@/lib/constants/clubs'
import { PLAN_TYPE } from '@/lib/enums'
import { DynamicPriceChart } from './PriceChart'
import { OFIPanel } from './OFIPanel'
import { OrderBookPanel } from './OrderBookPanel'
import { AssetStats } from './AssetStats'
import { SentimentGauge } from './SentimentGauge'
import { CompareMode } from './CompareMode'
import { DynamicCompareChart, resolveCompareColors } from './CompareChart'
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

/** Forma da listagem de ativos da API */
interface AssetListItem {
  ticker: string
  name: string
  colors?: { primary: string; secondary?: string }
  colorPrimary?: string
  colorSecondary?: string
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
// Hook para buscar lista completa de ativos (para CompareMode)
// ---------------------------------------------------------------------------

function useAllAssets() {
  return useQuery<AssetListItem[]>({
    queryKey: ['market-assets-compare-list'],
    queryFn: async () => {
      const res = await fetch('/api/v1/assets?limit=40', { credentials: 'include' })
      if (!res.ok) return []
      const json: { data?: AssetListItem[] } = await res.json()
      return json.data ?? []
    },
    staleTime: 5 * 60_000, // 5 min — lista de ativos raramente muda
  })
}

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

  // Tickers de comparação lidos da URL (?compare=URU3,POR4,TIM3)
  const compareParam = searchParams?.get('compare') ?? ''
  const compareTickers = compareParam
    ? compareParam.split(',').filter((t) => t && t !== ticker).slice(0, 3)
    : []
  const isComparing = compareTickers.length > 0
  const allCompareTickers = isComparing ? [ticker, ...compareTickers] : []

  const { ticks } = useMarketTick({ tickers: [ticker] })
  const { data: user } = useCurrentUser()
  const { data: allAssetsRaw = [] } = useAllAssets()

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

  // Formata allAssets para o CompareMode
  const allAssets = allAssetsRaw.map((a) => ({
    ticker: a.ticker,
    displayName: a.name,
    colors: {
      primary: a.colors?.primary ?? a.colorPrimary ?? '#F0B90B',
      secondary: a.colors?.secondary ?? a.colorSecondary,
    },
  }))

  // displayNames e cores resolvidas para o CompareChart
  const displayNamesMap: Record<string, string> = Object.fromEntries(
    allAssets.map((a) => [a.ticker, a.displayName])
  )
  const assetColorMap: Record<string, { primary: string; secondary?: string }> =
    Object.fromEntries(allAssets.map((a) => [a.ticker, a.colors]))
  // Adiciona o ativo atual ao mapa de cores se não estiver
  if (!assetColorMap[ticker]) {
    assetColorMap[ticker] = {
      primary: assetData.colorPrimary,
      secondary: assetData.colorSecondary,
    }
  }
  const compareColors = isComparing
    ? resolveCompareColors(allCompareTickers, assetColorMap)
    : []

  function handleTabChange(tab: Tab) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    params.set('tab', tab)
    // Limpa compare ao sair da aba comparar
    if (tab !== 'comparar') params.delete('compare')
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  function handleCompareConfirm(tickers: string[]) {
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    // Remove o ticker base e salva apenas os adicionais
    const others = tickers.filter((t) => t !== ticker)
    if (others.length > 0) {
      params.set('compare', others.join(','))
    } else {
      params.delete('compare')
    }
    params.set('tab', 'comparar')
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
            {tab.id === 'comparar' && isComparing && (
              <span className="ml-1 text-[10px] bg-[#F0B90B] text-[#0B0E11] rounded-full px-1.5 py-0.5 font-bold">
                {compareTickers.length}
              </span>
            )}
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

            {/* OFI — Pressão de Fluxo de Ordens (todos os planos) */}
            <OFIPanel ticker={ticker} />

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

            {/* OFI no painel de stats também */}
            <OFIPanel ticker={ticker} />

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
            className="flex flex-col gap-4"
          >
            {/* Seletor de clubes */}
            <div className="rounded-xl border border-[#2B3139] bg-[#181A20]">
              <CompareMode
                baseTicker={ticker}
                allAssets={allAssets}
                canCompare={
                  planType === PLAN_TYPE.CRAQUE || planType === PLAN_TYPE.LENDA
                }
                onCompare={handleCompareConfirm}
                onClose={() => handleTabChange('grafico')}
              />
            </div>

            {/* Gráfico comparativo — exibido quando há tickers selecionados */}
            {isComparing && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-[#EAECEF]">
                  Comparação: {allCompareTickers.join(' vs ')}
                </h3>
                <DynamicCompareChart
                  tickers={allCompareTickers}
                  period="1D"
                  displayNames={displayNamesMap}
                  colors={compareColors}
                />
                <button
                  onClick={() => {
                    const params = new URLSearchParams(searchParams?.toString() ?? '')
                    params.delete('compare')
                    router.replace(`?${params.toString()}`, { scroll: false })
                  }}
                  className="text-xs text-[#929AA5] underline hover:text-[#F6465D] self-start"
                >
                  Limpar comparação
                </button>
              </div>
            )}
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
