// module-20: GET /api/v1/leagues/:id

import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { ok, error as apiError, errors } from '@/lib/api'
import { leagueRepository } from '@/lib/repositories/LeagueRepository'
import { LeagueError, LEAGUE_ERRORS } from '@/lib/errors/leagueErrors'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const { id } = await params
    const league = await leagueRepository.findById(id, auth.user.id)

    if (!league) {
      return apiError(LEAGUE_ERRORS.NOT_FOUND.code, LEAGUE_ERRORS.NOT_FOUND.message, 404)
    }

    return ok(league)
  } catch (err) {
    if (err instanceof LeagueError) {
      return apiError(err.code, err.message, err.status)
    }
    console.error('[leagues/:id GET] Erro:', err)
    return errors.server()
  }
}
