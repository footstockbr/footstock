// ============================================================================
// GET /api/v1/orders/daily-count
// Retorna o contador de ordens do dia BRT e o limite do plano do usuário.
// Usado pelo OrderForm para pré-carregar ordersRemaining no mount.
// Rastreabilidade: T-020 / INT-019
// ============================================================================

import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { ok, errors } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { checkDailyOrderLimit } from '@/lib/middleware/checkDailyOrderLimit'
import type { PlanType } from '@/lib/enums'

export async function GET(_request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { planType: true, userType: true },
  })
  if (!user) return errors.unauthorized()

  // Staff nao tem limite diario (nao tradam) — retornar unlimited.
  if (!user.planType || user.userType === 'ADMIN' || user.userType === 'CLUB_PARTNER') {
    const res = ok({ limit: null, used: 0, remaining: null, resetAt: new Date().toISOString() })
    res.headers.set('X-DailyOrder-Limit', 'unlimited')
    res.headers.set('X-DailyOrder-Remaining', 'unlimited')
    res.headers.set('X-DailyOrder-Reset', new Date().toISOString())
    return res
  }

  // Usar MARKET como tipo de sonda (apenas para leitura do contador — não bloqueia)
  const { info } = await checkDailyOrderLimit(
    auth.user.id,
    user.planType as PlanType,
    'MARKET',
  )

  const res = ok({
    limit: info.limit,
    used: info.used,
    remaining: info.remaining,
    resetAt: info.resetAt,
  })

  res.headers.set('X-DailyOrder-Limit', info.limit !== null ? String(info.limit) : 'unlimited')
  res.headers.set('X-DailyOrder-Remaining', info.remaining !== null ? String(info.remaining) : 'unlimited')
  res.headers.set('X-DailyOrder-Reset', info.resetAt)

  return res
}
