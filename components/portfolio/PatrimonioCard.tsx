'use client'
// ============================================================================
// Foot Stock — PatrimonioCard (module-15, TASK-2/ST002)
// Card de patrimônio total com variação colorida, 4 estados e acessibilidade.
// Rastreabilidade: INT-023
// ============================================================================

import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatFS } from '@/lib/utils/formatCurrency'
import { usePortfolioSummary } from '@/hooks/usePortfolio'
import type { PortfolioSummary } from '@/types/portfolio'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PatrimonioCardProps {
  summary?: PortfolioSummary | null
  isLoading?: boolean
  onRetry?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PatrimonioCard({ summary, isLoading, onRetry }: PatrimonioCardProps) {
  const query = usePortfolioSummary()

  // Usa dados passados via props OU dados do hook
  const data = summary ?? query.data
  const loading = isLoading ?? query.isLoading
  const error = query.isError
  const refetch = onRetry ?? query.refetch

  // -----------
  // Estado: Loading
  // -----------
  if (loading) {
    return (
      <div
        className="w-full"
        role="status"
        aria-label="Carregando patrimônio"
        aria-busy="true"
      >
        <Skeleton className="min-h-32 w-full rounded-xl" />
      </div>
    )
  }

  // -----------
  // Estado: Error
  // -----------
  if (error) {
    return (
      <ErrorState
        message="Erro ao carregar patrimônio total"
        onRetry={() => refetch()}
      />
    )
  }

  // -----------
  // Estado: Empty
  // -----------
  if (!data) {
    return (
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 min-h-32 flex items-center justify-center"
        role="region"
        aria-label="Sem posições"
      >
        <EmptyState
          title="Sem posições"
          description="Faça sua primeira ordem para começar."
        />
      </div>
    )
  }

  // -----------
  // Estado: Success
  // -----------
  const totalValue = data.totalValue
  const totalPnLPercent = data.totalPnLPercent

  const isPnLPositive = totalPnLPercent > 0
  const isPnLNegative = totalPnLPercent < 0
  const isPnLNeutral = totalPnLPercent === 0

  const pnlColorClass = isPnLPositive
    ? 'text-emerald-400'
    : isPnLNegative
      ? 'text-red-400'
      : 'text-slate-400'

  const pnlArrow = isPnLPositive ? '▲' : isPnLNegative ? '▼' : '—'

  const pnlText = isPnLNeutral
    ? '0,00%'
    : `${totalPnLPercent >= 0 ? '+' : ''}${totalPnLPercent.toFixed(2)}%`

  const ariaLabel = `Patrimônio total: ${formatFS(totalValue)}, variação: ${pnlText}`

  return (
    <div
      className="w-full sm:w-auto bg-zinc-900 border border-zinc-800 rounded-xl p-6 min-h-32 flex flex-col justify-center focus:outline-2 focus:outline-[#C9A84C] focus:outline-offset-2"
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
    >
      <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide font-semibold">
        Patrimônio Total
      </p>
      <p className="text-3xl font-bold text-white mb-2">
        {formatFS(totalValue)}
      </p>
      <p className={`text-sm ${pnlColorClass} flex items-center gap-1`}>
        <span aria-hidden="true">{pnlArrow}</span>
        <span>{pnlText}</span>
      </p>
    </div>
  )
}
