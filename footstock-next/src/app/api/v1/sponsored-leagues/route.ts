// GET /api/v1/sponsored-leagues — lista ligas patrocinadas para usuarios

import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { ok, errors } from '@/lib/api'
import { prisma } from '@/lib/prisma'

// Status permitidos para consulta publica (AGENDADA e restrito ao admin)
const PUBLIC_STATUSES = new Set(['ATIVA', 'ENCERRADA'])

export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { searchParams } = request.nextUrl
  const rawStatus = searchParams.get('status') ?? 'ATIVA'
  const userId = searchParams.get('userId')

  try {
    // Minhas ligas patrocinadas
    if (userId === 'me') {
      const myMemberships = await prisma.sponsoredLeagueMember.findMany({
        where: { userId: auth.user.id },
        include: {
          sponsoredLeague: {
            include: { _count: { select: { members: true } } },
          },
        },
        orderBy: { joinedAt: 'desc' },
      })
      const result = myMemberships.map(m => ({
        ...m.sponsoredLeague,
        participants: m.sponsoredLeague._count.members,
        myScore: m.score,
        myRank: m.rank,
        isMember: true,
      }))
      return ok(result)
    }

    // Filtrar apenas status publicos (bloquear AGENDADA para usuarios comuns)
    const status = PUBLIC_STATUSES.has(rawStatus) ? rawStatus : 'ATIVA'

    const leagues = await prisma.sponsoredLeague.findMany({
      where: { status },
      orderBy: { startDate: 'desc' },
      take: 50,
      include: {
        _count: { select: { members: true } },
        members: {
          where: { userId: auth.user.id },
          select: { id: true },
        },
      },
    })

    const result = leagues.map(l => ({
      id: l.id,
      name: l.name,
      company: l.company,
      prize: l.prize,
      prizes: l.prizes,
      sponsorUrl: l.sponsorUrl,
      participants: l._count.members,
      maxParticipants: l.maxParticipants,
      minPlan: l.minPlan,
      status: l.status,
      borderColor: l.borderColor,
      startDate: l.startDate,
      endDate: l.endDate,
      isMember: l.members.length > 0,
    }))

    return ok(result)
  } catch (err) {
    console.error('[sponsored-leagues] Error:', err)
    return errors.server()
  }
}
