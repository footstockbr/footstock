'use client'

import { useEffect, useRef, useState } from 'react'
import { createChart, IChartApi, ISeriesApi, CandlestickData, LineData } from 'lightweight-charts'
import { useQueries } from '@tanstack/react-query'
import { usePriceHistory, ChartPeriod } from '@/hooks/usePriceHistory'
import { useAssetStatus } from '@/hooks/useAssetStatus'
import { usePlanGuard } from '@/hooks/usePlanGuard'
import { calcMM9, calcMM21, calcBollingerBands, type Candle } from '@/lib/utils/indicators'
import { Spinner } from '@/components/ui/spinner'
import { Lock, X } from 'lucide-react'

const PERIODS: ChartPeriod[] = ['1D', '1W', '1M', '3M', '1Y', 'ALL']

interface CompareTicker {
  ticker: string
  color: string
}

interface PriceChartProps {
  ticker: string
  colors?: { primary: string }
  compareTickers?: CompareTicker[]
  period?: ChartPeriod
  onPeriodChange?: (p: ChartPeriod) => void
  onChartReady?: (chart: IChartApi) => void
}

// Normaliza candles para % de variação a partir do primeiro close
function toPercentChange(candles: Candle[]): LineData[] {
  if (candles.length === 0) return []
  const base = candles[0].close
  if (base === 0) return []
  return candles.map((c) => ({
    time: c.timestamp as unknown as import('lightweight-charts').Time,
    value: parseFloat(((c.close - base) / base * 100).toFixed(4)),
  }))
}

async function fetchHistory(ticker: string, period: ChartPeriod): Promise<Candle[]> {
  const res = await fetch(
    `/api/v1/assets/${encodeURIComponent(ticker)}/history?period=${period}`
  )
  if (!res.ok) throw new Error('Falha ao buscar histórico')
  const json = await res.json() as {
    data: Array<{ timestamp: string; open: number; high: number; low: number; close: number; volume: number }>
  }
  return (json.data ?? []).map((p) => ({
    timestamp: new Date(p.timestamp).getTime() / 1000,
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
    volume: p.volume,
  }))
}

export function PriceChart({
  ticker,
  colors,
  compareTickers = [],
  period: externalPeriod,
  onPeriodChange,
  onChartReady,
}: PriceChartProps) {
  const [internalPeriod, setInternalPeriod] = useState<ChartPeriod>('1M')
  const activePeriod = externalPeriod ?? internalPeriod

  const [chartType, setChartType] = useState<'line' | 'candle'>('candle')
  const [showMM9, setShowMM9] = useState(false)
  const [showMM21, setShowMM21] = useState(false)
  const [showBollinger, setShowBollinger] = useState(false)

  const isCompareMode = compareTickers.length > 0

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const mainSeriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null>(null)
  const mm9Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const mm21Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const bollingerUpperRef = useRef<ISeriesApi<'Line'> | null>(null)
  const bollingerMiddleRef = useRef<ISeriesApi<'Line'> | null>(null)
  const bollingerLowerRef = useRef<ISeriesApi<'Line'> | null>(null)
  const compareSeriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())

  const { candles, isLoading, isError, isRateLimited, rateError, refetch } =
    usePriceHistory(ticker, activePeriod)
  const { isHalted, estimatedResume } = useAssetStatus(ticker)
  const { hasAccess: hasPlanAccess } = usePlanGuard()
  const canUseBollinger = hasPlanAccess('LENDA')

  // Busca histórico dos tickers de comparação em paralelo
  const compareQueries = useQueries({
    queries: compareTickers.map(({ ticker: ct }) => ({
      queryKey: ['price-history', ct, activePeriod],
      queryFn: () => fetchHistory(ct, activePeriod),
      staleTime: activePeriod === '1D' ? 60_000 : 300_000,
      enabled: !!ct,
    })),
  })

  // Rate limit countdown (deve estar antes de early returns — Rules of Hooks)
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0)
  useEffect(() => {
    if (isRateLimited && rateError) {
      setRateLimitCountdown(rateError.retryAfterSeconds)
      const interval = setInterval(() => {
        setRateLimitCountdown((prev) => {
          if (prev <= 1) { clearInterval(interval); refetch(); return 0 }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [isRateLimited, rateError, refetch])

  const handlePeriodChange = (p: ChartPeriod) => {
    setInternalPeriod(p)
    onPeriodChange?.(p)
  }

  // Cria o gráfico uma vez
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 300,
      layout: { background: { color: '#1E2329' }, textColor: '#9ca3af' },
      grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
      rightPriceScale: { borderColor: '#2B3139' },
      timeScale: { borderColor: '#2B3139', timeVisible: true },
    })

    chartRef.current = chart
    onChartReady?.(chart)

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.resize(containerRef.current.clientWidth, 300)
    })
    ro.observe(containerRef.current)

    return () => {
      chart.remove()
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Atualiza série principal quando chartType ou isCompareMode muda
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    if (mainSeriesRef.current) {
      chart.removeSeries(mainSeriesRef.current)
      mainSeriesRef.current = null
    }

    if (isCompareMode) {
      // Em modo comparação: sempre linha com % de variação
      mainSeriesRef.current = chart.addLineSeries({
        color: colors?.primary ?? '#F0B90B',
        lineWidth: 2,
        title: ticker,
        priceLineVisible: false,
      })
    } else if (chartType === 'candle') {
      mainSeriesRef.current = chart.addCandlestickSeries({
        upColor: colors?.primary ?? '#2EBD85',
        downColor: '#F6465D',
        borderVisible: false,
        wickUpColor: colors?.primary ?? '#2EBD85',
        wickDownColor: '#F6465D',
      })
    } else {
      mainSeriesRef.current = chart.addLineSeries({
        color: colors?.primary ?? '#F0B90B',
        lineWidth: 2,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType, colors, isCompareMode])

  // Popula dados da série principal
  useEffect(() => {
    const series = mainSeriesRef.current
    if (!series || candles.length === 0) return

    if (isCompareMode) {
      ;(series as ISeriesApi<'Line'>).setData(toPercentChange(candles))
    } else if (chartType === 'candle') {
      ;(series as ISeriesApi<'Candlestick'>).setData(
        candles.map((c) => ({
          time: c.timestamp as unknown as import('lightweight-charts').Time,
          open: c.open, high: c.high, low: c.low, close: c.close,
        } as CandlestickData))
      )
    } else {
      ;(series as ISeriesApi<'Line'>).setData(
        candles.map((c) => ({
          time: c.timestamp as unknown as import('lightweight-charts').Time,
          value: c.close,
        }))
      )
    }
  }, [candles, chartType, isCompareMode])

  // Sincroniza séries de comparação
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const currentTickers = new Set(compareTickers.map((ct) => ct.ticker))

    // Remove séries de tickers que saíram
    for (const [t, series] of compareSeriesRefs.current) {
      if (!currentTickers.has(t)) {
        chart.removeSeries(series)
        compareSeriesRefs.current.delete(t)
      }
    }

    // Adiciona/atualiza séries para cada ticker
    compareTickers.forEach(({ ticker: ct, color }, idx) => {
      const queryData = compareQueries[idx]?.data
      if (!queryData || queryData.length === 0) return

      const normalizedData = toPercentChange(queryData)
      if (normalizedData.length === 0) return

      if (!compareSeriesRefs.current.has(ct)) {
        const series = chart.addLineSeries({
          color,
          lineWidth: 2,
          title: ct,
          priceLineVisible: false,
        })
        compareSeriesRefs.current.set(ct, series)
        series.setData(normalizedData)
      } else {
        compareSeriesRefs.current.get(ct)!.setData(normalizedData)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareTickers, compareQueries.map((q) => q.data)])

  // Remove séries de comparação quando sai do compare mode
  useEffect(() => {
    if (!isCompareMode) {
      const chart = chartRef.current
      if (chart) {
        for (const series of compareSeriesRefs.current.values()) {
          chart.removeSeries(series)
        }
      }
      compareSeriesRefs.current.clear()
    }
  }, [isCompareMode])

  // MM9
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || isCompareMode) return
    if (showMM9 && candles.length > 0) {
      if (!mm9Ref.current) {
        mm9Ref.current = chart.addLineSeries({ color: '#F0B90B', lineWidth: 1, priceLineVisible: false })
      }
      mm9Ref.current.setData(calcMM9(candles).map((p) => ({
        time: p.timestamp as unknown as import('lightweight-charts').Time, value: p.value,
      })))
    } else if (!showMM9 && mm9Ref.current) {
      chart.removeSeries(mm9Ref.current)
      mm9Ref.current = null
    }
  }, [showMM9, candles, isCompareMode])

  // MM21
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || isCompareMode) return
    if (showMM21 && candles.length > 0) {
      if (!mm21Ref.current) {
        mm21Ref.current = chart.addLineSeries({ color: '#a855f7', lineWidth: 1, priceLineVisible: false })
      }
      mm21Ref.current.setData(calcMM21(candles).map((p) => ({
        time: p.timestamp as unknown as import('lightweight-charts').Time, value: p.value,
      })))
    } else if (!showMM21 && mm21Ref.current) {
      chart.removeSeries(mm21Ref.current)
      mm21Ref.current = null
    }
  }, [showMM21, candles, isCompareMode])

  // Bollinger
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || isCompareMode) return
    if (showBollinger && candles.length >= 20) {
      const lineStyle = 2 as const
      if (!bollingerUpperRef.current) {
        bollingerUpperRef.current = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, lineStyle, priceLineVisible: false })
        bollingerMiddleRef.current = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, lineStyle, priceLineVisible: false })
        bollingerLowerRef.current = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, lineStyle, priceLineVisible: false })
      }
      const bbData = calcBollingerBands(candles)
      const toTime = (p: { timestamp: number }) => p.timestamp as unknown as import('lightweight-charts').Time
      bollingerUpperRef.current!.setData(bbData.map((p) => ({ time: toTime(p), value: p.upper })))
      bollingerMiddleRef.current!.setData(bbData.map((p) => ({ time: toTime(p), value: p.middle })))
      bollingerLowerRef.current!.setData(bbData.map((p) => ({ time: toTime(p), value: p.lower })))
    } else if (!showBollinger) {
      if (bollingerUpperRef.current) { chart.removeSeries(bollingerUpperRef.current); bollingerUpperRef.current = null }
      if (bollingerMiddleRef.current) { chart.removeSeries(bollingerMiddleRef.current); bollingerMiddleRef.current = null }
      if (bollingerLowerRef.current) { chart.removeSeries(bollingerLowerRef.current); bollingerLowerRef.current = null }
    }
  }, [showBollinger, candles, isCompareMode])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center bg-[#1E2329] rounded-lg" style={{ height: 300 }} aria-busy="true">
        <Spinner />
      </div>
    )
  }

  if (isRateLimited && rateError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 bg-[#1E2329] rounded-lg p-4" style={{ height: 300 }}>
        <p className="text-sm text-[#929AA5]">Muitas requisições. Aguardando {rateLimitCountdown}s para tentar novamente.</p>
        <button onClick={() => refetch()} className="text-xs text-[#F0B90B] underline">Tentar agora</button>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 bg-[#1E2329] rounded-lg p-4" style={{ height: 300 }}>
        <p className="text-sm text-[#929AA5]">Dados de histórico indisponíveis. Tente novamente.</p>
        <button onClick={() => refetch()} className="text-xs bg-[#F0B90B] text-[#0B0E11] px-3 py-1.5 rounded font-semibold">Tentar novamente</button>
      </div>
    )
  }

  return (
    <div
      role="img"
      aria-label={`Gráfico de preços de ${ticker} no período ${activePeriod}.${isLoading ? ' Carregando...' : ''}`}
      className="relative w-full"
    >
      {isHalted && (
        <span className="absolute top-2 right-2 z-10 bg-[#F6465D] text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
          SUSPENSO
        </span>
      )}

      {/* Banner de modo comparação */}
      {isCompareMode && (
        <div className="flex items-center gap-2 px-2 py-1 bg-[#1a1610] border-b border-[rgba(240,185,11,.15)] text-xs">
          <span className="text-[#F0B90B] font-semibold">Comparação — % vs abertura</span>
          <div className="flex items-center gap-2 ml-1">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: colors?.primary ?? '#F0B90B' }} />
              <span className="text-[#929AA5]">{ticker}</span>
            </span>
            {compareTickers.map((ct) => (
              <span key={ct.ticker} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: ct.color }} />
                <span className="text-[#929AA5]">{ct.ticker}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div ref={containerRef} data-testid="price-chart" className="w-full" />

      <div className="flex flex-wrap items-center gap-2 mt-2 px-1">
        {/* Period buttons */}
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => !isHalted && handlePeriodChange(p)}
              disabled={isHalted}
              data-testid={`period-btn-${p}`}
              className={`text-xs min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 px-3 py-2 md:px-2 md:py-0.5 rounded transition-colors ${
                activePeriod === p ? 'bg-[#F0B90B] text-[#0B0E11] font-semibold' : 'text-[#929AA5] hover:text-[#EAECEF]'
              } ${isHalted ? 'cursor-not-allowed opacity-50' : ''}`}
              title={isHalted ? `Ativo suspenso.${estimatedResume ? ` Retorno previsto: ${estimatedResume}` : ''}` : undefined}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Chart type — desativado em compare mode (sempre linha) */}
        <div className="flex gap-1 ml-2">
          {(['candle', 'line'] as const).map((t) => (
            <button
              key={t}
              onClick={() => !isCompareMode && setChartType(t)}
              disabled={isCompareMode}
              data-testid={`toggle-chart-${t}`}
              className={`text-xs min-h-[44px] md:min-h-0 px-3 py-2 md:px-2 md:py-0.5 rounded ${
                isCompareMode
                  ? 'text-[#707A8A] cursor-not-allowed opacity-50'
                  : chartType === t ? 'bg-[#2B3139] text-[#EAECEF]' : 'text-[#929AA5]'
              }`}
            >
              {t === 'candle' ? 'Candle' : 'Linha'}
            </button>
          ))}
        </div>

        {/* Indicadores — desativados em compare mode */}
        {!isCompareMode && (
          <div className="flex gap-1 ml-2">
            <button
              onClick={() => setShowMM9((v) => !v)}
              data-testid="toggle-mm9"
              className={`text-xs min-h-[44px] md:min-h-0 px-3 py-2 md:px-2 md:py-0.5 rounded border ${
                showMM9 ? 'border-[#F0B90B] text-[#F0B90B] bg-[#F0B90B10]' : 'border-[#2B3139] text-[#929AA5]'
              }`}
            >
              MM9
            </button>
            <button
              onClick={() => setShowMM21((v) => !v)}
              data-testid="toggle-mm21"
              className={`text-xs min-h-[44px] md:min-h-0 px-3 py-2 md:px-2 md:py-0.5 rounded border ${
                showMM21 ? 'border-[#a855f7] text-[#a855f7] bg-[#a855f710]' : 'border-[#2B3139] text-[#929AA5]'
              }`}
            >
              MM21
            </button>
            <button
              onClick={() => canUseBollinger && setShowBollinger((v) => !v)}
              disabled={!canUseBollinger}
              data-testid="toggle-bollinger"
              className={`text-xs px-2 py-0.5 rounded border flex items-center gap-1 ${
                !canUseBollinger
                  ? 'border-[#2B3139] text-[#707A8A] cursor-not-allowed opacity-60'
                  : showBollinger
                  ? 'border-[#f59e0b] text-[#f59e0b] bg-[#f59e0b10]'
                  : 'border-[#2B3139] text-[#929AA5]'
              }`}
              title={canUseBollinger ? undefined : 'Disponível no plano Lenda'}
              aria-label={canUseBollinger ? 'Bollinger Bands' : 'Bollinger Bands — disponível no plano Lenda'}
            >
              {!canUseBollinger && <Lock className="w-3 h-3" />}
              Bollinger
            </button>
          </div>
        )}

        {/* OFI label */}
        {!isCompareMode && (
          <span className="text-xs text-[#929AA5] ml-auto">OFI</span>
        )}

        {/* Sair de comparação */}
        {isCompareMode && (
          <span className="text-xs text-[#929AA5] ml-auto flex items-center gap-1">
            <X className="w-3 h-3" />
            Clique em Comparar para alterar
          </span>
        )}
      </div>
    </div>
  )
}
