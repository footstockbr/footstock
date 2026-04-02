// module-20: GET /api/v1/leagues/:id/ranking

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth/server'
import { error as apiError, errors } from '@/lib/api'
import { leagueRepository } from '@/lib/repositories/LeagueRepository'
import { LeagueError, LEAGUE_ERRORS } from '@/lib/errors/leagueErrors'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const { id } = await params
    const league = await prisma.league.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!league) {
      return apiError(LEAGUE_ERRORS.NOT_FOUND.code, LEAGUE_ERRORS.NOT_FOUND.message, 404)
    }

    const ranking = await leagueRepository.getRanking(id, auth.user.id)

    return NextResponse.json(
      { data: ranking },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=60',
        },
      }
    )
  } catch (err) {
    if (err instanceof LeagueError) {
      return apiError(err.code, err.message, err.status)
    }
    console.error('[leagues/:id/ranking GET] Erro:', err)
    return errors.server()
  }
}
