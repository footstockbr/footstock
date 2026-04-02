'use client'

import { useEffect, useRef } from 'react'
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts'
import { usePriceHistory, ChartPeriod } from '@/hooks/usePriceHistory'
import { Spinner } from '@/components/ui/spinner'

interface OFIChartProps {
  ticker: string
  period: ChartPeriod
  onChartReady?: (chart: IChartApi) => void
}

export function OFIChart({ ticker, period, onChartReady }: OFIChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const histSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)

  const { ofiData, isLoading, isError, refetch } = usePriceHistory(ticker, period)

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 80,
      layout: {
        background: { color: '#1E2329' },
        textColor: '#6b7280',
      },
      grid: {
        vertLines: { color: 'transparent' },
        horzLines: { color: 'transparent' },
      },
      timeScale: { visible: false },
      rightPriceScale: { visible: false },
    })

    chartRef.current = chart
    onChartReady?.(chart)

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.resize(containerRef.current.clientWidth, 80)
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      chart.remove()
      resizeObserver.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update OFI data — use ref to avoid leaking histogram series on re-renders
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || ofiData.length === 0) return

    if (!histSeriesRef.current) {
      histSeriesRef.current = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
      })
    }

    histSeriesRef.current.setData(
      ofiData.map((d) => ({
        time: (new Date(d.timestamp).getTime() / 1000) as unknown as import('lightweight-charts').Time,
        value: d.ofi,
        color: d.ofi >= 0 ? '#F0B90B' : '#F6465D',
      }))
    )
  }, [ofiData])

  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center bg-[#1E2329] rounded-lg"
        style={{ height: 80 }}
        aria-busy="true"
      >
        <Spinner />
      </div>
    )
  }

  if (isError) {
    return (
      <div
        className="flex items-center justify-center bg-[#1E2329] rounded-lg"
        style={{ height: 80 }}
      >
        <button onClick={() => refetch()} className="text-xs text-[#929AA5] underline">
          Recarregar OFI
        </button>
      </div>
    )
  }

  return (
    <div
      role="img"
      aria-label={`Gráfico de Order Flow Imbalance de ${ticker}`}
      className="relative w-full"
    >
      <span className="absolute top-1 left-1 z-10 text-[10px] text-[#6b7280] pointer-events-none">
        OFI
      </span>
      <div ref={containerRef} data-testid="ofi-chart" className="w-full" />
    </div>
  )
}
