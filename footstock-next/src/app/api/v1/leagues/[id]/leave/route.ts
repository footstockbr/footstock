import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { ok, error as apiError, errors } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { LEAGUE_ERRORS } from '@/lib/errors/leagueErrors'

/** DELETE /api/v1/leagues/[id]/leave — Sair de uma liga */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { id } = await params
  const userId = auth.user.id

  try {
    const league = await prisma.league.findUnique({
      where: { id },
      select: { id: true, createdBy: true },
    })

    if (!league) {
      return apiError(LEAGUE_ERRORS.NOT_FOUND.code, LEAGUE_ERRORS.NOT_FOUND.message, 404)
    }

    if (league.createdBy === userId) {
      return apiError('LEAGUE_090', 'Criador não pode sair da liga. Delete a liga para encerrá-la.', 400)
    }

    // Verificar se é membro
    const membership = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId: id, userId } },
    })

    if (!membership) {
      return apiError(LEAGUE_ERRORS.NOT_MEMBER.code, LEAGUE_ERRORS.NOT_MEMBER.message, 400)
    }

    await prisma.leagueMember.delete({
      where: { leagueId_userId: { leagueId: id, userId } },
    })

    return ok({ success: true, message: 'Você saiu da liga com sucesso.' })
  } catch (err) {
    console.error('[League Leave]', err)
    return errors.server()
  }
}
