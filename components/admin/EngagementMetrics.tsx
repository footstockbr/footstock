'use client'
// ============================================================================
// Foot Stock — EngagementMetrics
// Gráfico de área DAU/WAU + cards de métricas de engajamento.
// Rastreabilidade: INT-088, TASK-4/ST004
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
import { Users, Activity, Zap, Clock, TrendingUp } from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import type { EngagementMetricsDTO, EngagementDayPoint } from '@/lib/types/admin'

interface EngagementMetricsProps {
  data: EngagementMetricsDTO | null
  history: EngagementDayPoint[]
  isLoading: boolean
}

function formatDate(iso: string) {
  const parts = iso.split('-')
  return `${parts[2]}/${parts[1]}`
}

export function EngagementMetrics({ data, history, isLoading }: EngagementMetricsProps) {
  const formatBRL = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="skeleton mb-2 h-3 w-20 rounded" aria-hidden="true" />
              <div className="skeleton h-6 w-16 rounded" aria-hidden="true" />
            </div>
          ))}
        </div>
        <div className="skeleton h-[200px] w-full rounded-xl md:h-[280px]" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="DAU"
          value={String(data?.DAU ?? 0)}
          subValue="últimas 24h"
          icon={<Users size={16} />}
        />
        <StatCard
          label="WAU"
          value={String(data?.WAU ?? 0)}
          subValue="últimos 7 dias"
          icon={<Activity size={16} />}
        />
        <StatCard
          label="MAU"
          value={String(data?.MAU ?? 0)}
          subValue="últimos 30 dias"
          icon={<TrendingUp size={16} />}
        />
        <StatCard
          label="Pico Simultâneo"
          value={data?.peakConcurrentUsers ? String(data.peakConcurrentUsers) : 'N/D'}
          subValue="hoje"
          icon={<Zap size={16} />}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="FS$ Movimentados"
          value={formatBRL(data?.totalFsMovimentados24h ?? 0)}
          subValue="últimas 24h"
          icon={<TrendingUp size={16} />}
        />
        <StatCard
          label="Duração Média"
          value={
            data?.avgSessionDuration != null
              ? `${Math.round(data.avgSessionDuration / 60)}min`
              : 'N/D'
          }
          subValue="por sessão"
          icon={<Clock size={16} />}
        />
      </div>

      {data?._approximated && (
        <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
          <span className="font-medium">Métricas aproximadas</span>
          <span className="text-yellow-500/70">— baseadas em ordens executadas (sem tabela de sessões)</span>
        </div>
      )}

      <div
        className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
        role="img"
        aria-label="Gráfico de DAU e WAU dos últimos 30 dias"
      >
        <h3 className="mb-4 text-sm font-semibold text-zinc-100">DAU / WAU — Histórico</h3>
        <div className="h-[200px] md:h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="dauGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F0B90B" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#F0B90B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(63,63,70,0.6)" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke="#71717a"
                tick={{ fontSize: 11 }}
                interval={history.length > 0 ? Math.floor(history.length / 6) : 1}
              />
              <YAxis stroke="#71717a" tick={{ fontSize: 11 }} width={36} />
              <Tooltip
                contentStyle={{
                  background: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: '8px',
                  color: '#f4f4f5',
                  fontSize: 12,
                }}
                labelFormatter={l => `Data: ${formatDate(l as string)}`}
              />
              <Area
                type="monotone"
                dataKey="dau"
                name="DAU"
                stroke="#F0B90B"
                strokeWidth={2}
                fill="url(#dauGrad)"
              />
              <Area
                type="monotone"
                dataKey="wau"
                name="WAU"
                stroke="#F0B90B"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                fill="transparent"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
