'use client'

import { useEffect, useRef, useState } from 'react'
import { createChart, IChartApi, ISeriesApi, CandlestickData, LineData } from 'lightweight-charts'
import { usePriceHistory, ChartPeriod } from '@/hooks/usePriceHistory'
import { useAssetStatus } from '@/hooks/useAssetStatus'
import { usePlanGuard } from '@/hooks/usePlanGuard'
import { calcMM9, calcMM21, calcBollingerBands } from '@/lib/utils/indicators'
import { Spinner } from '@/components/ui/spinner'
import { Lock } from 'lucide-react'

const PERIODS: ChartPeriod[] = ['1D', '1W', '1M', '3M', '1Y', 'ALL']

interface PriceChartProps {
  ticker: string
  colors?: { primary: string }
  period?: ChartPeriod
  onPeriodChange?: (p: ChartPeriod) => void
  onChartReady?: (chart: IChartApi) => void
}

export function PriceChart({
  ticker,
  colors,
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

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const mainSeriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null>(null)
  const mm9Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const mm21Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const bollingerUpperRef = useRef<ISeriesApi<'Line'> | null>(null)
  const bollingerMiddleRef = useRef<ISeriesApi<'Line'> | null>(null)
  const bollingerLowerRef = useRef<ISeriesApi<'Line'> | null>(null)

  const { candles, isLoading, isError, isRateLimited, rateError, refetch } =
    usePriceHistory(ticker, activePeriod)
  const { isHalted, estimatedResume } = useAssetStatus(ticker)
  const { hasAccess: hasPlanAccess } = usePlanGuard()
  const canUseBollinger = hasPlanAccess('LENDA')

  const handlePeriodChange = (p: ChartPeriod) => {
    setInternalPeriod(p)
    onPeriodChange?.(p)
  }

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 300,
      layout: {
        background: { color: '#1E2329' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      rightPriceScale: { borderColor: '#2B3139' },
      timeScale: { borderColor: '#2B3139', timeVisible: true },
    })

    chartRef.current = chart
    onChartReady?.(chart)

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.resize(containerRef.current.clientWidth, 300)
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      chart.remove()
      resizeObserver.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update series when chartType changes
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    // Remove existing main series
    if (mainSeriesRef.current) {
      chart.removeSeries(mainSeriesRef.current)
      mainSeriesRef.current = null
    }

    if (chartType === 'candle') {
      const series = chart.addCandlestickSeries({
        upColor: colors?.primary ?? '#2EBD85',
        downColor: '#F6465D',
        borderVisible: false,
        wickUpColor: colors?.primary ?? '#2EBD85',
        wickDownColor: '#F6465D',
      })
      mainSeriesRef.current = series
    } else {
      const series = chart.addLineSeries({
        color: colors?.primary ?? '#F0B90B',
        lineWidth: 2,
      })
      mainSeriesRef.current = series
    }
  }, [chartType, colors])

  // Update candle data
  useEffect(() => {
    const series = mainSeriesRef.current
    if (!series || candles.length === 0) return

    if (chartType === 'candle') {
      const data: CandlestickData[] = candles.map((c) => ({
        time: c.timestamp as unknown as import('lightweight-charts').Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
      ;(series as ISeriesApi<'Candlestick'>).setData(data)
    } else {
      const data: LineData[] = candles.map((c) => ({
        time: c.timestamp as unknown as import('lightweight-charts').Time,
        value: c.close,
      }))
      ;(series as ISeriesApi<'Line'>).setData(data)
    }
  }, [candles, chartType])

  // MM9 toggle
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    if (showMM9 && candles.length > 0) {
      if (!mm9Ref.current) {
        mm9Ref.current = chart.addLineSeries({
          color: '#F0B90B',
          lineWidth: 1,
          priceLineVisible: false,
        })
      }
      const mm9Data = calcMM9(candles).map((p) => ({
        time: p.timestamp as unknown as import('lightweight-charts').Time,
        value: p.value,
      }))
      mm9Ref.current.setData(mm9Data)
    } else if (!showMM9 && mm9Ref.current) {
      chart.removeSeries(mm9Ref.current)
      mm9Ref.current = null
    }
  }, [showMM9, candles])

  // MM21 toggle
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    if (showMM21 && candles.length > 0) {
      if (!mm21Ref.current) {
        mm21Ref.current = chart.addLineSeries({
          color: '#a855f7',
          lineWidth: 1,
          priceLineVisible: false,
        })
      }
      const mm21Data = calcMM21(candles).map((p) => ({
        time: p.timestamp as unknown as import('lightweight-charts').Time,
        value: p.value,
      }))
      mm21Ref.current.setData(mm21Data)
    } else if (!showMM21 && mm21Ref.current) {
      chart.removeSeries(mm21Ref.current)
      mm21Ref.current = null
    }
  }, [showMM21, candles])

  // Bollinger toggle
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    if (showBollinger && candles.length >= 20) {
      const lineStyle = 2 as const

      if (!bollingerUpperRef.current) {
        bollingerUpperRef.current = chart.addLineSeries({
          color: '#f59e0b',
          lineWidth: 1,
          lineStyle,
          priceLineVisible: false,
        })
        bollingerMiddleRef.current = chart.addLineSeries({
          color: '#f59e0b',
          lineWidth: 1,
          lineStyle,
          priceLineVisible: false,
        })
        bollingerLowerRef.current = chart.addLineSeries({
          color: '#f59e0b',
          lineWidth: 1,
          lineStyle,
          priceLineVisible: false,
        })
      }

      const bbData = calcBollingerBands(candles)
      const toTime = (p: { timestamp: number }) =>
        p.timestamp as unknown as import('lightweight-charts').Time

      bollingerUpperRef.current!.setData(
        bbData.map((p) => ({ time: toTime(p), value: p.upper }))
      )
      bollingerMiddleRef.current!.setData(
        bbData.map((p) => ({ time: toTime(p), value: p.middle }))
      )
      bollingerLowerRef.current!.setData(
        bbData.map((p) => ({ time: toTime(p), value: p.lower }))
      )
    } else if (!showBollinger) {
      if (bollingerUpperRef.current) {
        chart.removeSeries(bollingerUpperRef.current)
        bollingerUpperRef.current = null
      }
      if (bollingerMiddleRef.current) {
        chart.removeSeries(bollingerMiddleRef.current)
        bollingerMiddleRef.current = null
      }
      if (bollingerLowerRef.current) {
        chart.removeSeries(bollingerLowerRef.current)
        bollingerLowerRef.current = null
      }
    }
  }, [showBollinger, candles])

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center bg-[#1E2329] rounded-lg"
        style={{ height: 300 }}
        aria-busy="true"
        aria-label="Carregando gráfico de preços..."
      >
        <Spinner />
      </div>
    )
  }

  // Rate limit countdown timer
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0)
  useEffect(() => {
    if (isRateLimited && rateError) {
      setRateLimitCountdown(rateError.retryAfterSeconds)
      const interval = setInterval(() => {
        setRateLimitCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval)
            refetch()
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [isRateLimited, rateError, refetch])

  if (isRateLimited && rateError) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 bg-[#1E2329] rounded-lg p-4"
        style={{ height: 300 }}
      >
        <p className="text-sm text-[#929AA5]">
          Muitas requisições. Aguardando {rateLimitCountdown}s para tentar novamente.
        </p>
        <button
          onClick={() => refetch()}
          className="text-xs text-[#F0B90B] underline"
        >
          Tentar agora
        </button>
      </div>
    )
  }

  if (isError) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 bg-[#1E2329] rounded-lg p-4"
        style={{ height: 300 }}
      >
        <p className="text-sm text-[#929AA5]">
          Dados de histórico indisponíveis. Tente novamente.
        </p>
        <button
          onClick={() => refetch()}
          className="text-xs bg-[#F0B90B] text-[#0B0E11] px-3 py-1.5 rounded font-semibold"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div
      role="img"
      aria-label={`Gráfico de preços de ${ticker} no período ${activePeriod}.${isLoading ? ' Carregando...' : ''}`}
      className="relative w-full"
    >
      {/* Halt badge */}
      {isHalted && (
        <span className="absolute top-2 right-2 z-10 bg-[#F6465D] text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
          SUSPENSO
        </span>
      )}

      {/* Chart container */}
      <div ref={containerRef} data-testid="price-chart" className="w-full" />

      {/* Controls */}
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
                activePeriod === p
                  ? 'bg-[#F0B90B] text-[#0B0E11] font-semibold'
                  : 'text-[#929AA5] hover:text-[#EAECEF]'
              } ${isHalted ? 'cursor-not-allowed opacity-50' : ''}`}
              title={
                isHalted
                  ? `Ativo temporariamente suspenso por circuit breaker.${estimatedResume ? ` Retorno previsto: ${estimatedResume}` : ''}`
                  : undefined
              }
            >
              {p}
            </button>
          ))}
        </div>

        {/* Chart type */}
        <div className="flex gap-1 ml-2">
          {(['candle', 'line'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setChartType(t)}
              data-testid={`toggle-chart-${t}`}
              className={`text-xs min-h-[44px] md:min-h-0 px-3 py-2 md:px-2 md:py-0.5 rounded ${
                chartType === t ? 'bg-[#2B3139] text-[#EAECEF]' : 'text-[#929AA5]'
              }`}
            >
              {t === 'candle' ? 'Candle' : 'Linha'}
            </button>
          ))}
        </div>

        {/* Indicator toggles */}
        <div className="flex gap-1 ml-2">
          <button
            onClick={() => setShowMM9((v) => !v)}
            data-testid="toggle-mm9"
            className={`text-xs min-h-[44px] md:min-h-0 px-3 py-2 md:px-2 md:py-0.5 rounded border ${
              showMM9
                ? 'border-[#F0B90B] text-[#F0B90B] bg-[#F0B90B10]'
                : 'border-[#2B3139] text-[#929AA5]'
            }`}
          >
            MM9
          </button>
          <button
            onClick={() => setShowMM21((v) => !v)}
            data-testid="toggle-mm21"
            className={`text-xs min-h-[44px] md:min-h-0 px-3 py-2 md:px-2 md:py-0.5 rounded border ${
              showMM21
                ? 'border-[#a855f7] text-[#a855f7] bg-[#a855f710]'
                : 'border-[#2B3139] text-[#929AA5]'
            }`}
          >
            MM21
          </button>
          <button
            onClick={() => {
              if (canUseBollinger) {
                setShowBollinger((v) => !v)
              }
            }}
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
      </div>
    </div>
  )
}
