'use client'

import { useEffect, useRef, useState } from 'react'
import { createChart, IChartApi, ISeriesApi, CandlestickData, LineData, HistogramData } from 'lightweight-charts'
import { useQueries } from '@tanstack/react-query'
import { usePriceHistory, ChartPeriod } from '@/hooks/usePriceHistory'
import { useAssetStatus } from '@/hooks/useAssetStatus'
import { usePlanGuard } from '@/hooks/usePlanGuard'
import { calcMM9, calcMM21, calcBollingerBands, type Candle } from '@/lib/utils/indicators'
import { canAccessIndicator, getMinPlanForIndicator } from '@/lib/utils/planGating'
import {
  INDICATOR_MM9_COLOR,
  INDICATOR_MM21_COLOR,
  INDICATOR_BOLLINGER_COLOR,
  INDICATOR_VOLUME_UP_COLOR,
  INDICATOR_VOLUME_DOWN_COLOR,
} from '@/lib/constants/indicatorColors'
import { Spinner } from '@/components/ui/spinner'
import { Lock, X } from 'lucide-react'

const PERIODS: ChartPeriod[] = ['1H', '1D', '1S', '1W', '1M', '3M', '1Y', 'ALL']

interface CompareTicker {
  ticker: string
  color: string
}

interface PriceChartProps {
  ticker: string
  primaryColor?: string
  compareTickers?: CompareTicker[]
  period?: ChartPeriod
  onPeriodChange?: (p: ChartPeriod) => void
  onChartReady?: (chart: IChartApi) => void
}

// Reduz array para no máximo maxPoints por amostragem uniforme
function downsample<T>(data: T[], maxPoints: number): T[] {
  if (data.length <= maxPoints) return data
  const step = data.length / maxPoints
  return Array.from({ length: maxPoints }, (_, i) => data[Math.floor(i * step)])
}

// Suavização EMA para reduzir ruído visual (alpha ∈ 0-1; menor = mais suave)
function applyEMA(data: LineData[], alpha: number): LineData[] {
  if (data.length === 0) return data
  const out: LineData[] = [data[0]]
  for (let i = 1; i < data.length; i++) {
    out.push({
      time: data[i].time,
      value: +((alpha * (data[i].value as number)) + ((1 - alpha) * (out[i - 1].value as number))).toFixed(4),
    })
  }
  return out
}

// Em modo comparação: mapeia candles para % de variação usando timestamps de referência.
// Todos os tickers ficam remapeados ao mesmo eixo X (timestamps do ticker principal),
// eliminando o problema de ranges de tempo diferentes entre tickers.
function toCompareSeries(candles: Candle[], refTimestamps: number[]): LineData[] {
  if (candles.length === 0 || refTimestamps.length === 0) return []
  const sampled = downsample(candles, refTimestamps.length)
  const base = sampled[0].close
  if (base === 0) return []
  return sampled.map((c, i) => ({
    time: refTimestamps[i] as unknown as import('lightweight-charts').Time,
    value: parseFloat(((c.close - base) / base * 100).toFixed(4)),
  }))
}

async function fetchHistory(ticker: string, period: ChartPeriod): Promise<Candle[]> {
  const res = await fetch(
    `/api/v1/assets/${encodeURIComponent(ticker)}/history?period=${period}`
  )
  if (!res.ok) throw new Error('Falha ao buscar histórico')
  const json = await res.json() as {
    data: Array<{ timestamp: string; open: number; high: number; low: number; close: number; volume: number; source?: string }>
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
  primaryColor,
  compareTickers = [],
  period: externalPeriod,
  onPeriodChange,
  onChartReady,
}: PriceChartProps) {
  const [internalPeriod, setInternalPeriod] = useState<ChartPeriod>('1H')
  const activePeriod = externalPeriod ?? internalPeriod

  const [chartType, setChartType] = useState<'line' | 'candle'>('line')

  // Persistir preferências de indicadores no localStorage
  const [showMM9, setShowMM9] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('fs:indicator:mm9') === '1'
  })
  const [showMM21, setShowMM21] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('fs:indicator:mm21') === '1'
  })
  const [showBollinger, setShowBollinger] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('fs:indicator:bollinger') === '1'
  })

  const isCompareMode = compareTickers.length > 0

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const mainSeriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Line'> | null>(null)
  const mm9Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const mm21Ref = useRef<ISeriesApi<'Line'> | null>(null)
  const bollingerUpperRef = useRef<ISeriesApi<'Line'> | null>(null)
  const bollingerMiddleRef = useRef<ISeriesApi<'Line'> | null>(null)
  const bollingerLowerRef = useRef<ISeriesApi<'Line'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const compareSeriesRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())
  // Timestamps de referência do ticker principal (downsampled) — compartilhados com o effect de comparação
  // para garantir que todos os tickers usem o mesmo eixo X
  const compareTimestampsRef = useRef<number[]>([])

  const { candles, isLoading, isError, isRateLimited, isDelayed, delayMinutes, rateError, refetch } =
    usePriceHistory(ticker, activePeriod)
  const { isHalted, estimatedResume } = useAssetStatus(ticker)
  const { plan } = usePlanGuard()
  // Gating centralizado via planGating.ts (TASK-011)
  const canUseBollinger = canAccessIndicator(plan, 'BOLLINGER')
  const canUseMM9 = canAccessIndicator(plan, 'MM9')
  const canUseMM21 = canAccessIndicator(plan, 'MM21')
  const mm9MinPlan = getMinPlanForIndicator('MM9')
  const mm21MinPlan = getMinPlanForIndicator('MM21')

  // Persistir toggles no localStorage
  useEffect(() => { localStorage.setItem('fs:indicator:mm9', showMM9 ? '1' : '0') }, [showMM9])
  useEffect(() => { localStorage.setItem('fs:indicator:mm21', showMM21 ? '1' : '0') }, [showMM21])
  useEffect(() => { localStorage.setItem('fs:indicator:bollinger', showBollinger ? '1' : '0') }, [showBollinger])

  // Busca histórico dos tickers de comparação em paralelo
  const compareQueries = useQueries({
    queries: compareTickers.map(({ ticker: ct }) => ({
      queryKey: ['price-history', ct, activePeriod],
      queryFn: () => fetchHistory(ct, activePeriod),
      staleTime: activePeriod === '1D' ? 60_000 : 300_000,
      enabled: isCompareMode && !!ct,
    })),
  })

  // Chave estável que muda apenas quando dados reais chegam
  const compareDataKey = compareQueries
    .map((q) => (q.data ? q.data.length : -1))
    .join(',')

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
      rightPriceScale: { borderColor: '#2B3139', autoScale: true },
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
      try { chart.removeSeries(mainSeriesRef.current) } catch { /* series already removed */ }
      mainSeriesRef.current = null
    }

    if (isCompareMode) {
      // Em modo comparação: sempre linha com % de variação
      mainSeriesRef.current = chart.addLineSeries({
        color: primaryColor ?? '#F0B90B',
        lineWidth: 2,
        title: ticker,
        priceLineVisible: false,
      })
    } else if (chartType === 'candle') {
      mainSeriesRef.current = chart.addCandlestickSeries({
        upColor: primaryColor ?? '#2EBD85',
        downColor: '#F6465D',
        borderVisible: false,
        wickUpColor: primaryColor ?? '#2EBD85',
        wickDownColor: '#F6465D',
      })
    } else {
      mainSeriesRef.current = chart.addLineSeries({
        color: primaryColor ?? '#F0B90B',
        lineWidth: 2,
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType, primaryColor, isCompareMode])

  // Popula dados da série principal
  useEffect(() => {
    const chart = chartRef.current
    const series = mainSeriesRef.current
    if (!chart || !series || candles.length === 0) return

    if (isCompareMode) {
      // Calcula timestamps de referência (300 pts downsampled) e persiste para o effect de comparação
      const refTimes = downsample(candles, 300).map((c) => c.timestamp)
      compareTimestampsRef.current = refTimes
      const pctData = toCompareSeries(candles, refTimes)
      if (pctData.length > 0) {
        ;(series as ISeriesApi<'Line'>).setData(pctData)
      }
    } else if (chartType === 'candle') {
      ;(series as ISeriesApi<'Candlestick'>).setData(
        candles.map((c) => ({
          time: c.timestamp as unknown as import('lightweight-charts').Time,
          open: c.open, high: c.high, low: c.low, close: c.close,
        } as CandlestickData))
      )
    } else {
      const raw = candles.map((c) => ({
        time: c.timestamp as unknown as import('lightweight-charts').Time,
        value: c.close,
      }))
      // Suaviza quando há dados densos (sub-minuto) para evitar linha irregular
      const display = raw.length > 300 ? applyEMA(downsample(raw, 300), 0.15) : raw
      ;(series as ISeriesApi<'Line'>).setData(display)
    }
  }, [candles, chartType, isCompareMode])

  // Gerencia ciclo de vida completo das séries de comparação
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    if (!isCompareMode) {
      // Saindo do modo comparação: remove todas as séries secundárias
      for (const series of compareSeriesRefs.current.values()) {
        try { chart.removeSeries(series) } catch { /* série já removida */ }
      }
      compareSeriesRefs.current.clear()
      return
    }

    const currentTickerSet = new Set(compareTickers.map((ct) => ct.ticker))

    // Remove séries de tickers que saíram da seleção
    for (const [t, series] of compareSeriesRefs.current) {
      if (!currentTickerSet.has(t)) {
        try { chart.removeSeries(series) } catch { /* série já removida */ }
        compareSeriesRefs.current.delete(t)
      }
    }

    // Usa os timestamps de referência calculados em Effect 2 (eixo X compartilhado)
    const refTimes = compareTimestampsRef.current
    if (refTimes.length === 0) return // Effect 2 ainda não rodou; aguarda próxima execução

    // Adiciona/atualiza séries com dados disponíveis
    let anyDataSet = false
    compareTickers.forEach(({ ticker: ct, color }, idx) => {
      const queryData = compareQueries[idx]?.data
      if (!queryData || queryData.length === 0) return

      // Remapeia os dados do ticker comparado para o mesmo eixo X do ticker principal
      const normalizedData = toCompareSeries(queryData, refTimes)
      if (normalizedData.length === 0) return

      let series = compareSeriesRefs.current.get(ct)
      if (!series) {
        series = chart.addLineSeries({
          color,
          lineWidth: 2,
          title: ct,
          priceLineVisible: false,
          lastValueVisible: true,
        })
        compareSeriesRefs.current.set(ct, series)
      }
      series.setData(normalizedData)
      anyDataSet = true
    })

    if (anyDataSet) {
      // Re-popula o ticker principal (mesmo eixo X) para garantir que está visible após fitContent
      const mainSeries = mainSeriesRef.current
      if (mainSeries && candles.length > 0) {
        const pctData = toCompareSeries(candles, refTimes)
        if (pctData.length > 0) {
          ;(mainSeries as ISeriesApi<'Line'>).setData(pctData)
        }
      }
      chart.priceScale('right').applyOptions({ autoScale: true })
      chart.timeScale().fitContent()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompareMode, compareTickers, compareDataKey, candles])

  // MM9 (cor âmbar #F59E0B — FDD/US-013)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || isCompareMode) return
    if (showMM9 && canUseMM9 && candles.length > 0) {
      if (!mm9Ref.current) {
        mm9Ref.current = chart.addLineSeries({ color: INDICATOR_MM9_COLOR, lineWidth: 1, priceLineVisible: false })
      }
      mm9Ref.current.setData(calcMM9(candles).map((p) => ({
        time: p.timestamp as unknown as import('lightweight-charts').Time, value: p.value,
      })))
    } else if ((!showMM9 || !canUseMM9) && mm9Ref.current) {
      chart.removeSeries(mm9Ref.current)
      mm9Ref.current = null
    }
  }, [showMM9, canUseMM9, candles, isCompareMode])

  // MM21 (cor dourado #D97706 — FDD/US-013)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || isCompareMode) return
    if (showMM21 && canUseMM21 && candles.length > 0) {
      if (!mm21Ref.current) {
        mm21Ref.current = chart.addLineSeries({ color: INDICATOR_MM21_COLOR, lineWidth: 1, priceLineVisible: false })
      }
      mm21Ref.current.setData(calcMM21(candles).map((p) => ({
        time: p.timestamp as unknown as import('lightweight-charts').Time, value: p.value,
      })))
    } else if ((!showMM21 || !canUseMM21) && mm21Ref.current) {
      chart.removeSeries(mm21Ref.current)
      mm21Ref.current = null
    }
  }, [showMM21, canUseMM21, candles, isCompareMode])

  // Bollinger Bands (cor ciano #06B6D4 — FDD/US-013)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || isCompareMode) return
    if (showBollinger && candles.length >= 20) {
      const lineStyle = 2 as const
      if (!bollingerUpperRef.current) {
        bollingerUpperRef.current = chart.addLineSeries({ color: INDICATOR_BOLLINGER_COLOR, lineWidth: 1, lineStyle, priceLineVisible: false })
        bollingerMiddleRef.current = chart.addLineSeries({ color: INDICATOR_BOLLINGER_COLOR, lineWidth: 1, lineStyle, priceLineVisible: false })
        bollingerLowerRef.current = chart.addLineSeries({ color: INDICATOR_BOLLINGER_COLOR, lineWidth: 1, lineStyle, priceLineVisible: false })
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

  // Volume sub-chart (todos os planos — histograma abaixo do preço)
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || isCompareMode) return
    if (candles.length > 0) {
      if (!volumeSeriesRef.current) {
        volumeSeriesRef.current = chart.addHistogramSeries({
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
        })
        chart.priceScale('volume').applyOptions({
          scaleMargins: { top: 0.8, bottom: 0 },
        })
      }
      volumeSeriesRef.current.setData(
        candles.map((c) => ({
          time: c.timestamp as unknown as import('lightweight-charts').Time,
          value: c.volume,
          color: c.close >= c.open ? INDICATOR_VOLUME_UP_COLOR : INDICATOR_VOLUME_DOWN_COLOR,
        } as HistogramData))
      )
    }
    return () => {
      // Cleanup: só remove se mudou para compare mode
      if (isCompareMode && volumeSeriesRef.current && chart) {
        try { chart.removeSeries(volumeSeriesRef.current) } catch { /* série já removida */ }
        volumeSeriesRef.current = null
      }
    }
  }, [candles, isCompareMode])

  // Overlay state: chart container fica sempre no DOM para não destruir o canvas
  const showLoadingOverlay = isLoading
  const showRateLimitOverlay = isRateLimited && !!rateError
  const showErrorOverlay = isError && !isRateLimited
  const showOverlay = showLoadingOverlay || showRateLimitOverlay || showErrorOverlay

  return (
    <div
      role="img"
      aria-label={`Gráfico de preços de ${ticker} no período ${activePeriod}.${isLoading ? ' Carregando...' : ''}`}
      className="relative w-full"
    >
      {isHalted && !showOverlay && (
        <span className="absolute top-2 right-2 z-10 bg-[#F6465D] text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
          SUSPENSO
        </span>
      )}

      {/* Badge de delay para JOGADOR — TASK-011 */}
      {isDelayed && !showOverlay && (
        <span className="absolute top-2 left-2 z-10 bg-[#F59E0B]/20 text-[#F59E0B] text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[#F59E0B]/30">
          Dados com {delayMinutes >= 60 ? `${Math.round(delayMinutes / 60)}h` : `${delayMinutes}min`} de atraso
        </span>
      )}

      {/* Banner de modo comparação */}
      {isCompareMode && !showOverlay && (
        <div className="flex items-center gap-2 px-2 py-1 bg-[#1a1610] border-b border-[rgba(240,185,11,.15)] text-xs">
          <span className="text-[#F0B90B] font-semibold">Comparação — % vs abertura</span>
          <div className="flex items-center gap-2 ml-1">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: primaryColor ?? '#F0B90B' }} />
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

      {/* Chart canvas — sempre no DOM, nunca desmontado */}
      <div className="relative">
        <div ref={containerRef} data-testid="price-chart" className="w-full" />

        {/* Overlays ficam sobre o canvas sem desmontá-lo */}
        {showLoadingOverlay && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-[#1E2329] rounded-lg z-10"
            style={{ height: 300 }}
            aria-busy="true"
          >
            <Spinner />
          </div>
        )}
        {showRateLimitOverlay && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#1E2329] rounded-lg p-4 z-10"
            style={{ height: 300 }}
          >
            <p className="text-sm text-[#929AA5]">
              Muitas requisições. Aguardando {rateLimitCountdown}s para tentar novamente.
            </p>
            <button onClick={() => refetch()} className="text-xs text-[#F0B90B] underline">
              Tentar agora
            </button>
          </div>
        )}
        {showErrorOverlay && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#1E2329] rounded-lg p-4 z-10"
            style={{ height: 300 }}
          >
            <p className="text-sm text-[#929AA5]">Dados de histórico indisponíveis. Tente novamente.</p>
            <button
              onClick={() => refetch()}
              className="text-xs bg-[#F0B90B] text-[#0B0E11] px-3 py-1.5 rounded font-semibold"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2 px-1">
        {/* Period buttons */}
        <div className="flex gap-1" data-testid="price-chart-interval-select">
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
            <div className="relative group">
              <button
                onClick={() => canUseMM9 && setShowMM9((v) => !v)}
                disabled={!canUseMM9}
                data-testid="toggle-mm9"
                aria-label={canUseMM9 ? 'Média Móvel 9' : `Média Móvel 9 — disponível no plano ${mm9MinPlan}`}
                className={`text-xs min-h-[44px] md:min-h-0 px-3 py-2 md:px-2 md:py-0.5 rounded border flex items-center gap-1 ${
                  !canUseMM9
                    ? 'border-[#2B3139] text-[#707A8A] cursor-not-allowed opacity-60'
                    : showMM9
                    ? `border-[${INDICATOR_MM9_COLOR}] text-[${INDICATOR_MM9_COLOR}]`
                    : 'border-[#2B3139] text-[#929AA5]'
                }`}
                style={canUseMM9 && showMM9 ? { borderColor: INDICATOR_MM9_COLOR, color: INDICATOR_MM9_COLOR, backgroundColor: `${INDICATOR_MM9_COLOR}10` } : undefined}
              >
                {!canUseMM9 && <Lock className="w-3 h-3" />}
                MM9
              </button>
              {!canUseMM9 && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center z-20">
                  <div className="bg-[#1E2329] border border-[#2B3139] rounded-lg px-3 py-2 text-xs text-[#929AA5] whitespace-nowrap shadow-lg">
                    <p>Disponível no plano {mm9MinPlan}. <a href="/planos" className="text-[#F0B90B] underline">Faça upgrade.</a></p>
                  </div>
                  <div className="w-2 h-2 bg-[#1E2329] border-b border-r border-[#2B3139] rotate-45 -mt-1" />
                </div>
              )}
            </div>
            <div className="relative group">
              <button
                onClick={() => canUseMM21 && setShowMM21((v) => !v)}
                disabled={!canUseMM21}
                data-testid="toggle-mm21"
                aria-label={canUseMM21 ? 'Média Móvel 21' : `Média Móvel 21 — disponível no plano ${mm21MinPlan}`}
                className={`text-xs min-h-[44px] md:min-h-0 px-3 py-2 md:px-2 md:py-0.5 rounded border flex items-center gap-1 ${
                  !canUseMM21
                    ? 'border-[#2B3139] text-[#707A8A] cursor-not-allowed opacity-60'
                    : showMM21
                    ? `border-[${INDICATOR_MM21_COLOR}] text-[${INDICATOR_MM21_COLOR}]`
                    : 'border-[#2B3139] text-[#929AA5]'
                }`}
                style={canUseMM21 && showMM21 ? { borderColor: INDICATOR_MM21_COLOR, color: INDICATOR_MM21_COLOR, backgroundColor: `${INDICATOR_MM21_COLOR}10` } : undefined}
              >
                {!canUseMM21 && <Lock className="w-3 h-3" />}
                MM21
              </button>
              {!canUseMM21 && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center z-20">
                  <div className="bg-[#1E2329] border border-[#2B3139] rounded-lg px-3 py-2 text-xs text-[#929AA5] whitespace-nowrap shadow-lg">
                    <p>Disponível no plano {mm21MinPlan}. <a href="/planos" className="text-[#F0B90B] underline">Faça upgrade.</a></p>
                  </div>
                  <div className="w-2 h-2 bg-[#1E2329] border-b border-r border-[#2B3139] rotate-45 -mt-1" />
                </div>
              )}
            </div>
            <button
              onClick={() => setShowBollinger((v) => !v)}
              data-testid="toggle-bollinger"
              className={`text-xs min-h-[44px] md:min-h-0 px-3 py-2 md:px-2 md:py-0.5 rounded border`}
              style={showBollinger ? { borderColor: INDICATOR_BOLLINGER_COLOR, color: INDICATOR_BOLLINGER_COLOR, backgroundColor: `${INDICATOR_BOLLINGER_COLOR}10` } : { borderColor: '#2B3139', color: '#929AA5' }}
              aria-label="Bollinger Bands"
            >
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
