'use client'
// ============================================================================
// Foot Stock — DashboardClient (module-15, TASK-2/ST006)
// Componente cliente com hooks de portfólio.
// ============================================================================

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { AppLayout } from '@/components/layout'
import { ErrorState } from '@/components/ui/ErrorState'
import { Skeleton } from '@/components/ui/Skeleton'
import { PatrimonioCard } from '@/components/portfolio/PatrimonioCard'
import { PnLSummary } from '@/components/portfolio/PnLSummary'
import {
  usePortfolioSummary,
  usePortfolioHistory,
  usePositions,
  useInvalidateOnMarginCall,
} from '@/hooks/usePortfolio'
import { useSession } from '@/hooks/useSession'
import { PORTFOLIO_PERIOD, PLAN_TYPE } from '@/lib/enums'
import type { PortfolioPeriod, PlanType } from '@/lib/enums'

// Lazy load charts — mantém bundle /dashboard < 120KB
const EvolutionChart = dynamic(
  () => import('@/components/portfolio/EvolutionChart').then((m) => m.EvolutionChart),
  {
    ssr: false,
    loading: () => <Skeleton className="min-h-[192px] w-full" />,
  }
)

const DiversificationBar = dynamic(
  () => import('@/components/portfolio/DiversificationBar').then((m) => m.DiversificationBar),
  {
    ssr: false,
    loading: () => <Skeleton className="min-h-[56px] w-full" />,
  }
)

const PositionsList = dynamic(
  () => import('@/components/portfolio/PositionsList').then((m) => m.PositionsList),
  {
    ssr: false,
    loading: () => <Skeleton className="min-h-[160px] w-full rounded-xl" />,
  }
)

const ShortsList = dynamic(
  () => import('@/components/portfolio/ShortsList').then((m) => m.ShortsList),
  {
    ssr: false,
    loading: () => <Skeleton className="min-h-[120px] w-full rounded-xl" />,
  }
)

export function DashboardClient() {
  const [period, setPeriod] = useState<PortfolioPeriod>(PORTFOLIO_PERIOD.WEEK)
  const { user } = useSession()
  const userPlan: PlanType = user?.planType ?? PLAN_TYPE.JOGADOR

  const {
    data: summary,
    isLoading: isLoadingSummary,
    isError: isErrorSummary,
    refetch: refetchSummary,
  } = usePortfolioSummary()

  const {
    data: history,
    isLoading: isLoadingHistory,
    isError: isErrorHistory,
    refetch: refetchHistory,
  } = usePortfolioHistory(period)

  const {
    data: positions,
    isLoading: isLoadingPositions,
    isError: isErrorPositions,
    refetch: refetchPositions,
  } = usePositions()

  // Reage a margin call via BroadcastChannel
  useInvalidateOnMarginCall()

  const hasError = isErrorSummary || isErrorHistory || isErrorPositions

  if (hasError) {
    return (
      <AppLayout>
        <main className="px-4 pt-4 pb-24">
          <ErrorState
            message="Erro ao carregar dados do portfólio."
            onRetry={() => {
              void refetchSummary()
              void refetchHistory()
              void refetchPositions()
            }}
          />
        </main>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <main className="px-4 pt-4 pb-24 space-y-4">
        {/* Mobile layout — coluna única */}
        <div className="md:hidden space-y-4">
          <PatrimonioCard
            summary={summary}
            isLoading={isLoadingSummary}
            onRetry={() => void refetchSummary()}
          />
          <PnLSummary
            totalPnL={summary?.totalPnL ?? 0}
            totalPnLPercent={summary?.totalPnLPercent ?? 0}
            pnLToday={summary?.pnLToday}
            pnLTodayPercent={summary?.pnLTodayPercent}
            isLoading={isLoadingSummary}
          />
          <EvolutionChart
            data={history ?? []}
            period={period}
            onPeriodChange={setPeriod}
            isLoading={isLoadingHistory}
          />
          <DiversificationBar
            positions={positions ?? []}
            isLoading={isLoadingPositions}
          />
          <div>
            <h2 className="text-sm font-semibold text-white mb-2">Posições abertas</h2>
            <PositionsList
              positions={positions ?? []}
              isLoading={isLoadingPositions}
              isError={isErrorPositions}
              onRetry={() => void refetchPositions()}
            />
          </div>
          {userPlan === PLAN_TYPE.LENDA && (
            <div>
              <h2 className="text-sm font-semibold text-white mb-2">Shorts abertos</h2>
              <ShortsList
                positions={positions ?? []}
                isLoading={isLoadingPositions}
                isError={isErrorPositions}
                onRetry={() => void refetchPositions()}
                userPlan={userPlan}
              />
            </div>
          )}
        </div>

        {/* Desktop layout — grid */}
        <div className="hidden md:grid grid-cols-2 gap-4">
          <PatrimonioCard
            summary={summary}
            isLoading={isLoadingSummary}
            onRetry={() => void refetchSummary()}
          />
          <PnLSummary
            totalPnL={summary?.totalPnL ?? 0}
            totalPnLPercent={summary?.totalPnLPercent ?? 0}
            pnLToday={summary?.pnLToday}
            pnLTodayPercent={summary?.pnLTodayPercent}
            isLoading={isLoadingSummary}
          />
        </div>
        <div className="hidden md:block">
          <EvolutionChart
            data={history ?? []}
            period={period}
            onPeriodChange={setPeriod}
            isLoading={isLoadingHistory}
          />
        </div>
        <div className="hidden md:block">
          <DiversificationBar
            positions={positions ?? []}
            isLoading={isLoadingPositions}
          />
        </div>
        <div className="hidden md:block">
          <h2 className="text-sm font-semibold text-white mb-2">Posições abertas</h2>
          <PositionsList
            positions={positions ?? []}
            isLoading={isLoadingPositions}
            isError={isErrorPositions}
            onRetry={() => void refetchPositions()}
          />
        </div>
        {userPlan === PLAN_TYPE.LENDA && (
          <div className="hidden md:block">
            <h2 className="text-sm font-semibold text-white mb-2">Shorts abertos</h2>
            <ShortsList
              positions={positions ?? []}
              isLoading={isLoadingPositions}
              isError={isErrorPositions}
              onRetry={() => void refetchPositions()}
              userPlan={userPlan}
            />
          </div>
        )}
      </main>
    </AppLayout>
  )
}
