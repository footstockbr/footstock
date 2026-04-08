'use client'

import { useEffect, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

type Period = '1H' | '12H' | '24H' | '7D' | '30D' | '1Y' | 'ALL'

interface HistoryPoint {
  date: string
  totalValue: number
}

const PERIODS: Period[] = ['1H', '12H', '24H', '7D', '30D', '1Y', 'ALL']

function formatFS(value: number): string {
  return `FS$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatAxisDate(date: string, period: Period): string {
  const d = new Date(date)
  if (period === '1H' || period === '12H' || period === '24H') {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  if (period === '1Y' || period === 'ALL') {
    return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
  }
  return `${d.getDate()}/${d.getMonth() + 1}`
}

export function PortfolioChart() {
  const [period, setPeriod] = useState<Period>('7D')
  const [data, setData] = useState<HistoryPoint[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    fetch(`/api/v1/portfolio/history?period=${period}`)
      .then(r => r.json())
      .then(json => { if (json.success) setData(json.data) })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [period])

  const first = data[0]?.totalValue ?? 0
  const last = data[data.length - 1]?.totalValue ?? 0
  const isPositive = last >= first
  const color = isPositive ? '#2EBD85' : '#F6465D'
  const gradientId = isPositive ? 'gradGreen' : 'gradRed'

  return (
    <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-[#EAECEF]">Evolução Patrimonial</h2>
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                period === p
                  ? 'bg-[#F0B90B] text-[#0B0E11]'
                  : 'text-[#929AA5] hover:text-[#EAECEF]'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-36 flex items-center justify-center">
          <div className="w-5 h-5 rounded-full border-2 border-[#F0B90B] border-t-transparent animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="h-36 flex items-center justify-center text-xs text-[#929AA5]">
          Sem dados para este período
        </div>
      ) : (
        <div className="h-36" role="img" aria-label={`Gráfico de evolução patrimonial — período ${period}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={v => formatAxisDate(v, period)}
                tick={{ fontSize: 9, fill: '#929AA5' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={v => v >= 1000 ? `FS$${(v / 1000).toFixed(1)}k` : `FS$${v.toFixed(0)}`}
                tick={{ fontSize: 9, fill: '#929AA5' }}
                tickLine={false}
                axisLine={false}
                width={42}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{
                  background: '#1a1815',
                  border: `1px solid ${color}33`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: '#F0B90B' }}
                formatter={(value: number) => [formatFS(value), 'Patrimônio']}
                labelFormatter={(label: string) => new Date(label).toLocaleString('pt-BR')}
              />
              <Area
                type="monotone"
                dataKey="totalValue"
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 3, fill: color }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
