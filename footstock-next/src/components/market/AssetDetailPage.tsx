'use client'

import dynamic from 'next/dynamic'
import { useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { IChartApi, type Range, type Time } from 'lightweight-charts'
import { Lock, Info } from 'lucide-react'
import { useMarketTick } from '@/hooks/useMarketTick'
import { useCircuitBreakerAlert } from '@/hooks/useCircuitBreakerAlert'
import { usePlanGuard } from '@/hooks/usePlanGuard'
import { ChartPeriod } from '@/hooks/usePriceHistory'
import { assignChartColors } from '@/lib/utils/colorCollision'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Modal } from '@/components/ui/modal'
import { OrderForm } from '@/components/orders/OrderForm'
import { OrderBook } from '@/components/market/OrderBook'
import { AssetStats } from '@/components/market/AssetStats'
import { SentimentGauge } from '@/components/market/SentimentGauge'
import { CompareMode } from '@/components/market/CompareMode'
// Lazy-load gráficos — lightweight-charts usa window no topo do módulo
const PriceChart = dynamic(
  () => import('@/components/market/PriceChart').then((m) => ({ default: m.PriceChart })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] bg-[#1E2329] animate-pulse rounded-lg" />
    ),
  }
)

const OFIChart = dynamic(
  () => import('@/components/market/OFIChart').then((m) => ({ default: m.OFIChart })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[80px] bg-[#1E2329] animate-pulse rounded-lg" />
    ),
  }
)

interface RecentNewsItem {
  title: string
  sentiment: 'BULLISH' | 'NEUTRAL' | 'BEARISH'
  publishedAt: string
}

interface SerializedAsset {
  id: string
  ticker: string
  displayName: string
  division: 'SERIE_A' | 'SERIE_B'
  currentPrice: number
  openPrice: number
  change24h: number
  fairValue: number
  fairValuePremium: number | null
  currentSupply: number
  totalShares: number
  isHalted: boolean
  haltReason?: string | null
  colors: { primary: string; secondary: string }
  colorPrimary: string
  financials: Record<string, unknown> | null
  sentiment: 'BULLISH' | 'NEUTRAL' | 'BEARISH'
  sentimentScore: number
  recentNews: RecentNewsItem[]
  volume24h: number
  updatedAt: string
  logoUrl?: string | null
}

interface AssetDetailPageProps {
  asset: SerializedAsset
  allAssets?: Array<{ ticker: string; displayName: string; colors: { primary: string } }>
}

export function AssetDetailPage({ asset, allAssets = [] }: AssetDetailPageProps) {
  const tick = useMarketTick(asset.ticker)
  const [currentPeriod, setCurrentPeriod] = useState<ChartPeriod>('1M')
  const [orderFormOpen, setOrderFormOpen] = useState<{ side: 'BUY' | 'SELL' } | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareTickers, setCompareTickers] = useState<Array<{ ticker: string; color: string }>>([])

  const priceChartRef = useRef<IChartApi | null>(null)
  const ofiChartRef = useRef<IChartApi | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeTab = searchParams.get('tab') ?? 'book'

  useCircuitBreakerAlert(asset.ticker)

  const { hasAccess } = usePlanGuard()
  const canCompare = hasAccess('CRAQUE')

  const currentPrice = tick?.lastPrice ?? asset.currentPrice
  // Fallback para variação calculada no SSR (openPrice → currentPrice) quando SSE não está disponível
  const change24h = tick?.change24h ?? asset.change24h

  function handleCompare(tickers: string[]) {
    // tickers inclui o baseTicker na posição 0 — removemos para passar só os secundários
    const allWithBase = tickers.map((t) => {
      const a = [asset, ...allAssets].find((x) => x.ticker === t)
      return { ticker: t, primaryColor: a?.colors?.primary ?? '#F0B90B' }
    })
    const colorMap = assignChartColors(allWithBase)
    const secondary = allWithBase
      .filter((a) => a.ticker !== asset.ticker)
      .map((a) => ({ ticker: a.ticker, color: colorMap[a.ticker] }))
    setCompareTickers(secondary)
  }

  function handlePeriodChange(p: ChartPeriod) {
    setCurrentPeriod(p)
    // Sync OFI chart time range with price chart
    if (priceChartRef.current && ofiChartRef.current) {
      const range = priceChartRef.current.timeScale().getVisibleRange()
      if (range) ofiChartRef.current.timeScale().setVisibleRange(range)
    }
  }

  function handleChartReady(type: 'price' | 'ofi') {
    return (chart: IChartApi) => {
      if (type === 'price') {
        priceChartRef.current = chart
        chart.timeScale().subscribeVisibleTimeRangeChange((range: Range<Time> | null) => {
          if (range && ofiChartRef.current) {
            ofiChartRef.current.timeScale().setVisibleRange(range)
          }
        })
      } else {
        ofiChartRef.current = chart
      }
    }
  }

  return (
    <div className="flex flex-col pb-32 md:pb-0">
      {/* Header */}
      <header className="flex items-center gap-3 p-4 border-b border-[rgba(240,185,11,.08)]">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 border border-[rgba(240,185,11,.12)]"
          style={{
            background: asset.colorPrimary
              ? `linear-gradient(145deg, ${asset.colorPrimary}, ${asset.colorPrimary}88)`
              : 'linear-gradient(145deg, #F0B90B, #8a6820)',
          }}
        >
          {asset.ticker.slice(0, 3)}
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#EAECEF]">{asset.displayName}</h1>
          <span className="text-xs text-[#929AA5] font-mono">{asset.ticker}</span>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xl font-mono font-bold text-[#EAECEF] inline-flex items-center gap-1">
            FS${currentPrice.toFixed(2)}
            <span title="Ultimo preco negociado do ativo em tempo real" aria-label="Ultimo preco negociado" className="cursor-help">
              <Info className="w-3 h-3 text-[#707A8A]" />
            </span>
          </p>
          <p
            className={`text-xs font-mono flex items-center gap-1 justify-end ${
              change24h >= 0 ? 'text-[#2EBD85]' : 'text-[#F6465D]'
            }`}
          >
            {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
            <span title="Variacao percentual do preco nas ultimas 24 horas" aria-label="Variacao 24h" className="cursor-help">
              <Info className="w-3 h-3 text-[#707A8A]" />
            </span>
          </p>
        </div>
      </header>

      {/* Compare button */}
      <div className="flex justify-end px-4 pt-2">
        <button
          onClick={() => setCompareOpen(true)}
          className="flex items-center gap-1.5 text-xs text-[#929AA5] hover:text-[#EAECEF] border border-[#2B3139] px-3 py-1 rounded-full"
        >
          {canCompare ? null : <Lock className="w-3 h-3" />}
          Comparar
        </button>
      </div>

      {/* Charts */}
      <section className="px-0 md:px-4 mt-3" aria-label="Gráfico de preços">
        <PriceChart
          ticker={asset.ticker}
          primaryColor={asset.colorPrimary ?? asset.colors.primary}
          compareTickers={compareTickers}
          period={currentPeriod}
          onPeriodChange={handlePeriodChange}
          onChartReady={handleChartReady('price')}
        />
        <OFIChart
          ticker={asset.ticker}
          period={currentPeriod}
          onChartReady={handleChartReady('ofi')}
        />
      </section>

      {/* Tabs — largura total */}
      <div className="md:px-4 mt-4">
        <Tabs
          defaultValue={activeTab}
          onValueChange={(tab) =>
            router.replace(`?tab=${tab}`, { scroll: false })
          }
        >
          <TabsList className="w-full">
            <TabsTrigger value="book">Book</TabsTrigger>
            <TabsTrigger value="stats">Estatísticas</TabsTrigger>
            <TabsTrigger value="sentimento">Sentimento</TabsTrigger>
          </TabsList>

          <TabsContent value="book">
            <OrderBook ticker={asset.ticker} />
          </TabsContent>

          <TabsContent value="stats">
            <AssetStats
              asset={asset}
              fairValuePremium={asset.fairValuePremium}
              volume24h={asset.volume24h}
              change24h={asset.change24h}
            />
          </TabsContent>

          <TabsContent value="sentimento">
            <SentimentGauge
              sentiment={asset.sentimentScore}
              recentNews={asset.recentNews}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* OrderForm modal (module-14) */}
      {orderFormOpen && (
        <Modal isOpen onClose={() => setOrderFormOpen(null)}>
          <OrderForm
            ticker={asset.ticker}
            side={orderFormOpen.side}
            onClose={() => setOrderFormOpen(null)}
          />
        </Modal>
      )}

      {/* CompareMode modal */}
      {compareOpen && (
        <Modal isOpen onClose={() => setCompareOpen(false)}>
          <CompareMode
            baseTicker={asset.ticker}
            allAssets={allAssets}
            canCompare={canCompare}
            onCompare={handleCompare}
            onClose={() => setCompareOpen(false)}
          />
        </Modal>
      )}

      {/* Fixed bottom buttons (mobile) */}
      <div className="fixed bottom-16 left-0 right-0 z-30 p-4 bg-gradient-to-t from-[#0B0E11] to-transparent md:hidden">
        <div className="flex gap-2">
          <button
            data-testid="buy-btn"
            onClick={() => setOrderFormOpen({ side: 'BUY' })}
            className="flex-1 py-3 rounded-xl bg-[#2EBD85] text-[#0B0E11] font-bold text-sm"
          >
            Comprar
          </button>
          <button
            data-testid="sell-btn"
            onClick={() => setOrderFormOpen({ side: 'SELL' })}
            className="flex-1 py-3 rounded-xl bg-[#F6465D] text-white font-bold text-sm"
          >
            Vender
          </button>
        </div>
      </div>
    </div>
  )
}
