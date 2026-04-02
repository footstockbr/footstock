'use client'

import { useMemo } from 'react'
import { PLAN_HIERARCHY, PLAN_TYPE, type PlanType } from '@/lib/enums'
import { useCurrentUser } from '@/hooks/useCurrentUser'

export function usePlanGuard() {
  const { data: user } = useCurrentUser()
  const plan = (user?.planType ?? PLAN_TYPE.JOGADOR) as PlanType

  const hasAccess = useMemo(
    () => (requiredPlan: PlanType) => PLAN_HIERARCHY[plan] >= PLAN_HIERARCHY[requiredPlan],
    [plan]
  )

  return { plan, hasAccess }
}
