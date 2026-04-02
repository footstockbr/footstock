'use client'
// ============================================================================
// Foot Stock — EvolutionChart (module-15, TASK-2/ST004)
// Gráfico de linha Recharts lazy-loaded com 7 períodos.
// NUNCA usa dados aleatórios — apenas price_history real.
// Rastreabilidade: INT-024
// ============================================================================

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { formatFS } from '@/lib/utils/formatCurrency'
import { PORTFOLIO_PERIOD } from '@/lib/enums'
import type { PortfolioPeriod } from '@/lib/enums'
import type { HistoryPoint } from '@/types/portfolio'

// Lazy load Recharts — mantém fora do bundle principal
const ResponsiveContainer = dynamic(
  () => import('recharts').then((m) => m.ResponsiveContainer),
  { ssr: false }
)
const LineChart = dynamic(
  () => import('recharts').then((m) => m.LineChart),
  { ssr: false }
)
const Line = dynamic(() => import('recharts').then((m) => m.Line), { ssr: false })
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false })

// ---------------------------------------------------------------------------
// Períodos
// ---------------------------------------------------------------------------

const PERIODS: Array<{ label: string; value: PortfolioPeriod }> = [
  { label: '1H',   value: PORTFOLIO_PERIOD.H1 },
  { label: '12H',  value: PORTFOLIO_PERIOD.H12 },
  { label: '24H',  value: PORTFOLIO_PERIOD.H24 },
  { label: '7D',   value: PORTFOLIO_PERIOD.WEEK },
  { label: '30D',  value: PORTFOLIO_PERIOD.MONTH },
  { label: '1A',   value: PORTFOLIO_PERIOD.YEAR },
  { label: 'TOTAL', value: PORTFOLIO_PERIOD.ALL },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EvolutionChartProps {
  data: HistoryPoint[]
  period: PortfolioPeriod
  onPeriodChange: (p: PortfolioPeriod) => void
  isLoading: boolean
  isError?: boolean
  onRetry?: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAxisDate(d: string): string {
  const parts = d.split('-')
  if (parts.length < 3) return d
  return `${parts[2]}/${parts[1]}`
}

function formatAxisValue(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  return String(v)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EvolutionChart({ data, period, onPeriodChange, isLoading, isError, onRetry }: EvolutionChartProps) {
  if (isError) {
    return <ErrorState message="Erro ao carregar gráfico de evolução." onRetry={onRetry} />
  }

  if (isLoading) {
    return <Skeleton className="min-h-[192px] w-full" />
  }

  const lastValue = data.at(-1)?.totalValue ?? 0
  const ariaLabel = `Gráfico de evolução do patrimônio — período ${period}. Valor atual: ${formatFS(lastValue)}`

  return (
    <div className="bg-[#1E2329] border border-[#1e2a3a] rounded-xl p-4">
      {/* Seletor de período */}
      <div
        role="group"
        aria-label="Selecionar período do gráfico"
        className="flex gap-1 flex-wrap mb-3"
      >
        {PERIODS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => onPeriodChange(value)}
            aria-pressed={period === value}
            aria-label={`${label} — período ${value}`}
            className={`px-3 py-1 text-xs rounded-full transition-colors focus:outline-2 focus:outline-[#F0B90B] focus:outline-offset-2 ${
              period === value
                ? 'bg-[#F0B90B] text-white font-medium'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Gráfico ou EmptyState */}
      {data.length === 0 ? (
        <EmptyState
          title="Sem dados históricos ainda"
          description="Negocie suas primeiras ações para ver a evolução."
          className="min-h-[160px]"
        />
      ) : (
        <div
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          className="min-h-[192px] focus:outline-2 focus:outline-[#F0B90B] focus:outline-offset-2 rounded"
        >
          <ResponsiveContainer width="100%" height={192}>
            <LineChart data={data}>
              <XAxis
                dataKey="date"
                tickFormatter={formatAxisDate}
                stroke="#475569"
                tick={{ fill: '#94a3b8', fontSize: 10 }}
              />
              <YAxis
                tickFormatter={formatAxisValue}
                stroke="#475569"
                tick={{ fill: '#94a3b8', fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  background: '#1E2329',
                  border: '1px solid #F0B90B',
                  borderRadius: 8,
                }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(value: unknown) => [formatFS(value as number), 'Patrimônio']}
              />
              <Line
                type="monotone"
                dataKey="totalValue"
                stroke="#F0B90B"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
