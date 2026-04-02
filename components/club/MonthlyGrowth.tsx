'use client'
// ============================================================================
// Foot Stock — MonthlyGrowth
// Gráfico de crescimento de fãs nos últimos 6 meses com área preenchida.
// Rastreabilidade: INT-084, US-025, TASK-2/ST004
// ============================================================================

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import type { MonthlyGrowthEntry } from '@/types/club'

interface MonthlyGrowthProps {
  monthlyGrowth: MonthlyGrowthEntry[] | undefined
}

/** Formata YYYY-MM para abreviação pt-BR: "2025-03" → "Mar" */
function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-').map(Number)
  if (!year || !month) return yyyyMM
  const date = new Date(year, month - 1, 1)
  return date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
}

/** Formata para tooltip: "2025-03" → "Março 2025" */
function formatMonthFull(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-').map(Number)
  if (!year || !month) return yyyyMM
  const date = new Date(year, month - 1, 1)
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export function MonthlyGrowthChart({ monthlyGrowth }: MonthlyGrowthProps) {
  if (!monthlyGrowth) {
    return (
      <div className="flex flex-col gap-3">
        <div className="skeleton h-5 w-56 rounded" />
        <Skeleton className="h-[200px] w-full rounded-lg" />
      </div>
    )
  }

  if (monthlyGrowth.length < 2) {
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold text-zinc-100">
          Crescimento de Fãs — Últimos 6 Meses
        </h3>
        <EmptyState title="Dados insuficientes para exibir gráfico" />
      </div>
    )
  }

  const chartData = monthlyGrowth.map((entry) => ({
    ...entry,
    label: formatMonthLabel(entry.month),
    fullLabel: formatMonthFull(entry.month),
  }))

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold text-zinc-100">
        Crescimento de Fãs — Últimos 6 Meses
      </h3>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart
          data={chartData}
          role="img"
          aria-label="Crescimento mensal de fãs"
          margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#C9A84C" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#C9A84C" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis
            dataKey="label"
            tick={{ fill: '#71717a', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#71717a', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={30}
          />
          <Tooltip
            formatter={(value) => [`${value} novos fãs`]}
            labelFormatter={(label, payload) => {
              const item = payload?.[0]?.payload as { fullLabel?: string } | undefined
              return item?.fullLabel ?? (label as string)
            }}
            contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
            labelStyle={{ color: '#d4d4d8', fontWeight: 600 }}
          />
          <Area
            type="monotone"
            dataKey="newFans"
            stroke="#C9A84C"
            strokeWidth={2}
            fill="url(#goldGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
