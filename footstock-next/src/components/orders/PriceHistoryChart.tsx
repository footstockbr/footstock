'use client'

import { useEffect, useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'

interface HistoryPoint {
  date: string
  price: number
  timestamp?: number
}

interface PriceHistoryChartProps {
  ticker: string
  currentPrice: number
}

export function PriceHistoryChart({ ticker, currentPrice }: PriceHistoryChartProps) {
  const [data, setData] = useState<HistoryPoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchHistory() {
      try {
        setIsLoading(true)
        const res = await fetch(`/api/v1/portfolio/history?period=7D&assetId=${ticker}`, {
          credentials: 'include',
        })
        if (!res.ok) {
          setError('Dados indisponíveis')
          return
        }
        const json = await res.json()
        const points = json.data?.history ?? []
        setData(points)
      } catch (err) {
        setError('Erro ao carregar histórico')
        console.error(err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchHistory()
  }, [ticker])

  const variation = useMemo(() => {
    if (!data || data.length === 0) return null
    const oldest = data[0]?.price ?? currentPrice
    const diff = currentPrice - oldest
    const pct = oldest > 0 ? (diff / oldest) * 100 : 0
    return { diff, pct }
  }, [data, currentPrice])

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-4 w-32" />
      </div>
    )
  }

  if (error || data.length === 0) {
    return (
      <div className="text-xs text-[#929AA5] bg-[rgba(240,185,11,.04)] p-3 rounded-lg">
        {error || 'Histórico não disponível'}
      </div>
    )
  }

  const variationColor = variation && variation.diff >= 0 ? 'text-[#2EBD85]' : 'text-[#F6465D]'
  const variationSign = variation && variation.diff >= 0 ? '+' : ''

  return (
    <div className="space-y-2">
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(240,185,11,.1)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#707A8A' }}
              stroke="rgba(240,185,11,.1)"
            />
            <YAxis
              domain={['dataMin - 1', 'dataMax + 1']}
              tick={{ fontSize: 11, fill: '#707A8A' }}
              stroke="rgba(240,185,11,.1)"
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(30,35,41,0.95)',
                border: '1px solid rgba(240,185,11,.2)',
                borderRadius: '6px',
              }}
              formatter={(value: unknown) => `FS$ ${(value as number).toFixed(2)}`}
              labelStyle={{ color: '#EAECEF', fontSize: '12px' }}
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="#F0B90B"
              dot={false}
              isAnimationActive={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {variation && (
        <div className={`text-sm font-medium ${variationColor}`} data-testid="buy-modal-price-chart-7d">
          Variação 7d: {variationSign}{variation.pct.toFixed(2)}% ({variationSign}FS$ {Math.abs(variation.diff).toFixed(2)})
        </div>
      )}
    </div>
  )
}
