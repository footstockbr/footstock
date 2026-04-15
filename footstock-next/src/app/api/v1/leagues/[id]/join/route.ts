// module-20: POST /api/v1/leagues/:id/join

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { error as apiError, errors } from '@/lib/api'
import { leagueRepository } from '@/lib/repositories/LeagueRepository'
import { LeagueError, LEAGUE_ERRORS } from '@/lib/errors/leagueErrors'
import { prisma } from '@/lib/prisma'
import { requireActiveSubscription } from '@/lib/middleware/requireActiveSubscription'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'
import type { UserPlan } from '@/lib/analytics'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  // Inscrição em novas ligas bloqueada em CANCELLATION_LOCK
  const lockGuard = await requireActiveSubscription(auth.user.id, 'JOIN_LEAGUE')
  if (lockGuard) return lockGuard

  try {
    const { id } = await params
    const league = await prisma.league.findUnique({ where: { id } })

    if (!league) {
      return apiError(LEAGUE_ERRORS.NOT_FOUND.code, LEAGUE_ERRORS.NOT_FOUND.message, 404)
    }

    if (league.status === 'FINISHED') {
      return apiError(LEAGUE_ERRORS.LEAGUE_FINISHED.code, LEAGUE_ERRORS.LEAGUE_FINISHED.message, 422)
    }

    // Ligas AMIGOS só por convite (join direto bloqueado)
    if (league.type === 'AMIGOS') {
      return apiError(
        LEAGUE_ERRORS.PRIVATE_INVITE_REQUIRED.code,
        LEAGUE_ERRORS.PRIVATE_INVITE_REQUIRED.message,
        403
      )
    }

    // Ligas PRO são abertas para todos os planos (sem restrição de plano na entrada)

    await leagueRepository.addMember(id, auth.user.id)

    // EVT-027: league_joined — rastreia entrada em liga (join direto, sem convite)
    mixpanelServer.trackLeagueJoined(auth.user.id, {
      league_type: league.type as 'PUBLIC' | 'FRIENDS' | 'PRO',
      via_invite_link: false,
      plan: (auth.user.planType ?? 'JOGADOR') as UserPlan,
    })

    return NextResponse.json({ data: { success: true, leagueId: id } }, { status: 201 })
  } catch (err) {
    if (err instanceof LeagueError) {
      return apiError(err.code, err.message, err.status)
    }
    console.error('[leagues/:id/join POST] Erro:', err)
    return errors.server()
  }
}
