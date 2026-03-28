import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasPlan } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, created, list, errors, parsePagination, buildPagination } from '@/lib/api'
import type { LeagueType, LeagueStatus, LeagueDivision } from '@/types'

const CreateLeagueSchema = z.object({
  name: z.string().min(2).max(60),
  type: z.enum(['AMIGOS', 'PRO']),
  duration: z.number().int().min(7),
})

function serializeLeague(l: {
  id: string; name: string; type: string; division: string
  duration: number; sponsorId: string | null; startsAt: Date
  endsAt: Date | null; status: string; createdAt: Date
}) {
  return {
    id: l.id,
    name: l.name,
    type: l.type as LeagueType,
    division: l.division as LeagueDivision,
    duration: l.duration,
    sponsorId: l.sponsorId ?? null,
    startsAt: l.startsAt.toISOString(),
    endsAt: l.endsAt?.toISOString() ?? null,
    status: l.status as LeagueStatus,
    createdAt: l.createdAt.toISOString(),
  }
}

// GET /api/v1/leagues
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { searchParams } = request.nextUrl
  const type = searchParams.get('type') as LeagueType | null
  const status = searchParams.get('status') as LeagueStatus | null
  const { page, limit, skip } = parsePagination(searchParams)

  try {
    const where = {
      ...(type && { type }),
      ...(status && { status }),
    }

    const [leagues, total] = await Promise.all([
      prisma.league.findMany({
        where,
        orderBy: { startsAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.league.count({ where }),
    ])

    return list(leagues.map(serializeLeague), buildPagination(page, limit, total))
  } catch {
    return errors.server()
  }
}

// POST /api/v1/leagues — CRAQUE+ para AMIGOS; LENDA para PRO
export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const body = await request.json()
    const parsed = CreateLeagueSchema.safeParse(body)

    if (!parsed.success) return errors.validation()

    const { type, duration, name } = parsed.data

    const requiredPlan = type === 'PRO' ? 'LENDA' : 'CRAQUE'
    if (!hasPlan(auth.user.planType, requiredPlan)) {
      return errors.forbidden(
        `Criar liga ${type} requer plano ${requiredPlan}.`,
        requiredPlan
      )
    }

    const startsAt = new Date()
    const endsAt = new Date(startsAt.getTime() + duration * 24 * 60 * 60 * 1000)

    const league = await prisma.league.create({
      data: {
        name,
        type,
        division: type === 'PRO' ? 'OURO' : 'ABERTA',
        duration,
        startsAt,
        endsAt,
        status: 'PENDING',
      },
    })

    return created(serializeLeague(league))
  } catch {
    return errors.server()
  }
}
