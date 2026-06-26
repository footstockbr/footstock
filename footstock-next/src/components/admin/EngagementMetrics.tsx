'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { ChartFrame } from './ChartFrame'
import { Users, Activity, Zap, Clock, TrendingUp, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { Skeleton } from '@/components/ui/skeleton'
import type { EngagementMetricsDTO, EngagementDayPoint } from '@/lib/types/admin'
import { formatFSValue } from '@/lib/utils/format'

interface EngagementMetricsProps {
  data: EngagementMetricsDTO | null
  history: EngagementDayPoint[]
  isLoading: boolean
}

function formatDate(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

const formatFS = formatFSValue

const ABSENCE_PERIODS = [
  { key: 'd1'     , label: '1 dia',   color: '#f97316' },
  { key: 'd7'     , label: '7 dias',  color: '#f97316' },
  { key: 'd15'    , label: '15 dias', color: '#F6465D' },
  { key: 'd30'    , label: '30 dias', color: '#F6465D' },
  { key: 'd30plus', label: '+30d',    color: 'rgba(246,70,93,.55)' },
] as const

export function EngagementMetrics({ data, history, isLoading }: EngagementMetricsProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </div>
        <Skeleton className="h-[200px] md:h-[300px] w-full rounded-xl" />
      </div>
    )
  }

  const inactiveByPeriod = data?.inactiveByPeriod
  const fsBreakdown = data?.fsBreakdown

  return (
    <div className="space-y-4">
      {/* Stats row 1 — DAU/WAU/MAU/Pico */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="DAU"
          value={String(data?.DAU ?? 0)}
          subValue="últimas 24h"
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="WAU"
          value={String(data?.WAU ?? 0)}
          subValue="últimos 7 dias"
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          label="MAU"
          value={String(data?.MAU ?? 0)}
          subValue="últimos 30 dias"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Pico Simultâneo"
          value={data?.peakConcurrentUsers ? String(data.peakConcurrentUsers) : 'N/D'}
          subValue="hoje"
          icon={<Zap className="h-4 w-4" />}
        />
      </div>

      {/* Stats row 2 — Retenção / FS$ movimentados / Duração */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          label="Retenção WAU"
          value={data?.retentionRate != null ? `${data.retentionRate}%` : 'N/D'}
          subValue="semana-sobre-semana"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="FS$ Movimentados"
          value={`FS$${formatFS(data?.totalFsMovimentados24h ?? 0)}`}
          subValue="últimas 24h"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Duração Média"
          value={
            data?.avgSessionDuration != null
              ? `${Math.round(data.avgSessionDuration / 60)}min`
              : 'N/D'
          }
          subValue="por sessão"
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* FS$ Breakdown (30 dias) + Top Ativo */}
      {fsBreakdown && (
        <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
          <h3 className="text-xs font-bold text-[#929AA5] uppercase tracking-wider mb-3">
            FS$ Movimentados no Mês
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            {[
              { label: 'Compras',    value: fsBreakdown.compras,    color: '#6c63ff', icon: <ArrowUpRight className="h-3 w-3" /> },
              { label: 'Vendas',     value: fsBreakdown.vendas,     color: '#F6465D', icon: <ArrowDownRight className="h-3 w-3" /> },
              { label: 'Dividendos', value: fsBreakdown.dividendos, color: '#2EBD85', icon: <TrendingUp className="h-3 w-3" /> },
              { label: 'Taxas',      value: fsBreakdown.taxas,      color: '#f97316', icon: <Activity className="h-3 w-3" /> },
            ].map(({ label, value, color, icon }) => (
              <div key={label} className="bg-[#181A20] rounded-lg p-3">
                <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">{label}</p>
                <p className="text-sm font-extrabold font-mono leading-none" style={{ color }}>
                  <span className="inline-flex items-center gap-0.5">
                    {icon}
                    FS${formatFS(value)}
                  </span>
                </p>
              </div>
            ))}
          </div>

          {/* Top ativo + Top P&L */}
          {data?.topAsset && (
            <div className="flex gap-2">
              <div className="flex-1 bg-[#181A20] rounded-lg p-3">
                <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Ativo Mais Negociado</p>
                <p className="text-base font-extrabold text-white">{data.topAsset.ticker}</p>
                <p className="text-[10px] text-[#929AA5] font-mono mt-0.5">
                  {data.topAsset.volume.toLocaleString('pt-BR')} ordens
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ausência por período */}
      {inactiveByPeriod && (
        <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
          <h3 className="text-xs font-bold text-[#929AA5] uppercase tracking-wider mb-3">
            Ausência por Período
          </h3>
          <div className="flex gap-1.5">
            {ABSENCE_PERIODS.map(({ key, label, color }) => {
              const value = inactiveByPeriod[key]
              return (
                <div
                  key={key}
                  className="flex-1 bg-[#181A20] rounded-lg py-2.5 px-1 text-center"
                >
                  <p className="text-lg font-extrabold font-mono leading-none" style={{ color }}>
                    {value.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-[9px] text-[#929AA5] mt-1 leading-tight">{label}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Badge de métricas aproximadas */}
      {data?._approximated && (
        <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-500/10 rounded-lg px-3 py-2">
          <span className="font-medium">Métricas aproximadas</span>
          <span className="text-yellow-500/70">— baseadas em ordens executadas (sem tabela de sessões)</span>
        </div>
      )}

      {/* Gráfico DAU/WAU */}
      <div
        className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4"
        role="img"
        aria-label="Gráfico de DAU e WAU dos últimos 30 dias"
      >
        <h3 className="text-sm font-semibold text-[#EAECEF] mb-4">DAU / WAU — Histórico</h3>
        <ChartFrame className="h-[200px] md:h-[300px]">
          {({ width, height }) => (
            <AreaChart width={width} height={height} data={Array.isArray(history) ? history : []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="dauGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F0B90B" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#F0B90B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(240,185,11,0.06)" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                stroke="#71717a"
                tick={{ fontSize: 11 }}
                interval={Math.floor(history.length / 6)}
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
                labelFormatter={(l) => `Data: ${formatDate(l as string)}`}
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
          )}
        </ChartFrame>
      </div>
    </div>
  )
}
