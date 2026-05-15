import { NextResponse } from 'next/server'

import { auth } from '../../../../../../auth'
import { mintMotorToken, MOTOR_TOKEN_TTL_SECONDS } from '@/lib/auth/motor-token'
import { prisma } from '@/lib/prisma'
import type { PlanType } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const VALID_PLANS: ReadonlySet<PlanType> = new Set<PlanType>(['JOGADOR', 'CRAQUE', 'LENDA'])

/**
 * NXAUTH-04B — Token bridge Auth.js → motor SSE/JWT.
 * Cliente (useMarketTick / useAllMarketTicks) chama este endpoint, recebe JWT
 * HS256 assinado com JWT_SECRET (compartilhado com motor) e usa como ?token=
 * no EventSource para `${NEXT_PUBLIC_STREAM_URL}/market`.
 *
 * TTL = 5 min. Cliente faz refresh proativo a cada 4 min.
 */
export async function GET() {
  const session = await auth()
  const sessionUser = session?.user as
    | { id?: string; email?: string | null; planType?: PlanType }
    | undefined

  if (!sessionUser?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let planType: PlanType | undefined =
    sessionUser.planType && VALID_PLANS.has(sessionUser.planType) ? sessionUser.planType : undefined

  if (!planType) {
    const dbUser = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { planType: true },
    })
    if (!dbUser || !VALID_PLANS.has(dbUser.planType as PlanType)) {
      return NextResponse.json({ error: 'invalid_plan' }, { status: 403 })
    }
    planType = dbUser.planType as PlanType
  }

  const minted = await mintMotorToken({
    sub: sessionUser.id,
    email: sessionUser.email ?? undefined,
    planType,
  })

  return NextResponse.json(
    { token: minted.token, expiresAt: minted.expiresAt, ttlSeconds: MOTOR_TOKEN_TTL_SECONDS },
    {
      headers: {
        'cache-control': 'no-store',
      },
    },
  )
}
