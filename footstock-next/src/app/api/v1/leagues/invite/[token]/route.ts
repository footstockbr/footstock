// module-20: POST /api/v1/leagues/invite/:token — aceitar convite

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { error as apiError, errors } from '@/lib/api'
import { leagueRepository } from '@/lib/repositories/LeagueRepository'
import { LeagueError, LEAGUE_ERRORS } from '@/lib/errors/leagueErrors'
import { notificationService } from '@/lib/services/NotificationService'
import { prisma } from '@/lib/prisma'
import { requireActiveSubscription } from '@/lib/middleware/requireActiveSubscription'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'
import type { UserPlan } from '@/lib/analytics'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  // Aceitação de convites bloqueada em CANCELLATION_LOCK
  const lockGuard = await requireActiveSubscription(auth.user.id, 'JOIN_LEAGUE')
  if (lockGuard) return lockGuard

  try {
    const { token } = await params
    const payload = await leagueRepository.validateInviteToken(token)

    if (!payload) {
      return apiError(
        LEAGUE_ERRORS.NOT_FOUND.code,
        'Liga não encontrada ou convite inválido.',
        404
      )
    }

    const { leagueId } = payload
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, name: true, status: true, createdBy: true, type: true },
    })

    if (!league) {
      return apiError(LEAGUE_ERRORS.NOT_FOUND.code, LEAGUE_ERRORS.NOT_FOUND.message, 404)
    }

    if (league.status === 'FINISHED') {
      return apiError(LEAGUE_ERRORS.LEAGUE_FINISHED.code, LEAGUE_ERRORS.LEAGUE_FINISHED.message, 422)
    }

    await leagueRepository.addMember(leagueId, auth.user.id)

    // EVT-027: league_joined — rastreia entrada em liga via convite
    mixpanelServer.trackLeagueJoined(auth.user.id, {
      league_type: league.type as 'PUBLIC' | 'FRIENDS' | 'PRO',
      via_invite_link: true,
      plan: (auth.user.planType ?? 'JOGADOR') as UserPlan,
    })

    // Notificar o criador que um amigo entrou
    if (league.createdBy && league.createdBy !== auth.user.id) {
      await notificationService.sendNotification({
        userId: league.createdBy,
        type: 'LEAGUE_RESULT',
        title: `${auth.user.name} entrou na sua liga!`,
        body: `${auth.user.name} entrou na liga "${league.name}".`,
        metadata: {
          type: 'MEMBER_JOINED',
          leagueId,
          leagueName: league.name,
          newMemberName: auth.user.name,
        },
      })
    }

    return NextResponse.json(
      { data: { success: true, leagueId } },
      { status: 201 }
    )
  } catch (err) {
    if (err instanceof LeagueError) {
      return apiError(err.code, err.message, err.status)
    }
    console.error('[leagues/invite/:token POST] Erro:', err)
    return errors.server()
  }
}
