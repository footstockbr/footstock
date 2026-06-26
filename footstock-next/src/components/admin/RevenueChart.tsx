'use client'

import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartFrame } from './ChartFrame'
import type { RevenueDayPoint } from '@/lib/types/admin'

interface RevenueChartProps {
  data: RevenueDayPoint[]
  isLoading: boolean
}

function formatBRLAbbr(value: number) {
  if (value >= 1000) return `R$${(value / 1000).toFixed(1)}k`
  return `R$${value.toFixed(0)}`
}

function formatDate(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export function RevenueChart({ data, isLoading }: RevenueChartProps) {
  if (isLoading) {
    return (
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton className="h-[200px] md:h-[300px] w-full rounded" />
      </div>
    )
  }

  return (
    <div
      className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4"
      role="img"
      aria-label="Gráfico de MRR dos últimos 30 dias"
    >
      <h3 className="text-sm font-semibold text-[#EAECEF] mb-4">MRR — Últimos 30 dias</h3>
      <ChartFrame className="h-[200px] md:h-[300px]">
        {({ width, height }) => (
          <AreaChart width={width} height={height} data={Array.isArray(data) ? data : []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F0B90B" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#F0B90B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(240,185,11,0.06)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke="#71717a"
              tick={{ fontSize: 11 }}
              interval={Math.floor(data.length / 6)}
            />
            <YAxis
              tickFormatter={formatBRLAbbr}
              stroke="#71717a"
              tick={{ fontSize: 11 }}
              width={52}
            />
            <Tooltip
              contentStyle={{
                background: '#18181b',
                border: '1px solid #3f3f46',
                borderRadius: '8px',
                color: '#f4f4f5',
                fontSize: 12,
              }}
              formatter={(value) =>
                new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value))
              }
              labelFormatter={(label) => `Data: ${formatDate(label as string)}`}
            />
            <Area
              type="monotone"
              dataKey="mrr"
              stroke="#F0B90B"
              strokeWidth={2}
              fill="url(#mrrGradient)"
            />
          </AreaChart>
        )}
      </ChartFrame>
    </div>
  )
}
