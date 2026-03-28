import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { LeagueType, LeagueStatus, LeagueDivision } from '@/types'

// GET /api/v1/leagues/:id
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { id } = await params

  try {
    const league = await prisma.league.findUnique({ where: { id } })

    if (!league) return errors.notFound('Liga não encontrada.')

    return ok({
      id: league.id,
      name: league.name,
      type: league.type as LeagueType,
      division: league.division as LeagueDivision,
      duration: league.duration,
      sponsorId: league.sponsorId ?? null,
      startsAt: league.startsAt.toISOString(),
      endsAt: league.endsAt?.toISOString() ?? null,
      status: league.status as LeagueStatus,
      createdAt: league.createdAt.toISOString(),
    })
  } catch {
    return errors.server()
  }
}
