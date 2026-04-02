// ============================================================================
// Foot Stock — GET /api/v1/ai/analyze/rate-status
// Retorna status atual do rate limit sem incrementar o contador
// Usado pelo RateLimitBadge via polling (30s)
// Fonte: module-21/TASK-1/ST003 + TASK-3/ST001
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { aiRateLimiter } from '@/lib/redis/AIRateLimiter'
import { PLAN_TYPE } from '@/lib/enums'
import type { PlanType } from '@/lib/enums'

async function rateLimitStatusHandler(_req: NextRequest, { user }: AuthContext) {
  const userPlan = user.planType as PlanType

  if (userPlan === PLAN_TYPE.JOGADOR) {
    return NextResponse.json({ success: true, data: { allowed: false, remaining: 0, resetAt: 0 } })
  }

  const status = await aiRateLimiter.getStatus(user.id)
  return NextResponse.json({ success: true, data: status })
}

export const GET = withAuth(rateLimitStatusHandler)
