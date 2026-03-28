'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { IChartApi, type Range, type Time } from 'lightweight-charts'
import { Lock } from 'lucide-react'
import { useMarketTick } from '@/hooks/useMarketTick'
import { useCircuitBreakerAlert } from '@/hooks/useCircuitBreakerAlert'
import { usePlanGuard } from '@/hooks/usePlanGuard'
import { ChartPeriod } from '@/hooks/usePriceHistory'
import { assignChartColors } from '@/lib/utils/colorCollision'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Modal } from '@/components/ui/modal'
import { OrderBook } from '@/components/market/OrderBook'
import { AssetStats } from '@/components/market/AssetStats'
import { SentimentGauge } from '@/components/market/SentimentGauge'
import { CompareMode } from '@/components/market/CompareMode'
import type { Asset } from '@/types'

// Lazy-load gráficos — lightweight-charts usa window no topo do módulo
const PriceChart = dynamic(
  () => import('@/components/market/PriceChart').then((m) => ({ default: m.PriceChart })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[300px] bg-[#141210] animate-pulse rounded-lg" />
    ),
  }
)

const OFIChart = dynamic(
  () => import('@/components/market/OFIChart').then((m) => ({ default: m.OFIChart })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[80px] bg-[#141210] animate-pulse rounded-lg" />
    ),
  }
)

interface AssetDetailPageProps {
  asset: Asset & {
    fairValuePremium: number | null
    logoUrl?: string | null
  }
  allAssets?: Array<{ ticker: string; displayName: string; colors: { primary: string } }>
}

export function AssetDetailPage({ asset, allAssets = [] }: AssetDetailPageProps) {
  const tick = useMarketTick(asset.ticker)
  const [currentPeriod, setCurrentPeriod] = useState<ChartPeriod>('1M')
  const [orderFormOpen, setOrderFormOpen] = useState<{ side: 'BUY' | 'SELL' } | null>(null)
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareColors, setCompareColors] = useState<Record<string, string>>({})
  const priceChartRef = useRef<IChartApi | null>(null)
  const ofiChartRef = useRef<IChartApi | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeTab = searchParams.get('tab') ?? 'book'

  useCircuitBreakerAlert(asset.ticker)

  const { hasAccess } = usePlanGuard()
  const canCompare = hasAccess('CRAQUE')

  const currentPrice = tick?.lastPrice ?? asset.currentPrice
  const change24h = tick?.change24h ?? 0

  function handleCompare(tickers: string[]) {
    const selected = tickers.map((t) => {
      const a = [asset, ...allAssets].find(
        (x) => x.ticker === t
      )
      return { ticker: t, primaryColor: a?.colors?.primary ?? '#C9A84C' }
    })
    const colors = assignChartColors(selected)
    setCompareColors(colors)
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
      <header className="flex items-center gap-3 p-4 border-b border-[rgba(201,168,76,.08)]">
        <Image
          src={asset.logoUrl ?? '/placeholder-club.svg'}
          alt={asset.displayName}
          width={40}
          height={40}
          priority
          className="rounded-full"
          onError={(e) => {
            ;(e.target as HTMLImageElement).src = '/placeholder-club.svg'
          }}
        />
        <div>
          <h1 className="text-lg font-bold text-[#F0EAD6]">{asset.displayName}</h1>
          <span className="text-xs text-[#7a7060] font-mono">{asset.ticker}</span>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xl font-mono font-bold text-[#F0EAD6]">
            FS${currentPrice.toFixed(2)}
          </p>
          <p
            className={`text-xs font-mono ${
              change24h >= 0 ? 'text-[#22c55e]' : 'text-[#ef4444]'
            }`}
          >
            {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
          </p>
        </div>
      </header>

      {/* Compare button */}
      <div className="flex justify-end px-4 pt-2">
        <button
          onClick={() => setCompareOpen(true)}
          className="flex items-center gap-1.5 text-xs text-[#7a7060] hover:text-[#F0EAD6] border border-[#2a2010] px-3 py-1 rounded-full"
        >
          {canCompare ? null : <Lock className="w-3 h-3" />}
          Comparar
        </button>
      </div>

      {/* Charts */}
      <section className="px-0 md:px-4 mt-3" aria-label="Gráfico de preços">
        <PriceChart
          ticker={asset.ticker}
          colors={{
            primary: compareColors[asset.ticker] ?? asset.colors.primary,
          }}
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

      {/* Desktop layout: 65/35 split */}
      <div className="md:grid md:grid-cols-[65fr_35fr] md:gap-4 md:px-4 mt-4">
        {/* Tabs */}
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
            <AssetStats asset={asset} fairValuePremium={asset.fairValuePremium} />
          </TabsContent>

          <TabsContent value="sentimento">
            <SentimentGauge
              sentiment={
                asset.sentiment === 'BULLISH'
                  ? 0.7
                  : asset.sentiment === 'BEARISH'
                  ? -0.7
                  : 0
              }
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* OrderForm stub (module-14 contract) */}
      {orderFormOpen && (
        <Modal isOpen onClose={() => setOrderFormOpen(null)}>
          <div className="p-4 text-[#7a7060] text-sm">
            <h2 className="text-[#F0EAD6] font-semibold mb-2">
              {orderFormOpen.side === 'BUY' ? 'Comprar' : 'Vender'} {asset.ticker}
            </h2>
            <p>OrderForm — a ser implementado no module-14</p>
            <p className="text-xs mt-1">
              Ticker: {asset.ticker} | Side: {orderFormOpen.side}
            </p>
          </div>
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
      <div className="fixed bottom-16 left-0 right-0 z-30 p-4 bg-gradient-to-t from-[#080808] to-transparent md:hidden">
        <div className="flex gap-2">
          <button
            data-testid="buy-btn"
            onClick={() => setOrderFormOpen({ side: 'BUY' })}
            className="flex-1 py-3 rounded-xl bg-[#22c55e] text-[#080808] font-bold text-sm"
          >
            Comprar
          </button>
          <button
            data-testid="sell-btn"
            onClick={() => setOrderFormOpen({ side: 'SELL' })}
            className="flex-1 py-3 rounded-xl bg-[#ef4444] text-white font-bold text-sm"
          >
            Vender
          </button>
        </div>
      </div>
    </div>
  )
}
