'use client'
// ============================================================================
// Foot Stock — RevenueChart
// Gráfico de área MRR com Recharts + ResponsiveContainer.
// Rastreabilidade: INT-085, TASK-2/ST005
// ============================================================================

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
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
  const parts = iso.split('-')
  return `${parts[2]}/${parts[1]}`
}

export function RevenueChart({ data, isLoading }: RevenueChartProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="skeleton mb-4 h-4 w-40 rounded" aria-hidden="true" />
        <div className="skeleton h-[200px] w-full rounded md:h-[280px]" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
      role="img"
      aria-label="Gráfico de MRR dos últimos 30 dias"
    >
      <h3 className="mb-4 text-sm font-semibold text-zinc-100">MRR — Últimos 30 dias</h3>
      <div className="h-[200px] md:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F0B90B" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#F0B90B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(63,63,70,0.6)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke="#71717a"
              tick={{ fontSize: 11 }}
              interval={data.length > 0 ? Math.floor(data.length / 6) : 1}
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
                new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                  Number(value)
                )
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
        </ResponsiveContainer>
      </div>
    </div>
  )
}
