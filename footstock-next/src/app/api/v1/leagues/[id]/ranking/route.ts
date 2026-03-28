import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { list, errors, parsePagination, buildPagination } from '@/lib/api'

// GET /api/v1/leagues/:id/ranking
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { id } = await params
  const { page, limit, skip } = parsePagination(request.nextUrl.searchParams)

  try {
    const league = await prisma.league.findUnique({ where: { id } })
    if (!league) return errors.notFound('Liga não encontrada.')

    const where = { leagueId: id }

    const [members, total] = await Promise.all([
      prisma.leagueMember.findMany({
        where,
        orderBy: { score: 'desc' },
        skip,
        take: limit,
      }),
      prisma.leagueMember.count({ where }),
    ])

    const serialized = members.map((m) => ({
      id: m.id,
      leagueId: m.leagueId,
      userId: m.userId,
      score: m.score.toNumber(),
      rank: m.rank,
      scoreBreakdown: m.scoreBreakdown as {
        rentabilidade?: number
        sofisticacao?: number
        diversificacao?: number
        consistencia?: number
        educativo?: number
      } | null,
      updatedAt: m.updatedAt.toISOString(),
    }))

    return list(serialized, buildPagination(page, limit, total))
  } catch {
    return errors.server()
  }
}
