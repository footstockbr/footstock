// module-20: POST /api/v1/leagues/:id/join

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasPlan } from '@/lib/auth/server'
import { error as apiError, errors } from '@/lib/api'
import { leagueRepository } from '@/lib/repositories/LeagueRepository'
import { LeagueError, LEAGUE_ERRORS } from '@/lib/errors/leagueErrors'
import { prisma } from '@/lib/prisma'
import { LEAGUE_STATUS } from '@/lib/enums'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const { id } = await params
    const league = await prisma.league.findUnique({ where: { id } })

    if (!league) {
      return apiError(LEAGUE_ERRORS.NOT_FOUND.code, LEAGUE_ERRORS.NOT_FOUND.message, 404)
    }

    if (league.status === LEAGUE_STATUS.FINISHED) {
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

    // Ligas PRO requerem plano Lenda
    if (league.type === 'PRO' && !hasPlan(auth.user.planType, 'LENDA')) {
      return apiError(
        LEAGUE_ERRORS.PLAN_RESTRICTION.code,
        'Ligas PRO são exclusivas para o plano Lenda.',
        LEAGUE_ERRORS.PLAN_RESTRICTION.status
      )
    }

    await leagueRepository.addMember(id, auth.user.id)

    return NextResponse.json({ data: { success: true, leagueId: id } }, { status: 201 })
  } catch (err) {
    if (err instanceof LeagueError) {
      return apiError(err.code, err.message, err.status)
    }
    console.error('[leagues/:id/join POST] Erro:', err)
    return errors.server()
  }
}
