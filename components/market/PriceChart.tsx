'use client'

// ============================================================================
// Foot Stock — PriceChart
// Gráfico de candlestick com indicadores técnicos via lightweight-charts v5.
// MM9/MM21 exclusivos do plano LENDA; Bollinger disponível para todos.
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Skeleton } from '@/components/ui/Skeleton'
import { usePriceHistory, type PricePeriod, type OHLCBar } from '@/hooks/usePriceHistory'
import { useUpgradePrompt } from '@/hooks/useUpgradePrompt'
import { PLAN_TYPE } from '@/lib/enums'
import type {
  IChartApi,
  ISeriesApi,
  SeriesType,
  Time,
  CandlestickData,
  LineData,
  CandlestickSeriesPartialOptions,
  LineSeriesPartialOptions,
} from 'lightweight-charts'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Indicator = 'MM9' | 'MM21' | 'BOLLINGER'

export interface PriceChartProps {
  ticker: string
  planType: string
  className?: string
}

// ---------------------------------------------------------------------------
// Helpers: cálculo de indicadores
// ---------------------------------------------------------------------------

function calcSMA(bars: OHLCBar[], period: number): LineData<Time>[] {
  const result: LineData<Time>[] = []
  for (let i = period - 1; i < bars.length; i++) {
    const slice = bars.slice(i - period + 1, i + 1)
    const avg = slice.reduce((sum, b) => sum + b.close, 0) / period
    const bar = bars[i]
    if (bar) result.push({ time: bar.time as Time, value: avg })
  }
  return result
}

function calcBollinger(
  bars: OHLCBar[],
  period = 20,
  stdDev = 2
): { upper: LineData<Time>[]; lower: LineData<Time>[]; mid: LineData<Time>[] } {
  const upper: LineData<Time>[] = []
  const lower: LineData<Time>[] = []
  const mid: LineData<Time>[] = []

  for (let i = period - 1; i < bars.length; i++) {
    const bar = bars[i]
    if (!bar) continue
    const slice = bars.slice(i - period + 1, i + 1)
    const avg = slice.reduce((s, b) => s + b.close, 0) / period
    const variance = slice.reduce((s, b) => s + (b.close - avg) ** 2, 0) / period
    const sd = Math.sqrt(variance)
    const t = bar.time as Time
    upper.push({ time: t, value: avg + stdDev * sd })
    lower.push({ time: t, value: avg - stdDev * sd })
    mid.push({ time: t, value: avg })
  }

  return { upper, lower, mid }
}

// ---------------------------------------------------------------------------
// Componente interno
// ---------------------------------------------------------------------------

const PERIODS: PricePeriod[] = ['1H', '1D', '1W', '1M', '3M', '1Y']
const PERIOD_LABELS: Record<PricePeriod, string> = {
  '1H': '1H',
  '1D': '1D',
  '1W': '1S',
  '1M': '1M',
  '3M': '3M',
  '1Y': '1A',
}

function PriceChartInner({ ticker, planType, className }: PriceChartProps) {
  const [period, setPeriod] = useState<PricePeriod>('1D')
  const [activeIndicators, setActiveIndicators] = useState<Set<Indicator>>(new Set())

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const mm9Ref = useRef<ISeriesApi<SeriesType> | null>(null)
  const mm21Ref = useRef<ISeriesApi<SeriesType> | null>(null)
  const bbuRef = useRef<ISeriesApi<SeriesType> | null>(null)
  const bblRef = useRef<ISeriesApi<SeriesType> | null>(null)
  const bbmRef = useRef<ISeriesApi<SeriesType> | null>(null)

  const { data: bars, isLoading, isError, refetch } = usePriceHistory(ticker, period)
  const { open: openUpgrade } = useUpgradePrompt()

  const isLenda = planType === PLAN_TYPE.LENDA

  // ---------------------------------------------------------------------------
  // Inicializa gráfico (lightweight-charts v5 API)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!chartContainerRef.current) return

    let chart: IChartApi
    let ro: ResizeObserver

    async function initChart() {
      const lc = await import('lightweight-charts')
      const { createChart, CandlestickSeries: candlestickDef } = lc

      chart = createChart(chartContainerRef.current!, {
        width: chartContainerRef.current!.offsetWidth,
        height: 400,
        layout: {
          background: { color: 'transparent' },
          textColor: '#929AA5',
          fontFamily: "'Inter', sans-serif",
        },
        grid: {
          vertLines: { color: '#1E2329' },
          horzLines: { color: '#1E2329' },
        },
        crosshair: {
          vertLine: { color: '#F0B90B', labelBackgroundColor: '#181A20' },
          horzLine: { color: '#F0B90B', labelBackgroundColor: '#181A20' },
        },
        rightPriceScale: {
          borderColor: '#2B3139',
        },
        timeScale: {
          borderColor: '#2B3139',
          timeVisible: true,
          secondsVisible: false,
        },
        handleScroll: true,
        handleScale: true,
      })

      chartRef.current = chart

      const candleOpts: CandlestickSeriesPartialOptions = {
        upColor: '#0ECB81',
        downColor: '#F6465D',
        borderUpColor: '#0ECB81',
        borderDownColor: '#F6465D',
        wickUpColor: '#0ECB81',
        wickDownColor: '#F6465D',
      }

      candleSeriesRef.current = chart.addSeries(candlestickDef, candleOpts)

      // Resize observer
      ro = new ResizeObserver(() => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.offsetWidth,
          })
        }
      })
      ro.observe(chartContainerRef.current!)
    }

    initChart().catch(console.error)

    return () => {
      ro?.disconnect()
      chart?.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      mm9Ref.current = null
      mm21Ref.current = null
      bbuRef.current = null
      bblRef.current = null
      bbmRef.current = null
    }
   
  }, []) // somente mount/unmount

  // ---------------------------------------------------------------------------
  // Atualiza dados de velas
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!candleSeriesRef.current || !bars?.length) return

    const candleData: CandlestickData<Time>[] = bars.map((b) => ({
      time: b.time as Time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }))

    candleSeriesRef.current.setData(candleData)
    chartRef.current?.timeScale().fitContent()
  }, [bars])

  // ---------------------------------------------------------------------------
  // Remove indicadores existentes
  // ---------------------------------------------------------------------------

  const clearIndicatorSeries = useCallback(() => {
    if (!chartRef.current) return
    if (mm9Ref.current) { chartRef.current.removeSeries(mm9Ref.current); mm9Ref.current = null }
    if (mm21Ref.current) { chartRef.current.removeSeries(mm21Ref.current); mm21Ref.current = null }
    if (bbuRef.current) { chartRef.current.removeSeries(bbuRef.current); bbuRef.current = null }
    if (bblRef.current) { chartRef.current.removeSeries(bblRef.current); bblRef.current = null }
    if (bbmRef.current) { chartRef.current.removeSeries(bbmRef.current); bbmRef.current = null }
  }, [])

  // ---------------------------------------------------------------------------
  // Atualiza indicadores
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!chartRef.current || !bars?.length) return

    clearIndicatorSeries()

    async function applyIndicators() {
      const lc = await import('lightweight-charts')
      const { LineSeries: lineSeriesDef } = lc

      if (!chartRef.current) return

      const lineOpts = (color: string, dashed = false): LineSeriesPartialOptions => ({
        color,
        lineWidth: dashed ? 1 : 2,
        lineStyle: dashed ? 2 : 0,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })

      if (activeIndicators.has('MM9') && bars) {
        const series = chartRef.current.addSeries(lineSeriesDef, lineOpts('#06b6d4'))
        series.setData(calcSMA(bars, 9))
        mm9Ref.current = series
      }

      if (activeIndicators.has('MM21') && bars) {
        const series = chartRef.current.addSeries(lineSeriesDef, lineOpts('#f97316'))
        series.setData(calcSMA(bars, 21))
        mm21Ref.current = series
      }

      if (activeIndicators.has('BOLLINGER') && bars) {
        const { upper, lower, mid } = calcBollinger(bars)
        const upperS = chartRef.current.addSeries(lineSeriesDef, lineOpts('#a855f7', true))
        const lowerS = chartRef.current.addSeries(lineSeriesDef, lineOpts('#a855f7', true))
        const midS = chartRef.current.addSeries(lineSeriesDef, lineOpts('#a855f7'))
        upperS.setData(upper)
        lowerS.setData(lower)
        midS.setData(mid)
        bbuRef.current = upperS
        bblRef.current = lowerS
        bbmRef.current = midS
      }
    }

    applyIndicators().catch(console.error)
  }, [activeIndicators, bars, clearIndicatorSeries])

  // ---------------------------------------------------------------------------
  // Toggle indicador
  // ---------------------------------------------------------------------------

  function toggleIndicator(ind: Indicator) {
    if ((ind === 'MM9' || ind === 'MM21') && !isLenda) {
      openUpgrade('MM9 + MM21')
      return
    }
    setActiveIndicators((prev) => {
      const next = new Set(prev)
      if (next.has(ind)) {
        next.delete(ind)
      } else {
        next.add(ind)
      }
      return next
    })
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Controles de período */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                period === p
                  ? 'bg-[#F0B90B] text-[#0B0E11]'
                  : 'bg-[#1E2329] text-[#929AA5] hover:bg-[#2B3139] hover:text-[#EAECEF]'
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Indicadores */}
        <div className="flex gap-1">
          {/* MM9 — LENDA */}
          <button
            onClick={() => toggleIndicator('MM9')}
            aria-pressed={activeIndicators.has('MM9')}
            title={isLenda ? 'Média Móvel 9 períodos' : 'MM9 disponível no plano Lenda'}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border',
              activeIndicators.has('MM9')
                ? 'bg-[#06b6d4]/20 border-[#06b6d4] text-[#06b6d4]'
                : 'bg-transparent border-[#2B3139] text-[#929AA5] hover:border-[#06b6d4] hover:text-[#06b6d4]'
            )}
          >
            {!isLenda && <Lock className="w-3 h-3" />}
            MM9
          </button>

          {/* MM21 — LENDA */}
          <button
            onClick={() => toggleIndicator('MM21')}
            aria-pressed={activeIndicators.has('MM21')}
            title={isLenda ? 'Média Móvel 21 períodos' : 'MM21 disponível no plano Lenda'}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border',
              activeIndicators.has('MM21')
                ? 'bg-[#f97316]/20 border-[#f97316] text-[#f97316]'
                : 'bg-transparent border-[#2B3139] text-[#929AA5] hover:border-[#f97316] hover:text-[#f97316]'
            )}
          >
            {!isLenda && <Lock className="w-3 h-3" />}
            MM21
          </button>

          {/* Bollinger — todos */}
          <button
            onClick={() => toggleIndicator('BOLLINGER')}
            aria-pressed={activeIndicators.has('BOLLINGER')}
            title="Bandas de Bollinger (20, 2)"
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border',
              activeIndicators.has('BOLLINGER')
                ? 'bg-[#a855f7]/20 border-[#a855f7] text-[#a855f7]'
                : 'bg-transparent border-[#2B3139] text-[#929AA5] hover:border-[#a855f7] hover:text-[#a855f7]'
            )}
          >
            BB
          </button>
        </div>
      </div>

      {/* Área do gráfico */}
      <div className="relative w-full" style={{ minHeight: 300 }}>
        {isLoading && (
          <div className="absolute inset-0 z-10">
            <Skeleton className="w-full h-full rounded-xl" />
          </div>
        )}

        {isError && !isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#181A20] rounded-xl">
            <p className="text-sm text-[#929AA5]">Falha ao carregar histórico de preços.</p>
            <button
              onClick={() => refetch()}
              className="text-xs text-[#F0B90B] underline hover:text-[#F0B90B]/80"
            >
              Tentar novamente
            </button>
          </div>
        )}

        <div
          ref={chartContainerRef}
          aria-label={`Gráfico de candlestick para ${ticker}`}
          className={cn(
            'w-full rounded-xl overflow-hidden',
            'min-h-[300px] md:min-h-[400px]',
            (isLoading || isError) && 'opacity-0 pointer-events-none'
          )}
          style={{ minHeight: 300 }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Export com next/dynamic (SSR=false — lightweight-charts é client-only)
// ---------------------------------------------------------------------------

export const DynamicPriceChart = dynamic(
  () => Promise.resolve(PriceChartInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-3">
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <Skeleton key={p} className="w-10 h-8 rounded-md" />
          ))}
        </div>
        <Skeleton className="w-full rounded-xl" style={{ minHeight: 300 }} />
      </div>
    ),
  }
)

export default PriceChartInner
