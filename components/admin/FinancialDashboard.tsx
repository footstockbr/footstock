'use client'
// ============================================================================
// Foot Stock — FinancialDashboard
// MRR, ARR, churn rate, novas assinaturas e gráfico de tendência.
// Requer: financial:read (SUPER_ADMIN, ADMINISTRADOR).
// Rastreabilidade: INT-085
// ============================================================================

import { useEffect, useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Users,
  AlertTriangle,
  DollarSign,
  BarChart2,
  Info,
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { formatBRL } from '@/lib/utils/formatCurrency'
import type { RevenueDayPoint } from '@/lib/types/admin'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface FinancialMetrics {
  mrr: number
  arr: number
  churnRate: number
  activeSubscriptions: number
  newSubscriptions24h: number
  cancelledThisMonth: number
  cancelledPrevMonth: number
  planDistribution: { plan: string; count: number; mrr: number }[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAN_LABEL: Record<string, string> = {
  JOGADOR: 'Jogador',
  CRAQUE: 'Craque',
  LENDA: 'Lenda',
}

const PLAN_COLOR: Record<string, string> = {
  JOGADOR: '#71717a',
  CRAQUE: '#F0B90B',
  LENDA: '#4ade80',
}

function formatDateAxis(iso: string) {
  const parts = iso.split('-')
  return `${parts[2]}/${parts[1]}`
}

function formatBRLAbbr(value: number) {
  if (value >= 1000) return `R$${(value / 1000).toFixed(1)}k`
  return `R$${value.toFixed(0)}`
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  sub,
  highlight,
  icon,
  isLoading,
  tooltip,
}: {
  label: string
  value: string
  sub?: string
  highlight?: 'yellow' | 'green' | 'red'
  icon: React.ReactNode
  isLoading: boolean
  tooltip?: string
}) {
  const colorMap = {
    yellow: 'text-[#F0B90B]',
    green: 'text-[#4ade80]',
    red: 'text-[#F6465D]',
  }
  const valueColor = highlight ? colorMap[highlight] : 'text-zinc-100'

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between text-zinc-500">
        <span className="flex items-center gap-1.5 text-xs uppercase tracking-wide">
          {icon}
          {label}
        </span>
        {tooltip && (
          <span
            title={tooltip}
            className="cursor-help text-zinc-600 hover:text-zinc-400 transition-colors"
            aria-label={`Informação: ${tooltip}`}
          >
            <Info size={12} />
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="skeleton h-7 w-32 rounded" aria-hidden="true" />
      ) : (
        <p className={`text-2xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      )}
      {sub && !isLoading && (
        <p className="text-xs text-zinc-500">{sub}</p>
      )}
    </div>
  )
}

function ChurnCard({
  churnRate,
  cancelledThisMonth,
  cancelledPrevMonth,
  isLoading,
}: {
  churnRate: number
  cancelledThisMonth: number
  cancelledPrevMonth: number
  isLoading: boolean
}) {
  const isHigh = churnRate > 5
  const improving = cancelledThisMonth <= cancelledPrevMonth

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between text-zinc-500">
        <span className="flex items-center gap-1.5 text-xs uppercase tracking-wide">
          <TrendingDown size={14} />
          Churn Rate
        </span>
        <span
          title="cancelamentos_mês / total_assinaturas_início_mês × 100"
          className="cursor-help text-zinc-600 hover:text-zinc-400 transition-colors"
          aria-label="Fórmula: cancelamentos no mês dividido por total de assinaturas no início do mês, vezes 100"
        >
          <Info size={12} />
        </span>
      </div>
      {isLoading ? (
        <div className="skeleton h-7 w-24 rounded" aria-hidden="true" />
      ) : (
        <div className="flex items-center gap-2">
          <p className={`text-2xl font-bold tabular-nums ${isHigh ? 'text-[#F6465D]' : 'text-[#4ade80]'}`}>
            {churnRate.toFixed(1)}%
          </p>
          {improving ? (
            <TrendingDown size={16} className="text-[#4ade80]" aria-label="Melhorando" />
          ) : (
            <TrendingUp size={16} className="text-[#F6465D]" aria-label="Piorando" />
          )}
        </div>
      )}
      {!isLoading && (
        <p className="text-xs text-zinc-500">
          {cancelledThisMonth} cancel. este mês · {cancelledPrevMonth} mês anterior
        </p>
      )}
      {!isLoading && (
        <p
          className="text-[10px] text-zinc-600 leading-tight"
          title="cancelamentos_mês / assinantes_início_mês × 100"
        >
          cancelamentos / assinantes × 100
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function FinancialDashboard() {
  const [metrics, setMetrics] = useState<FinancialMetrics | null>(null)
  const [revenueHistory, setRevenueHistory] = useState<RevenueDayPoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setIsLoading(true)
      setError(null)
      try {
        const [metricsRes, historyRes] = await Promise.all([
          fetch('/api/v1/admin/financial'),
          fetch('/api/v1/admin/revenue-history?days=30'),
        ])

        if (!metricsRes.ok) {
          setError('Não foi possível carregar métricas financeiras.')
          return
        }

        const metricsJson = (await metricsRes.json()) as { data?: FinancialMetrics }
        setMetrics(metricsJson.data ?? null)

        if (historyRes.ok) {
          const historyJson = (await historyRes.json()) as { data?: RevenueDayPoint[] }
          setRevenueHistory(historyJson.data ?? [])
        }
      } catch {
        setError('Erro de conexão ao carregar dados financeiros.')
      } finally {
        setIsLoading(false)
      }
    }

    void load()
  }, [])

  if (error) {
    return (
      <div className="rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-300 flex items-center gap-2">
        <AlertTriangle size={14} />
        {error}
      </div>
    )
  }

  const planDistribution = metrics?.planDistribution ?? []
  const pieData = planDistribution
    .filter((p) => p.count > 0)
    .map((p) => ({
      name: PLAN_LABEL[p.plan] ?? p.plan,
      value: p.count,
      mrr: p.mrr,
      color: PLAN_COLOR[p.plan] ?? '#71717a',
    }))

  return (
    <div className="space-y-4">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="MRR"
          value={isLoading ? '—' : formatBRL(metrics?.mrr ?? 0)}
          sub="Receita Mensal Recorrente"
          highlight="yellow"
          icon={<DollarSign size={14} />}
          isLoading={isLoading}
          tooltip="MRR = soma de (preço_plano × assinantes_ativos) por plano"
        />
        <MetricCard
          label="ARR"
          value={isLoading ? '—' : formatBRL(metrics?.arr ?? 0)}
          sub="Projeção anual (MRR × 12)"
          icon={<TrendingUp size={14} />}
          isLoading={isLoading}
          tooltip="ARR = MRR × 12. Projeção anualizada sem considerar variações de crescimento."
        />
        <ChurnCard
          churnRate={metrics?.churnRate ?? 0}
          cancelledThisMonth={metrics?.cancelledThisMonth ?? 0}
          cancelledPrevMonth={metrics?.cancelledPrevMonth ?? 0}
          isLoading={isLoading}
        />
        <MetricCard
          label="Novas Assinaturas"
          value={isLoading ? '—' : String(metrics?.newSubscriptions24h ?? 0)}
          sub="Últimas 24h"
          highlight="green"
          icon={<Users size={14} />}
          isLoading={isLoading}
        />
      </div>

      {/* Gráfico MRR + Distribuição por plano */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* MRR AreaChart — ocupa 2/3 */}
        <div
          className="lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900 p-4"
          role="img"
          aria-label="Gráfico de MRR dos últimos 30 dias"
        >
          <h3 className="mb-4 text-sm font-semibold text-zinc-100">MRR — Últimos 30 dias</h3>
          {isLoading ? (
            <div className="skeleton h-[200px] w-full rounded md:h-[240px]" aria-hidden="true" />
          ) : revenueHistory.length === 0 ? (
            <div className="flex items-center gap-2 h-[200px] justify-center text-sm text-zinc-500">
              <AlertTriangle size={14} className="text-[#F0B90B]" />
              Sem dados de histórico disponíveis.
            </div>
          ) : (
            <div className="h-[200px] md:h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueHistory} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="financialMrrGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F0B90B" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#F0B90B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(63,63,70,0.5)" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDateAxis}
                    stroke="#52525b"
                    tick={{ fontSize: 11, fill: '#71717a' }}
                    tickLine={false}
                    axisLine={false}
                    interval={revenueHistory.length > 0 ? Math.floor(revenueHistory.length / 6) : 1}
                  />
                  <YAxis
                    tickFormatter={formatBRLAbbr}
                    stroke="#52525b"
                    tick={{ fontSize: 11, fill: '#71717a' }}
                    tickLine={false}
                    axisLine={false}
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
                    formatter={(value) => [formatBRL(Number(value)), 'MRR']}
                    labelFormatter={(label) => `Data: ${formatDateAxis(String(label))}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="mrr"
                    stroke="#F0B90B"
                    strokeWidth={2}
                    fill="url(#financialMrrGradient)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#F0B90B', strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          {!isLoading && (metrics?.mrr ?? 0) === 0 && (
            <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
              <AlertTriangle size={12} className="text-[#F0B90B]" />
              Sem assinaturas pagas ativas no momento.
            </div>
          )}
        </div>

        {/* Distribuição por plano — ocupa 1/3 */}
        <div
          className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
          role="img"
          aria-label="Distribuição de assinaturas por plano"
        >
          <h3 className="mb-4 text-sm font-semibold text-zinc-100 flex items-center gap-2">
            <BarChart2 size={14} className="text-zinc-400" />
            Distribuição por plano
          </h3>
          {isLoading ? (
            <div className="space-y-2">
              <div className="skeleton h-[160px] w-full rounded" aria-hidden="true" />
              <div className="skeleton h-4 w-full rounded" aria-hidden="true" />
            </div>
          ) : pieData.length === 0 ? (
            <div className="flex items-center justify-center h-[160px] text-sm text-zinc-500">
              Sem assinaturas ativas.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: '#18181b',
                        border: '1px solid #3f3f46',
                        borderRadius: '8px',
                        color: '#f4f4f5',
                        fontSize: 12,
                      }}
                      formatter={(value, _name, props) => [
                        `${String(value)} assinantes · ${formatBRL(props.payload.mrr as number)}`,
                        props.payload.name as string,
                      ]}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => (
                        <span className="text-xs text-zinc-400">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1.5">
                {planDistribution
                  .sort((a, b) => b.mrr - a.mrr)
                  .map((p) => (
                    <li key={p.plan} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full inline-block"
                          style={{ background: PLAN_COLOR[p.plan] ?? '#71717a' }}
                        />
                        <span className="text-zinc-300">{PLAN_LABEL[p.plan] ?? p.plan}</span>
                      </span>
                      <span className="text-zinc-500">
                        {p.count} · {formatBRL(p.mrr)}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
