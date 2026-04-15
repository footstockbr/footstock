// GET /api/v1/sponsored-leagues/:id — detalhe de liga patrocinada + ranking

import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { ok, errors } from '@/lib/api'
import { error as apiError } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const { id } = await params
    const league = await prisma.sponsoredLeague.findUnique({
      where: { id },
      include: {
        members: {
          orderBy: { score: 'desc' },
          take: 100,
        },
        _count: { select: { members: true } },
      },
    })

    if (!league) {
      return apiError('SPONSORED-001', 'Liga patrocinada nao encontrada', 404)
    }

    // Nao expor userId completo — retornar apenas rank + score + se e o usuario logado
    const isMember = league.members.some(m => m.userId === auth.user.id)
    const ranking = league.members.map((m, i) => ({
      rank: i + 1,
      score: m.score,
      joinedAt: m.joinedAt,
      isCurrentUser: m.userId === auth.user.id,
    }))

    return ok({
      id: league.id,
      name: league.name,
      company: league.company,
      prize: league.prize,
      prizes: league.prizes,
      sponsorUrl: league.sponsorUrl,
      participants: league._count.members,
      maxParticipants: league.maxParticipants,
      minPlan: league.minPlan,
      status: league.status,
      borderColor: league.borderColor,
      startDate: league.startDate,
      endDate: league.endDate,
      isMember,
      ranking,
    })
  } catch (err) {
    console.error('[sponsored-leagues/:id] Error:', err)
    return errors.server()
  }
}
