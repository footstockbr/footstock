'use client'

import useSWR from 'swr'

export type PlanTier = 'JOGADOR' | 'CRAQUE' | 'LENDA'

interface MeResponse {
  data: { planType: PlanTier }
}

interface PlanGuardResult {
  plan: PlanTier
  isLoading: boolean
  /** Retorna true se o plano do usuário for >= ao tier exigido */
  hasAccess: (requiredTier: PlanTier) => boolean
}

const TIER_ORDER: Record<PlanTier, number> = {
  JOGADOR: 0,
  CRAQUE: 1,
  LENDA: 2,
}

async function fetchMe(): Promise<PlanTier> {
  const res = await fetch('/api/v1/users/me')
  if (!res.ok) return 'JOGADOR'
  const json = (await res.json()) as MeResponse
  return (json.data?.planType ?? 'JOGADOR') as PlanTier
}

export function usePlanGuard(): PlanGuardResult {
  const { data: plan, isLoading } = useSWR<PlanTier>('plan-guard', fetchMe, {
    // task-005: a janela antiga (60s, sem revalidacao no foco) deixava os cards de
    // /planos com o tier velho apos um pagamento. Revalidar ao focar a aba (retorno
    // do gateway) e encurtar o dedupe fecha essa janela de staleness.
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  })

  const resolvedPlan = plan ?? 'JOGADOR'

  return {
    plan: resolvedPlan,
    isLoading,
    hasAccess: (requiredTier: PlanTier) =>
      TIER_ORDER[resolvedPlan] >= TIER_ORDER[requiredTier],
  }
}
