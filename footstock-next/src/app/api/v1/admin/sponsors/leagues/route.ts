import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors, error as apiError } from '@/lib/api'
import { createSponsoredLeagueSchema } from '@/lib/validators/sponsoredLeague.schema'
import type { User, AdminRole } from '@/types'

function getDevAuth(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') return null
  const adminRole = request.cookies.get('fs-admin-role')?.value
  const validRoles = ['SUPER_ADMIN', 'ADMIN', 'MONITOR', 'EDITOR', 'MODERADOR']
  if (!adminRole || !validRoles.includes(adminRole)) return null
  const dummyUser: User = {
    id: 'dev-user',
    email: 'dev@foot-stock.test',
    name: 'Dev User',
    phone: null,
    birthDate: '',
    favoriteClub: '',
    favoriteClubDisplayName: null,
    userType: 'NORMAL',
    investorProfile: 'INICIANTE',
    planType: 'JOGADOR',
    fsBalance: 0,
    marginBlocked: 0,
    tourCompleted: false,
    adminRole: adminRole as AdminRole,
    version: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  return { user: dummyUser, userId: 'dev-user' }
}

export async function GET(request: NextRequest) {
  const auth = await getAuthUser() || getDevAuth(request)
  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'EDITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-052', message: 'Permissao insuficiente.' } },
      { status: 403 }
    )
  }

  try {
    const leagues = await prisma.sponsoredLeague.findMany({
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { members: true } } },
    })
    const enriched = leagues.map(l => ({
      ...l,
      participants: l._count.members,
    }))
    return ok(enriched)
  } catch (error) {
    console.error('[sponsors] Error:', error)
    return errors.server()
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser() || getDevAuth(request)
  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'EDITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-052', message: 'Permissao insuficiente.' } },
      { status: 403 }
    )
  }

  // Item 22: criacao de ligas patrocinadas DESCONTINUADA (fusao Pro/Patrocinadas em League
  // type=PRO). O modelo SponsoredLeague fica apenas para leitura/rollback das ligas ja migradas.
  // Crie ligas PRO patrocinadas via /admin/ligas-pro. Reativavel via env em emergencia.
  if (process.env.SPONSORED_LEAGUE_CREATION_ENABLED !== 'true') {
    return NextResponse.json(
      {
        error: {
          code: 'SPONSORED-410',
          message: 'Criacao de ligas patrocinadas descontinuada. Use Ligas PRO via /admin/ligas-pro.',
        },
      },
      { status: 410 }
    )
  }

  try {
    const body = await request.json()
    const parsed = createSponsoredLeagueSchema.safeParse(body)

    if (!parsed.success) {
      return apiError(
        'VALIDATION_ERROR',
        'Dados invalidos',
        400,
        { details: JSON.stringify(parsed.error.flatten().fieldErrors) } as never
      )
    }

    const { name, company, sponsorUrl, prizes, prize, maxParticipants, minPlan, status, borderColor, startDate, endDate } = parsed.data

    // Gerar prize resumo a partir do prizes array se nao fornecido
    const prizeSummary = prize || (prizes.length > 0 ? prizes[0]?.description ?? 'FS$0' : 'FS$0')

    const league = await prisma.sponsoredLeague.create({
      data: {
        name,
        company,
        prize: prizeSummary,
        prizes: prizes,
        sponsorUrl: sponsorUrl || null,
        participants: 0,
        maxParticipants,
        minPlan,
        status,
        borderColor,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
    })

    return ok(league, 201)
  } catch (error) {
    console.error('[sponsors] Error:', error)
    return errors.server()
  }
}
