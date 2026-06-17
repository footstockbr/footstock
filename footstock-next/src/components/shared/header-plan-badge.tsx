'use client'

import { usePlanGuard } from '@/hooks/usePlanGuard'
import { PlanBadge } from '@/components/shared/plan-badge'
import { PlanType } from '@/lib/constants/plans'

/**
 * Badge do plano do usuario no header (canto superior direito), alinhado ao
 * MarketSessionBadge / ticker de negociacao. Le o plano vivo via usePlanGuard.
 *
 * Em loading/erro NAO renderiza nada: usePlanGuard ja distingue isError de plano
 * confiavel (isReady), e renderizar null em ambos evita piscar um downgrade falso
 * (ex.: um usuario LENDA aparecer como JOGADOR durante uma falha transitoria).
 * Render null no servidor e no primeiro render do cliente tambem evita mismatch de
 * hidratacao — o badge so aparece quando ha plano resolvido.
 */
export function HeaderPlanBadge() {
  const { plan, isReady } = usePlanGuard()
  if (!isReady) return null
  return <PlanBadge plan={plan as PlanType} size="xs" />
}
