import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors } from '@/lib/api'
import { NextResponse } from 'next/server'

// POST /api/v1/leagues/:id/join
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { id } = await params

  try {
    const league = await prisma.league.findUnique({ where: { id } })

    if (!league || league.status === 'FINISHED') {
      return errors.notFound('Liga não encontrada ou encerrada.')
    }

    // Verificar se já é membro
    const existing = await prisma.leagueMember.findUnique({
      where: { leagueId_userId: { leagueId: id, userId: auth.user.id } },
    })

    if (existing) {
      return errors.conflict('LEAGUE_002', 'Você já é membro desta liga.')
    }

    const member = await prisma.leagueMember.create({
      data: {
        leagueId: id,
        userId: auth.user.id,
        score: 0,
        rank: 0,
      },
    })

    return NextResponse.json(
      {
        data: {
          id: member.id,
          leagueId: member.leagueId,
          userId: member.userId,
          score: member.score.toNumber(),
          rank: member.rank,
          scoreBreakdown: member.scoreBreakdown ?? null,
          updatedAt: member.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    )
  } catch {
    return errors.server()
  }
}
