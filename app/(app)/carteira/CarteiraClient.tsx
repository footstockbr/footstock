'use client'
// ============================================================================
// Foot Stock — CarteiraClient (module-15, TASK-3/ST004 + ST005)
// Página /carteira com Tabs: Posições / Shorts / Extrato / Dividendos.
// ============================================================================

import { useState } from 'react'
import { AppLayout } from '@/components/layout'
import { Tabs } from '@/components/ui/Tabs'
import { ErrorState } from '@/components/ui/ErrorState'
import { PositionsList } from '@/components/portfolio/PositionsList'
import { ShortsList } from '@/components/portfolio/ShortsList'
import { TransactionsTabs } from '@/components/portfolio/TransactionsTabs'
import { usePositions, useInvalidateOnMarginCall } from '@/hooks/usePortfolio'
import { DividendHistory } from '@/components/portfolio/DividendHistory'
import { useSession } from '@/hooks/useSession'
import { PLAN_TYPE } from '@/lib/enums'
import type { PlanType } from '@/lib/enums'
import type { TabItem } from '@/components/ui/Tabs'

const CARTEIRA_TABS: TabItem[] = [
  { value: 'posicoes',   label: 'Posições' },
  { value: 'shorts',     label: 'Shorts' },
  { value: 'extrato',    label: 'Extrato' },
  { value: 'dividendos', label: 'Dividendos' },
]

export function CarteiraClient() {
  const [activeTab, setActiveTab] = useState('posicoes')

  const {
    data: positions,
    isLoading: isLoadingPositions,
    isError: isErrorPositions,
    refetch: refetchPositions,
  } = usePositions()

  const { user } = useSession()
  const userPlan: PlanType = user?.planType ?? PLAN_TYPE.JOGADOR

  // Reage a margin call via BroadcastChannel
  useInvalidateOnMarginCall()

  if (isErrorPositions) {
    return (
      <AppLayout>
        <main className="px-4 pt-4 pb-24">
          <ErrorState
            message="Erro ao carregar carteira."
            onRetry={() => void refetchPositions()}
          />
        </main>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <main className="px-4 pt-4 pb-24">
        <h1 className="text-lg font-bold text-white mb-4">Carteira</h1>

        <Tabs tabs={CARTEIRA_TABS} value={activeTab} onChange={setActiveTab} className="mb-4" aria-label="Seções da Carteira" />

        {activeTab === 'posicoes' && (
          <PositionsList
            positions={positions ?? []}
            isLoading={isLoadingPositions}
            isError={isErrorPositions}
            onRetry={() => void refetchPositions()}
          />
        )}

        {activeTab === 'shorts' && (
          <ShortsList
            positions={positions ?? []}
            isLoading={isLoadingPositions}
            userPlan={userPlan}
          />
        )}

        {activeTab === 'extrato' && (
          <TransactionsTabs />
        )}

        {activeTab === 'dividendos' && (
          <DividendHistory />
        )}
      </main>
    </AppLayout>
  )
}
