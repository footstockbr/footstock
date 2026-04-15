// module-20: GET /api/v1/leagues/:id/my-score
// Retorna o score detalhado (breakdown por pilar) do usuário autenticado em uma liga.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { error as apiError, errors } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { leagueScoreService } from '@/lib/services/leagues/LeagueScoreService'
import { leagueRankingService } from '@/lib/services/leagues/LeagueRankingService'
import { LEAGUE_ERRORS } from '@/lib/errors/leagueErrors'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const userId = auth.user.id

  try {
    const { id: leagueId } = await params

    const membership = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
      select: { rank: true, score: true, scoreBreakdown: true, lastScoreAt: true },
    })

    if (!membership) {
      return apiError(LEAGUE_ERRORS.NOT_MEMBER.code, LEAGUE_ERRORS.NOT_MEMBER.message, 403)
    }
    const today = new Date().toISOString().slice(0, 10)
    const P2_EVENT_TYPES = ['LIMIT_ORDER_USED', 'OCO_ORDER_USED', 'SHORT_PROFITABLE_CLOSED', 'SCHEDULED_ORDER_USED', 'AI_ASSESSOR_CONSULTED']

    async function fetchP2Events() {
      const rows = await prisma.leagueScoreEvent.findMany({
        where: {
          leagueId,
          userId,
          eventType: { in: P2_EVENT_TYPES },
          OR: [{ period: today }, { period: { startsWith: today } }],
        },
        select: { eventType: true, points: true, period: true },
        orderBy: { createdAt: 'desc' },
      })
      return rows
    }

    // Retorna breakdown cacheado se calculado recentemente (< 1h)
    if (
      membership.scoreBreakdown &&
      membership.lastScoreAt &&
      Date.now() - membership.lastScoreAt.getTime() < 60 * 60 * 1000
    ) {
      const [history, p2Events] = await Promise.all([
        leagueRankingService.historicoPosicoes(leagueId, userId),
        fetchP2Events(),
      ])
      return NextResponse.json({
        data: {
          breakdown: membership.scoreBreakdown,
          scoreTotal: Number(membership.score),
          rank: membership.rank,
          lastScoreAt: membership.lastScoreAt.toISOString(),
          history,
          p2Events,
        },
      })
    }

    // Recalcula score se desatualizado
    const [breakdown, history, p2Events] = await Promise.all([
      leagueScoreService.calcularParaUsuario(leagueId, userId),
      leagueRankingService.historicoPosicoes(leagueId, userId),
      fetchP2Events(),
    ])

    const updated = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId, userId } },
      select: { rank: true, score: true, lastScoreAt: true },
    })

    return NextResponse.json({
      data: {
        breakdown,
        scoreTotal: updated ? Number(updated.score) : breakdown.total,
        rank: updated?.rank ?? membership.rank,
        lastScoreAt: updated?.lastScoreAt?.toISOString() ?? new Date().toISOString(),
        history,
        p2Events,
      },
    })
  } catch (err) {
    console.error('[leagues/:id/my-score GET] Erro:', err)
    return errors.server()
  }
}
