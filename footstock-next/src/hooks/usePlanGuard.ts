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
    revalidateOnFocus: false,
    dedupingInterval: 60_000, // revalida no máximo 1x/min
  })

  const resolvedPlan = plan ?? 'JOGADOR'

  return {
    plan: resolvedPlan,
    isLoading,
    hasAccess: (requiredTier: PlanTier) =>
      TIER_ORDER[resolvedPlan] >= TIER_ORDER[requiredTier],
  }
}
