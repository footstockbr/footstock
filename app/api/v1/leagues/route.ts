// module-20: GET + POST /api/v1/leagues

import { NextRequest } from 'next/server'
import { getAuthUser, hasPlan } from '@/lib/auth/server'
import { ok, created, list, error as apiError, errors } from '@/lib/api'
import { parsePagination, buildPagination } from '@/lib/api'
import { leagueRepository } from '@/lib/repositories/LeagueRepository'
import { LeagueError, LEAGUE_ERRORS } from '@/lib/errors/leagueErrors'
import { createLeagueSchema } from '@/lib/validators/league.schema'

// GET /api/v1/leagues
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { searchParams } = request.nextUrl
  const type = searchParams.get('type') ?? undefined
  const status = searchParams.get('status') ?? undefined
  const userId = searchParams.get('userId')
  const { page, limit } = parsePagination(searchParams)

  try {
    // Minhas ligas
    if (userId === 'me') {
      const myLeagues = await leagueRepository.findByUserId(auth.user.id)
      return ok(myLeagues)
    }

    const { data, total } = await leagueRepository.findAll({ type, status, page, limit })
    return list(data, buildPagination(page, limit, total))
  } catch {
    return errors.server()
  }
}

// POST /api/v1/leagues
export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const body = await request.json()
    const parsed = createLeagueSchema.safeParse(body)

    if (!parsed.success) {
      return apiError(
        'VALIDATION_ERROR',
        'Dados inválidos',
        400,
        { details: JSON.stringify(parsed.error.flatten().fieldErrors) } as never
      )
    }

    const { type, duration, division, name, emblemUrl, sponsorId } = parsed.data

    // planGuard server-side — CRÍTICO: nunca confiar no cliente
    if (type === 'AMIGOS' && !hasPlan(auth.user.planType, 'CRAQUE')) {
      return apiError(
        LEAGUE_ERRORS.PLAN_RESTRICTION.code,
        LEAGUE_ERRORS.PLAN_RESTRICTION.message,
        LEAGUE_ERRORS.PLAN_RESTRICTION.status
      )
    }

    if (type === 'PRO' && !hasPlan(auth.user.planType, 'LENDA')) {
      return apiError(
        LEAGUE_ERRORS.PLAN_RESTRICTION.code,
        'Criação de ligas PRO disponível apenas para o plano Lenda.',
        LEAGUE_ERRORS.PLAN_RESTRICTION.status
      )
    }

    const league = await leagueRepository.create({
      name,
      type,
      duration,
      division,
      emblemUrl,
      sponsorId,
      createdBy: auth.user.id,
    })

    // Adicionar criador como primeiro membro
    await leagueRepository.addMember(league.id, auth.user.id)

    return created(league)
  } catch (err) {
    if (err instanceof LeagueError) {
      return apiError(err.code, err.message, err.status)
    }
    console.error('[leagues POST] Erro inesperado:', err)
    return errors.server()
  }
}
