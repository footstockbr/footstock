'use client'
// ============================================================================
// Foot Stock — PositionsList (module-15, TASK-3/ST002)
// Lista de posições longas ordenadas por valor, com EmptyState e navegação.
// Rastreabilidade: INT-034
// ============================================================================

import { useRouter } from 'next/navigation'
import { useMemo, useCallback } from 'react'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Btn } from '@/components/ui/Btn'
import { PositionCard } from './PositionCard'
import { POSITION_VARIANT } from '@/lib/enums'
import type { PositionWithPnL } from '@/types/portfolio'

interface PositionsListProps {
  positions: PositionWithPnL[]
  isLoading: boolean
  isError?: boolean
  onRetry?: () => void
}

export function PositionsList({ positions, isLoading, isError, onRetry }: PositionsListProps) {
  const router = useRouter()

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="min-h-[64px] w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <ErrorState message="Erro ao carregar posições" onRetry={onRetry} />
    )
  }

  // RESOLVED: T005 – sort/filter sem useMemo executado a cada render
  const regular = useMemo(
    () =>
      positions
        .filter((p) => !p.isShort)
        .sort((a, b) => b.qty * b.currentPrice - a.qty * a.currentPrice),
    [positions]
  )

  // RESOLVED: T005 – handlers inline no map → useCallback estabilizados
  const handleBuyMore = useCallback(
    (ticker: string) => router.push(`/mercado?ticker=${ticker}&action=buy`),
    [router]
  )
  const handleSell = useCallback(
    (ticker: string) => router.push(`/mercado?ticker=${ticker}&action=sell`),
    [router]
  )

  if (regular.length === 0) {
    return (
      <EmptyState
        title="Carteira vazia"
        description="Acesse o Mercado para comprar suas primeiras ações."
      >
        <Btn onClick={() => router.push('/mercado')}>Ir ao Mercado</Btn>
      </EmptyState>
    )
  }

  return (
    <ul
      role="list"
      aria-label={`Posições abertas — ${regular.length} posições`}
      className="space-y-2"
    >
      {regular.map((p) => (
        <li key={p.ticker}>
          <PositionCard
            position={p}
            variant={POSITION_VARIANT.REGULAR}
            onBuyMore={() => handleBuyMore(p.ticker)}
            onSell={() => handleSell(p.ticker)}
          />
        </li>
      ))}
    </ul>
  )
}
