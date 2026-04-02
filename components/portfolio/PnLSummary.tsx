'use client'
// ============================================================================
// Foot Stock — PnLSummary (module-15, TASK-2/ST003)
// Card de P&L total com breakdown, seta direcional e skeleton.
// Rastreabilidade: INT-023
// ============================================================================

import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatFS } from '@/lib/utils/formatCurrency'
import { InfoIcon } from '@/components/ui/InfoIcon'
import { FIELD_TERM_MAP } from '@/lib/data/glossary'

interface PnLSummaryProps {
  totalPnL: number
  totalPnLPercent: number
  pnLToday?: number
  pnLTodayPercent?: number
  isLoading: boolean
  isError?: boolean
  onRetry?: () => void
}

export function PnLSummary({
  totalPnL,
  totalPnLPercent,
  pnLToday,
  pnLTodayPercent,
  isLoading,
  isError,
  onRetry,
}: PnLSummaryProps) {
  if (isLoading) {
    return <Skeleton className="min-h-[64px] w-full" />
  }

  if (isError) {
    return <ErrorState compact message="Erro ao carregar P&L" onRetry={onRetry} />
  }

  if (totalPnL === 0 && totalPnLPercent === 0 && pnLToday === undefined) {
    return (
      <div className="bg-[#1E2329] border border-[#1e2a3a] rounded-xl p-4 min-h-[64px]">
        <EmptyState
          title="Sem P&L ainda"
          description="Negocie para ver seus resultados aqui."
        />
      </div>
    )
  }

  const pnlColor =
    totalPnL > 0
      ? 'text-emerald-400'
      : totalPnL < 0
        ? 'text-red-400'
        : 'text-slate-400'

  const pnlArrow = totalPnL > 0 ? '↑' : totalPnL < 0 ? '↓' : '—'

  const pctText =
    totalPnLPercent !== 0
      ? `${totalPnL >= 0 ? '+' : ''}${totalPnLPercent.toFixed(2)}%`
      : '0,00%'

  const ariaLabel = `P&L total: ${totalPnL >= 0 ? '+' : ''}${formatFS(Math.abs(totalPnL))}, ${pctText}`

  return (
    <div
      className="bg-[#1E2329] border border-[#1e2a3a] rounded-xl p-4 min-h-[64px] focus:outline-2 focus:outline-[#F0B90B] focus:outline-offset-2"
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
    >
      <div className="text-xs text-slate-400 mb-1 inline-flex items-center gap-1">
        <span>P&L Total</span>
        <InfoIcon glossarySlug={FIELD_TERM_MAP['pnl']} />
      </div>
      <p className={`text-xl font-bold ${pnlColor}`}>
        {pnlArrow} {formatFS(totalPnL)}
      </p>
      <p className={`text-sm ${pnlColor}`}>{pctText}</p>
      {pnLToday !== undefined && (
        <p className="text-xs text-slate-400 mt-1">
          Hoje:{' '}
          {Number.isFinite(pnLToday)
            ? `${pnLToday >= 0 ? '+' : ''}${formatFS(pnLToday)}`
            : '—'}
          {pnLTodayPercent !== undefined && Number.isFinite(pnLTodayPercent)
            ? ` (${pnLTodayPercent >= 0 ? '+' : ''}${pnLTodayPercent.toFixed(2)}%)`
            : ''}
        </p>
      )}
    </div>
  )
}
