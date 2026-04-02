'use client'
// ============================================================================
// Foot Stock — ShortsList (module-15, TASK-3/ST003)
// Lista de shorts visível APENAS para plano Lenda.
// Gate de plano: JOGADOR/CRAQUE → CTA Upgrade.
// Rastreabilidade: INT-035
// ============================================================================

import { useRouter } from 'next/navigation'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Btn } from '@/components/ui/Btn'
import { PlanIcon } from '@/components/ui/PlanIcon'
import { InfoIcon } from '@/components/ui/InfoIcon'
import { FIELD_TERM_MAP } from '@/lib/data/glossary'
import { PositionCard } from './PositionCard'
import { checkPlanAccess } from '@/lib/utils/planGuard'
import { POSITION_VARIANT, PLAN_TYPE } from '@/lib/enums'
import type { PlanType } from '@/lib/enums'
import type { PositionWithPnL } from '@/types/portfolio'

interface ShortsListProps {
  positions: PositionWithPnL[]
  isLoading: boolean
  isError?: boolean
  onRetry?: () => void
  userPlan: PlanType
}

export function ShortsList({ positions, isLoading, isError, onRetry, userPlan }: ShortsListProps) {
  const router = useRouter()

  // Gate PRIMEIRO — antes de qualquer outra renderização
  if (!checkPlanAccess({ planType: userPlan }, PLAN_TYPE.LENDA)) {
    return (
      <EmptyState
        title="Vendas a Descoberto"
        description="Shorts são exclusivos do plano Lenda."
        icon={<PlanIcon plan="LENDA" />}
        aria-label="Shorts disponíveis apenas para plano Lenda"
      >
        <Btn onClick={() => router.push('/planos')}>Fazer Upgrade para Lenda</Btn>
      </EmptyState>
    )
  }

  if (isError) {
    return <ErrorState message="Erro ao carregar posições short." onRetry={onRetry} />
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="min-h-[64px] w-full rounded-xl" />
        ))}
      </div>
    )
  }

  const shorts = positions.filter((p) => p.isShort)

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">
        <span className="inline-flex items-center gap-1 flex-wrap">
          <span>Shorts</span> <InfoIcon glossarySlug={FIELD_TERM_MAP['short']} />
          <span> têm </span>
          <span>margem</span> <InfoIcon glossarySlug={FIELD_TERM_MAP['margem']} />
          <span> bloqueada. Lenda não paga aluguel adicional.</span>
        </span>
      </p>

      {shorts.length === 0 ? (
        <EmptyState
          title="Sem posições short abertas"
          description="Abra sua primeira posição short no Mercado."
        />
      ) : (
        <ul
          role="list"
          aria-label={`Posições short abertas — ${shorts.length} posições`}
          className="space-y-2"
        >
          {shorts.map((p) => (
            <li key={p.ticker}>
              <PositionCard
                position={p}
                variant={POSITION_VARIANT.SHORT}
                onCloseShort={() =>
                  router.push(`/mercado?ticker=${p.ticker}&action=close-short`)
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
