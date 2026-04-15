// module-20: GET + POST /api/v1/leagues

import { NextRequest } from 'next/server'
import { getAuthUser, hasPlan } from '@/lib/auth'
import { ok, created, list, error as apiError, errors } from '@/lib/api'
import { parsePagination, buildPagination } from '@/lib/api'
import { leagueRepository } from '@/lib/repositories/LeagueRepository'
import { LeagueError, LEAGUE_ERRORS } from '@/lib/errors/leagueErrors'
import { createLeagueSchema } from '@/lib/validators/league.schema'
import { requireActiveSubscription } from '@/lib/middleware/requireActiveSubscription'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'
import type { UserPlan } from '@/lib/analytics'

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

  // Criação de ligas bloqueada em CANCELLATION_LOCK
  const lockGuard = await requireActiveSubscription(auth.user.id, 'CREATE_LEAGUE')
  if (lockGuard) return lockGuard

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

    const { type, duration, division, name, emblemUrl, sponsorId, permiteAlavancagem } = parsed.data

    // planGuard server-side — CRÍTICO: nunca confiar no cliente
    if (type === 'AMIGOS' && !hasPlan(auth.user.planType, 'CRAQUE')) {
      return apiError(
        LEAGUE_ERRORS.PLAN_RESTRICTION.code,
        LEAGUE_ERRORS.PLAN_RESTRICTION.message,
        LEAGUE_ERRORS.PLAN_RESTRICTION.status
      )
    }

    // Ligas PRO são criadas exclusivamente por admins via /api/v1/admin/leagues
    if (type === 'PRO') {
      return apiError(
        'LEAGUE_ADMIN_ONLY',
        'Ligas PRO são criadas exclusivamente por administradores.',
        403
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
      // permiteAlavancagem só tem efeito em ligas PRO (ignorado em PUBLICA/AMIGOS)
      permiteAlavancagem: permiteAlavancagem ?? false,
    })

    // Adicionar criador como primeiro membro
    await leagueRepository.addMember(league.id, auth.user.id)

    // EVT-026: league_created — rastreia criacao de liga
    mixpanelServer.trackLeagueCreated(auth.user.id, {
      league_type: 'FRIENDS',
      duration: duration as 'week' | 'month' | 'season',
      plan: (auth.user.planType ?? 'JOGADOR') as UserPlan,
    })

    return created(league)
  } catch (err) {
    if (err instanceof LeagueError) {
      return apiError(err.code, err.message, err.status)
    }
    console.error('[leagues POST] Erro inesperado:', err)
    return errors.server()
  }
}
