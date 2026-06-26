'use client'

import dynamic from 'next/dynamic'
import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { IChartApi, type Range, type Time } from 'lightweight-charts'
import { Lock, Info } from 'lucide-react'
import { GlossaryInfoIcon } from '@/components/ui/glossary-info-icon'
import { ClubCrest } from '@/components/market/ClubCrest'
import { useMarketTick } from '@/hooks/useMarketTick'
import { useCircuitBreakerAlert } from '@/hooks/useCircuitBreakerAlert'
import { usePlanGuard } from '@/hooks/usePlanGuard'
import { useMotorStatusContext } from '@/contexts/motor-status-context'
import { useBalance } from '@/hooks/useBalance'
import { ChartPeriod } from '@/hooks/usePriceHistory'
import { assignChartColors } from '@/lib/utils/colorCollision'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Modal } from '@/components/ui/modal'
import { OrderForm } from '@/components/orders/OrderForm'
import { ShortForm } from '@/components/orders/ShortForm'
import { OrderBook } from '@/components/market/OrderBook'
import { AssetStats } from '@/components/market/AssetStats'
import { SentimentGauge } from '@/components/market/SentimentGauge'
import { CompareMode } from '@/components/market/CompareMode'
import { useAnalytics } from '@/hooks/useAnalytics'
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
  const [currentPeriod, setCurrentPeriod] = useState<ChartPeriod>('1H')
  const [orderFormOpen, setOrderFormOpen] = useState<{ side: 'BUY' | 'SELL' } | null>(null)
  const [shortFormOpen, setShortFormOpen] = useState(false)
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareTickers, setCompareTickers] = useState<Array<{ ticker: string; color: string }>>([])

  const priceChartRef = useRef<IChartApi | null>(null)
  const ofiChartRef = useRef<IChartApi | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeTab = searchParams.get('tab') ?? 'book'
  const { track } = useAnalytics()

  // Limiar e duração do circuit breaker (SSoT do admin) — evita exibir "8%"/"5 minutos"
  // hardcoded quando o admin altera os valores. Fallback (8% / 5min) se a leitura falhar.
  const [cbThresholdPct, setCbThresholdPct] = useState(8)
  const [cbHaltMin, setCbHaltMin] = useState(5)
  useEffect(() => {
    let active = true
    fetch('/api/v1/market/circuit-breaker-info', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!active || !j?.data) return
        if (typeof j.data.thresholdPct === 'number') setCbThresholdPct(j.data.thresholdPct)
        if (typeof j.data.haltDurationMin === 'number') setCbHaltMin(j.data.haltDurationMin)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  // EVT-017: asset_detail_viewed — rastreia visualizacao da pagina de detalhe do ativo
  useEffect(() => {
    track('asset_detail_viewed', {
      asset_ticker: asset.ticker,
      asset_serie: asset.division === 'SERIE_A' ? 'A' : 'B',
      plan: 'JOGADOR' as const,
    })
  }, [asset.ticker, asset.division, track])

  useCircuitBreakerAlert(asset.ticker)

  const { hasAccess } = usePlanGuard()
  const canCompare = hasAccess('CRAQUE')
  const { isOffline: isMotorOffline } = useMotorStatusContext()
  const { fsBalance } = useBalance()
  const isBuyBlocked = fsBalance !== null && fsBalance <= 0

  const currentPrice = tick?.lastPrice ?? asset.currentPrice
  // Fallback para variação calculada no SSR (openPrice → currentPrice) quando SSE não está disponível
  const change24h = tick?.change24h ?? asset.change24h
  // Halt estado: prioriza tick em tempo real (SSE), fallback para dado SSR
  const isHalted = tick?.isHalted ?? asset.isHalted

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
    <div data-testid="asset-detail-page" className="flex flex-col pb-32 md:pb-0">
      {/* Header */}
      <header data-testid="asset-detail-header" className="flex items-center gap-3 p-4 border-b border-[rgba(240,185,11,.08)]">
        <ClubCrest
          ticker={asset.ticker}
          colorPrimary={asset.colors?.primary ?? asset.colorPrimary}
          colorSecondary={asset.colors?.secondary}
        />
        <div>
          <h1 className="text-lg font-bold text-[#EAECEF]">{asset.displayName}</h1>
          <span className="text-xs text-[#929AA5] font-mono">{asset.ticker}</span>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xl font-mono font-bold text-[#EAECEF] inline-flex items-center gap-1">
            FS${currentPrice.toFixed(2)}
            <span title="Último preço negociado do ativo em tempo real" aria-label="Último preço negociado" className="cursor-help">
              <Info className="w-3 h-3 text-[#707A8A]" />
            </span>
          </p>
          <p
            className={`text-xs font-mono flex items-center gap-1 justify-end ${
              change24h >= 0 ? 'text-[#2EBD85]' : 'text-[#F6465D]'
            }`}
          >
            {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
            <span title="Variação percentual do preço nas últimas 24 horas" aria-label="Variação 24h" className="cursor-help">
              <Info className="w-3 h-3 text-[#707A8A]" />
            </span>
          </p>
        </div>
      </header>

      {/* Compare button — escondido para JOGADOR (FDD CTA-003 / TASK-011) */}
      {canCompare && (
        <div className="flex justify-end px-4 pt-2">
          <button
            onClick={() => setCompareOpen(true)}
            className="flex items-center gap-1.5 text-xs text-[#929AA5] hover:text-[#EAECEF] border border-[#2B3139] px-3 py-1 rounded-full"
          >
            Comparar
          </button>
        </div>
      )}

      {/* Circuit breaker halt banner — atualizado via tick SSE em tempo real */}
      {isHalted && (
        <div
          data-testid="halt-banner"
          className="mx-4 mt-2 rounded-lg bg-[rgba(246,70,93,.1)] border border-[rgba(246,70,93,.25)] px-3 py-2.5"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-[#F6465D] animate-pulse">SUSPENSO</span>
            <span className="text-xs text-[#929AA5]">
              Negociação suspensa por circuit breaker{(tick?.haltReason ?? asset.haltReason) ? `: ${tick?.haltReason ?? asset.haltReason}` : ''}
            </span>
            <GlossaryInfoIcon fieldKey="circuit-breaker" size={12} />
          </div>
          <p className="text-[11px] text-[#707A8A]">
            O circuit breaker é ativado quando a variação acumulada do ativo atinge {cbThresholdPct}%.
            As negociações são retomadas automaticamente após {cbHaltMin} minuto{cbHaltMin === 1 ? '' : 's'} ou por liberação do administrador.
            Ordens existentes permanecem na fila e são executadas ao retomar.
          </p>
        </div>
      )}

      {/* Charts */}
      <section
        className="px-0 md:px-4 mt-3"
        aria-label="Gráfico de preços"
        data-tour="chart-area"
      >
        <PriceChart
          ticker={asset.ticker}
          primaryColor={asset.colorPrimary ?? asset.colors.primary}
          compareTickers={compareTickers}
          period={currentPeriod}
          onPeriodChange={handlePeriodChange}
          onChartReady={handleChartReady('price')}
        />
        <div data-tour="ofi-chart">
          <OFIChart
            ticker={asset.ticker}
            period={currentPeriod}
            onChartReady={handleChartReady('ofi')}
          />
        </div>
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
            <TabsTrigger value="sentimento">Sentimento <GlossaryInfoIcon fieldKey="sentimento-de-mercado" size={11} /></TabsTrigger>
          </TabsList>

          <TabsContent value="book">
            <OrderBook ticker={asset.ticker} />
          </TabsContent>

          <TabsContent value="stats" data-testid="asset-detail-stats">
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

      {/* Desktop buy/sell/short buttons — visible only on md+ */}
      <div className="hidden md:block px-4 mt-4">
        {isHalted ? (
          <div className="w-full py-3 rounded-xl bg-[rgba(246,70,93,.1)] border border-[rgba(246,70,93,.25)] text-center">
            <p className="text-xs font-bold text-[#F6465D]">Negociação suspensa</p>
            <p className="text-[10px] text-[#929AA5] mt-0.5">Circuit breaker ativo — aguarde a retomada</p>
          </div>
        ) : isMotorOffline ? (
          <div className="w-full py-3 rounded-xl text-center" style={{ backgroundColor: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)' }}>
            <p className="text-xs font-bold" style={{ color: '#f97316' }}>Mercado em manutenção</p>
            <p className="text-[10px] text-[#929AA5] mt-0.5">Ordens suspensas temporariamente</p>
          </div>
        ) : (
          <>
            {isBuyBlocked && (
              <div role="alert" className="mb-2 flex items-center gap-2 text-xs text-[#F6465D] bg-[rgba(246,70,93,.08)] border border-[rgba(246,70,93,.2)] rounded-lg px-3 py-2">
                <span className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true">&#9888;</span>
                Saldo zerado — venda posições para negociar.
              </div>
            )}
            <div className="flex gap-2">
              <button
                data-testid="buy-btn-desktop"
                onClick={() => !isBuyBlocked && setOrderFormOpen({ side: 'BUY' })}
                disabled={isBuyBlocked}
                title={isBuyBlocked ? 'Saldo FS$ zerado. Venda posições para negociar novamente.' : undefined}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-opacity ${isBuyBlocked ? 'bg-[#2EBD85]/40 text-[#0B0E11]/60 cursor-not-allowed' : 'bg-[#2EBD85] text-[#0B0E11]'}`}
              >
                Comprar
              </button>
              <button
                data-testid="sell-btn-desktop"
                onClick={() => setOrderFormOpen({ side: 'SELL' })}
                className="flex-1 py-3 rounded-xl bg-[#F6465D] text-white font-bold text-sm"
              >
                Vender
              </button>
              <button
                data-testid="short-btn-desktop"
                onClick={() => setShortFormOpen(true)}
                className="px-3 py-3 rounded-xl bg-[#2B3139] text-[#F6465D] font-bold text-xs border border-[#F6465D]/40"
                title="Short Selling (Lenda)"
              >
                Short
              </button>
            </div>
          </>
        )}
      </div>

      {/* OrderForm modal (module-14) */}
      {orderFormOpen && (
        <Modal isOpen onClose={() => setOrderFormOpen(null)}>
          <OrderForm
            ticker={asset.ticker}
            side={orderFormOpen.side}
            onClose={() => setOrderFormOpen(null)}
            fsBalance={fsBalance ?? undefined}
          />
        </Modal>
      )}

      {/* ShortForm modal (module-14 — Lenda only) */}
      {shortFormOpen && (
        <Modal isOpen onClose={() => setShortFormOpen(false)} data-testid="short-modal">
          <ShortForm
            ticker={asset.ticker}
            assetName={asset.displayName}
            onSuccess={() => setShortFormOpen(false)}
            onClose={() => setShortFormOpen(false)}
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
        {isHalted ? (
          <div
            data-testid="halt-buttons-overlay"
            className="w-full py-3 rounded-xl bg-[rgba(246,70,93,.1)] border border-[rgba(246,70,93,.25)] text-center"
          >
            <p className="text-xs font-bold text-[#F6465D]">Negociação suspensa</p>
            <p className="text-[10px] text-[#929AA5] mt-0.5">Circuit breaker ativo — aguarde a retomada</p>
          </div>
        ) : isMotorOffline ? (
          <div
            data-testid="motor-offline-buttons-overlay"
            className="w-full py-3 rounded-xl text-center"
            style={{ backgroundColor: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)' }}
          >
            <p className="text-xs font-bold" style={{ color: '#f97316' }}>Mercado em manutenção</p>
            <p className="text-[10px] text-[#929AA5] mt-0.5">Ordens suspensas temporariamente</p>
          </div>
        ) : (
          <>
          {isBuyBlocked && (
            <div
              role="alert"
              data-testid="balance-zero-bar-banner"
              className="mb-2 flex items-center gap-2 text-xs text-[#F6465D] bg-[rgba(246,70,93,.08)] border border-[rgba(246,70,93,.2)] rounded-lg px-3 py-2"
            >
              <span className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true">&#9888;</span>
              Saldo zerado — venda posições para negociar.
            </div>
          )}
          <div className="flex gap-2">
            <button
              data-testid="buy-btn"
              onClick={() => !isBuyBlocked && setOrderFormOpen({ side: 'BUY' })}
              disabled={isBuyBlocked}
              title={isBuyBlocked ? 'Saldo FS$ zerado. Venda posições para negociar novamente.' : undefined}
              className={`flex-1 py-3 rounded-xl font-bold text-sm transition-opacity ${isBuyBlocked ? 'bg-[#2EBD85]/40 text-[#0B0E11]/60 cursor-not-allowed' : 'bg-[#2EBD85] text-[#0B0E11]'}`}
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
            <button
              data-testid="short-btn"
              onClick={() => setShortFormOpen(true)}
              className="px-3 py-3 rounded-xl bg-[#2B3139] text-[#F6465D] font-bold text-xs border border-[#F6465D]/40"
              title="Short Selling (Lenda)"
            >
              Short
            </button>
          </div>
          </>
        )}
      </div>
    </div>
  )
}
