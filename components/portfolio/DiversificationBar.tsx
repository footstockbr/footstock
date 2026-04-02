'use client'
// ============================================================================
// Foot Stock — DiversificationBar (module-15, TASK-2/ST005)
// Barra horizontal % por clube com legenda top 5.
// Rastreabilidade: INT-023
// ============================================================================

import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import type { PositionWithPnL } from '@/types/portfolio'

// Gera paleta de 40 cores HSL distintas
const CLUB_COLORS = Array.from({ length: 40 }, (_, i) => `hsl(${i * 9}, 70%, 55%)`)

interface DiversificationBarProps {
  positions: PositionWithPnL[]
  isLoading: boolean
  isError?: boolean
  onRetry?: () => void
}

export function DiversificationBar({ positions, isLoading, isError, onRetry }: DiversificationBarProps) {
  if (isError) {
    return <ErrorState message="Erro ao carregar diversificação." onRetry={onRetry} />
  }

  if (isLoading) {
    return (
      <div className="bg-[#1E2329] border border-[#1e2a3a] rounded-xl p-4 space-y-2">
        <Skeleton className="min-h-[12px] w-full rounded-full" />
        <div className="flex gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="min-h-[16px] w-16" />
          ))}
        </div>
      </div>
    )
  }

  // Calcular valor por ticker
  const byTicker: Record<string, { value: number; name: string }> = {}
  for (const p of positions) {
    const val = p.qty * p.currentPrice
    if (!byTicker[p.ticker]) {
      byTicker[p.ticker] = { value: 0, name: p.clubName }
    }
    byTicker[p.ticker]!.value += val
  }

  const totalValue = Object.values(byTicker).reduce((a, b) => a + b.value, 0)

  if (totalValue === 0) {
    return (
      <div className="bg-[#1E2329] border border-[#1e2a3a] rounded-xl p-4">
        <EmptyState title="Sem posições abertas" />
      </div>
    )
  }

  const sorted = Object.entries(byTicker).sort((a, b) => b[1].value - a[1].value)
  const top5 = sorted.slice(0, 5)
  const othersValue = sorted.slice(5).reduce((a, [, v]) => a + v.value, 0)

  const ariaLabel =
    'Diversificação do portfólio: ' +
    top5.map(([ticker, v]) => `${ticker} ${((v.value / totalValue) * 100).toFixed(1)}%`).join(', ')

  return (
    <div className="bg-[#1E2329] border border-[#1e2a3a] rounded-xl p-4">
      <p className="text-xs text-slate-400 mb-2">Diversificação</p>

      {/* Barra horizontal */}
      <div
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        className="flex w-full h-3 rounded-full overflow-hidden focus:outline-2 focus:outline-[#F0B90B] focus:outline-offset-2"
      >
        {sorted.map(([ticker, v], idx) => {
          const pct = (v.value / totalValue) * 100
          return (
            <div
              key={ticker}
              style={{
                width: `${pct}%`,
                backgroundColor: CLUB_COLORS[idx % CLUB_COLORS.length],
              }}
              title={`${ticker}: ${pct.toFixed(1)}%`}
            />
          )
        })}
      </div>

      {/* Legenda top 5 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {top5.map(([ticker, v], idx) => {
          const pct = ((v.value / totalValue) * 100).toFixed(1)
          return (
            <div key={ticker} className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: CLUB_COLORS[idx % CLUB_COLORS.length] }}
              />
              <span className="text-xs text-slate-300">
                {ticker} <span className="text-slate-400">{pct}%</span>
              </span>
            </div>
          )
        })}
        {othersValue > 0 && (
          <div className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: CLUB_COLORS[Math.min(5, CLUB_COLORS.length - 1)] }}
            />
            <span className="text-xs text-slate-400">
              Outros {((othersValue / totalValue) * 100).toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
