// ============================================================================
// FootStock — GET /api/v1/users/me/trophies
// Troféus virtuais conquistados pelo usuário em ligas PRO encerradas.
// Troféus são puramente cosméticos — sem valor monetário.
// Fonte: T-017
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'

async function getHandler(_req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const trophies = await prisma.leagueTrophy.findMany({
    where: { userId: user.id },
    orderBy: { awardedAt: 'desc' },
    include: {
      league: {
        select: {
          id:       true,
          name:     true,
          startsAt: true,
          endsAt:   true,
        },
      },
    },
  })

  const data = trophies.map((t) => ({
    id:         t.id,
    trophyType: t.trophyType,
    position:   t.position,
    awardedAt:  t.awardedAt.toISOString(),
    league: {
      id:       t.league.id,
      name:     t.league.name,
      startsAt: t.league.startsAt.toISOString(),
      endsAt:   t.league.endsAt?.toISOString() ?? null,
    },
  }))

  return NextResponse.json({ success: true, data })
}

export const GET = withAuth(getHandler)
