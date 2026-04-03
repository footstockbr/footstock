'use client'

// ============================================================================
// Foot Stock — CompareChart
// Gráfico de linhas normalizadas (base 100%) para comparação de até 4 ativos.
// Cada linha representa a variação percentual acumulada desde a abertura do período.
// Disponível para planos CRAQUE e LENDA.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils/cn'
import { Skeleton } from '@/components/ui/Skeleton'
import { usePriceHistory, type PricePeriod, type OHLCBar } from '@/hooks/usePriceHistory'
import type { IChartApi, ISeriesApi, SeriesType, Time, LineData } from 'lightweight-charts'

// ---------------------------------------------------------------------------
// Paleta de 4 cores distintas para comparação (sem colisão visual)
// Regra: 1º primary (#F0B90B), 2º verde (#0ECB81), 3º ciano (#38bdf8), 4º roxo (#a855f7)
// ---------------------------------------------------------------------------

export const COMPARE_PALETTE = ['#F0B90B', '#0ECB81', '#38bdf8', '#a855f7']

// ---------------------------------------------------------------------------
// Resolve cores de comparação com fallback de opacidade para colisão
// ---------------------------------------------------------------------------

export function resolveCompareColors(
  tickers: string[],
  assetColors: Record<string, { primary: string; secondary?: string }>
): string[] {
  const used = new Set<string>()
  return tickers.map((t, i) => {
    const primary = assetColors[t]?.primary ?? COMPARE_PALETTE[i % COMPARE_PALETTE.length]!
    const secondary = assetColors[t]?.secondary ?? COMPARE_PALETTE[(i + 1) % COMPARE_PALETTE.length]!
    // i=0→primary, i=1→secondary, i=2→primary@80%, i=3→secondary@80%
    let color: string
    if (i === 0) color = primary
    else if (i === 1) color = secondary
    else if (i === 2) color = primary + 'CC' // 80% opacidade hex
    else color = secondary + 'CC'
    // Se já usada, fallback para paleta fixa com índice
    if (used.has(color)) color = COMPARE_PALETTE[i % COMPARE_PALETTE.length]!
    used.add(color)
    return color
  })
}

// ---------------------------------------------------------------------------
// Normaliza barra para base 100% (retorno percentual acumulado)
// ---------------------------------------------------------------------------

function normalizeToBase100(bars: OHLCBar[]): LineData<Time>[] {
  if (bars.length === 0) return []
  const base = bars[0]!.close
  if (base === 0) return []
  return bars.map((b) => ({
    time: b.time as Time,
    value: ((b.close - base) / base) * 100,
  }))
}

// ---------------------------------------------------------------------------
// Hooks paralelos para até 4 tickers (número fixo = regra de hooks)
// ---------------------------------------------------------------------------

function useCompareHistories(tickers: string[], period: PricePeriod) {
  const h0 = usePriceHistory(tickers[0] ?? '', period)
  const h1 = usePriceHistory(tickers[1] ?? '', period)
  const h2 = usePriceHistory(tickers[2] ?? '', period)
  const h3 = usePriceHistory(tickers[3] ?? '', period)

  const hs = [h0, h1, h2, h3]
  const active = hs.slice(0, Math.max(tickers.length, 1))
  return {
    histories: active.map((h) => h.data ?? []),
    isLoading: active.some((h) => h.isLoading),
    isError: active.some((h) => h.isError),
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CompareChartProps {
  /** Tickers a comparar — inclui o ativo base como primeiro elemento */
  tickers: string[]
  period?: PricePeriod
  /** displayName por ticker para legenda */
  displayNames?: Record<string, string>
  /** cores resolvidas por ticker */
  colors?: string[]
  className?: string
}

// ---------------------------------------------------------------------------
// Componente interno (não exporta SSR)
// ---------------------------------------------------------------------------

function CompareChartInner({
  tickers,
  period = '1D',
  displayNames = {},
  colors,
  className,
}: CompareChartProps) {
  const [activePeriod, setActivePeriod] = useState<PricePeriod>(period)
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRefs = useRef<Array<ISeriesApi<SeriesType> | null>>([null, null, null, null])

  const { histories, isLoading, isError } = useCompareHistories(tickers, activePeriod)

  const resolvedColors = colors ?? tickers.map((_, i) => COMPARE_PALETTE[i % COMPARE_PALETTE.length]!)

  // Inicializa chart (uma vez)
  useEffect(() => {
    if (!containerRef.current) return

    let chart: IChartApi
    let ro: ResizeObserver

    async function initChart() {
      const lc = await import('lightweight-charts')
      const { createChart } = lc

      chart = createChart(containerRef.current!, {
        width: containerRef.current!.offsetWidth,
        height: 300,
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
          // Formata como percentual (ex: +3.50%)
        },
        timeScale: {
          borderColor: '#2B3139',
          timeVisible: true,
          secondsVisible: false,
        },
        localization: {
          priceFormatter: (p: number) => `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`,
        },
        handleScroll: true,
        handleScale: true,
      })

      chartRef.current = chart

      ro = new ResizeObserver(() => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({ width: containerRef.current.offsetWidth })
        }
      })
      ro.observe(containerRef.current!)
    }

    initChart().catch(console.error)

    return () => {
      ro?.disconnect()
      chart?.remove()
      chartRef.current = null
      seriesRefs.current = [null, null, null, null]
    }
     
  }, [])

  // Atualiza linhas quando os dados ou período mudam
  useEffect(() => {
    if (!chartRef.current || isLoading) return

    async function updateLines() {
      const lc = await import('lightweight-charts')
      const { LineSeries: lineSeriesDef } = lc

      if (!chartRef.current) return

      // Remove todas as séries anteriores
      seriesRefs.current.forEach((s) => {
        if (s && chartRef.current) {
          try { chartRef.current.removeSeries(s) } catch { /* ignorar se já removida */ }
        }
      })
      seriesRefs.current = [null, null, null, null]

      // Adiciona nova linha por ticker com dados normalizados
      histories.forEach((bars, idx) => {
        if (idx >= tickers.length || bars.length === 0) return
        if (!chartRef.current) return

        const color = resolvedColors[idx] ?? COMPARE_PALETTE[idx % COMPARE_PALETTE.length]!
        const series = chartRef.current.addSeries(lineSeriesDef, {
          color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: true,
          crosshairMarkerRadius: 4,
          title: tickers[idx],
        })

        series.setData(normalizeToBase100(bars))
        seriesRefs.current[idx] = series
      })

      chartRef.current?.timeScale().fitContent()
    }

    updateLines().catch(console.error)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histories, isLoading])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const COMPARE_PERIODS: PricePeriod[] = ['1H', '1D', '1W', '1M']
  const PERIOD_LABELS: Partial<Record<PricePeriod, string>> = {
    '1H': '1H', '1D': '1D', '1W': '1S', '1M': '1M',
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Legenda de tickers com cores */}
      <div className="flex flex-wrap gap-2">
        {tickers.map((t, i) => (
          <span
            key={t}
            className="flex items-center gap-1.5 text-xs text-[#EAECEF] bg-[#1E2329] px-2.5 py-1 rounded-full"
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: resolvedColors[i] ?? '#929AA5' }}
            />
            {displayNames[t] ? `${t} · ${displayNames[t].slice(0, 14)}` : t}
          </span>
        ))}
      </div>

      {/* Controles de período */}
      <div className="flex gap-1">
        {COMPARE_PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setActivePeriod(p)}
            aria-pressed={activePeriod === p}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              activePeriod === p
                ? 'bg-[#F0B90B] text-[#0B0E11]'
                : 'bg-[#1E2329] text-[#929AA5] hover:bg-[#2B3139] hover:text-[#EAECEF]'
            )}
          >
            {PERIOD_LABELS[p] ?? p}
          </button>
        ))}
      </div>

      {/* Nota de base 100% */}
      <p className="text-[10px] text-[#929AA5]">
        Variação acumulada relativa ao início do período (base 0%). Linha acima = valorização, abaixo = desvalorização.
      </p>

      {/* Área do gráfico */}
      <div className="relative w-full" style={{ minHeight: 300 }}>
        {isLoading && (
          <div className="absolute inset-0 z-10">
            <Skeleton className="w-full h-full rounded-xl" />
          </div>
        )}

        {isError && !isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#181A20] rounded-xl">
            <p className="text-sm text-[#929AA5]">Falha ao carregar dados comparativos.</p>
          </div>
        )}

        <div
          ref={containerRef}
          role="img"
          aria-label={`Gráfico comparativo: ${tickers.join(', ')}`}
          className={cn(
            'w-full rounded-xl overflow-hidden',
            'min-h-[300px]',
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

export const DynamicCompareChart = dynamic(
  () => Promise.resolve(CompareChartInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-3">
        <Skeleton className="w-full rounded-xl" style={{ minHeight: 300 }} />
      </div>
    ),
  }
)

export default CompareChartInner
