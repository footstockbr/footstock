// module-20: POST /api/v1/leagues/:id/invite — gerar token de convite

import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { ok, error as apiError, errors } from '@/lib/api'
import { leagueRepository } from '@/lib/repositories/LeagueRepository'
import { LeagueError, LEAGUE_ERRORS } from '@/lib/errors/leagueErrors'
import { prisma } from '@/lib/prisma'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const { id } = await params
    const league = await prisma.league.findUnique({
      where: { id },
      select: { id: true, type: true, slug: true },
    })

    if (!league) {
      return apiError(LEAGUE_ERRORS.NOT_FOUND.code, LEAGUE_ERRORS.NOT_FOUND.message, 404)
    }

    // Apenas ligas AMIGOS têm link de convite
    if (league.type !== 'AMIGOS') {
      return apiError(
        LEAGUE_ERRORS.INVITE_ONLY_AMIGOS.code,
        LEAGUE_ERRORS.INVITE_ONLY_AMIGOS.message,
        400
      )
    }

    // Verificar que o usuário é membro
    const membership = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId: id, userId: auth.user.id } },
    })

    if (!membership) {
      return apiError(LEAGUE_ERRORS.NOT_MEMBER.code, LEAGUE_ERRORS.NOT_MEMBER.message, 403)
    }

    const token = await leagueRepository.generateInviteToken(id)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://footstock.app'
    const inviteUrl = `${baseUrl}/liga/${league.slug}/${id}?token=${token}`

    return ok({ inviteUrl })
  } catch (err) {
    if (err instanceof LeagueError) {
      return apiError(err.code, err.message, err.status)
    }
    console.error('[leagues/:id/invite POST] Erro:', err)
    return errors.server()
  }
}
