// module-20: /api/v1/leagues/:id/invite — gerar e revogar token de convite (criador apenas)

import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { ok, error as apiError, errors } from '@/lib/api'
import { leagueRepository } from '@/lib/repositories/LeagueRepository'
import { LeagueError, LEAGUE_ERRORS } from '@/lib/errors/leagueErrors'
import { prisma } from '@/lib/prisma'

async function getCreatorLeague(id: string, userId: string) {
  return prisma.league.findUnique({
    where: { id },
    select: { id: true, type: true, slug: true, createdBy: true },
  }).then((league) => {
    if (!league) return { error: 'NOT_FOUND' as const }
    if (league.type !== 'AMIGOS') return { error: 'NOT_AMIGOS' as const }
    if (league.createdBy !== userId) return { error: 'NOT_CREATOR' as const }
    return { league }
  })
}

// POST — gerar/regenerar link de convite (invalida token anterior)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const { id } = await params
    const result = await getCreatorLeague(id, auth.user.id)

    if ('error' in result) {
      if (result.error === 'NOT_FOUND') return apiError(LEAGUE_ERRORS.NOT_FOUND.code, LEAGUE_ERRORS.NOT_FOUND.message, 404)
      if (result.error === 'NOT_AMIGOS') return apiError(LEAGUE_ERRORS.INVITE_ONLY_AMIGOS.code, LEAGUE_ERRORS.INVITE_ONLY_AMIGOS.message, 400)
      return apiError('LEAGUE_NOT_CREATOR', 'Apenas o criador da liga pode gerar o link de convite.', 403)
    }

    const { league } = result
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

// DELETE — revogar link de convite (tokens anteriores ficam inválidos)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const { id } = await params
    const result = await getCreatorLeague(id, auth.user.id)

    if ('error' in result) {
      if (result.error === 'NOT_FOUND') return apiError(LEAGUE_ERRORS.NOT_FOUND.code, LEAGUE_ERRORS.NOT_FOUND.message, 404)
      if (result.error === 'NOT_AMIGOS') return apiError(LEAGUE_ERRORS.INVITE_ONLY_AMIGOS.code, LEAGUE_ERRORS.INVITE_ONLY_AMIGOS.message, 400)
      return apiError('LEAGUE_NOT_CREATOR', 'Apenas o criador da liga pode revogar o link de convite.', 403)
    }

    await leagueRepository.revokeInviteToken(id)
    return ok({ revoked: true })
  } catch (err) {
    if (err instanceof LeagueError) {
      return apiError(err.code, err.message, err.status)
    }
    console.error('[leagues/:id/invite DELETE] Erro:', err)
    return errors.server()
  }
}
