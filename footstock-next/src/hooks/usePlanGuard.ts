'use client'

/**
 * Stub plan guard — returns the user's plan tier.
 * Replace with real useSession integration when module-3 is implemented.
 *
 * Plan tiers: JOGADOR (free) < CRAQUE < LENDA
 */

export type PlanTier = 'JOGADOR' | 'CRAQUE' | 'LENDA'

interface PlanGuardResult {
  plan: PlanTier
  isLoading: boolean
  /** Check if user has at least the given tier */
  hasAccess: (requiredTier: PlanTier) => boolean
}

const TIER_ORDER: Record<PlanTier, number> = {
  JOGADOR: 0,
  CRAQUE: 1,
  LENDA: 2,
}

export function usePlanGuard(): PlanGuardResult {
  // TODO: Replace with real useSession from module-3
  const plan: PlanTier = 'JOGADOR'
  const isLoading = false

  return {
    plan,
    isLoading,
    hasAccess: (requiredTier: PlanTier) =>
      TIER_ORDER[plan] >= TIER_ORDER[requiredTier],
  }
}
