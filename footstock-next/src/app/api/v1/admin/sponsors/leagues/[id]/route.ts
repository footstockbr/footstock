import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors, error as apiError } from '@/lib/api'
import { updateSponsoredLeagueSchema } from '@/lib/validators/sponsoredLeague.schema'
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
    ageVerificationPending: false,
    adminRole: adminRole as AdminRole,
    version: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  return { user: dummyUser, userId: 'dev-user' }
}

interface LeagueParams {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, { params }: LeagueParams) {
  const { id } = await params
  const auth = await getAuthUser() || getDevAuth(request)
  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'EDITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-052', message: 'Permissao insuficiente.' } },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const parsed = updateSponsoredLeagueSchema.safeParse(body)

    if (!parsed.success) {
      return apiError(
        'VALIDATION_ERROR',
        'Dados invalidos',
        400,
        { details: JSON.stringify(parsed.error.flatten().fieldErrors) } as never
      )
    }

    const updateData: Record<string, unknown> = {}
    const data = parsed.data
    if (data.name !== undefined) updateData.name = data.name
    if (data.company !== undefined) updateData.company = data.company
    if (data.prize !== undefined) updateData.prize = data.prize
    if (data.prizes !== undefined) updateData.prizes = data.prizes
    if (data.sponsorUrl !== undefined) updateData.sponsorUrl = data.sponsorUrl || null
    if (data.maxParticipants !== undefined) updateData.maxParticipants = data.maxParticipants
    if (data.minPlan !== undefined) updateData.minPlan = data.minPlan
    if (data.status !== undefined) updateData.status = data.status
    if (data.borderColor !== undefined) updateData.borderColor = data.borderColor
    if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate)
    if (data.endDate !== undefined) updateData.endDate = new Date(data.endDate)

    const league = await prisma.sponsoredLeague.update({
      where: { id },
      data: updateData,
    })

    return ok(league)
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'SPONSOR-002', message: 'Liga nao encontrada' } },
        { status: 404 }
      )
    }
    console.error('[sponsors] Error:', error)
    return errors.server()
  }
}

export async function DELETE(request: NextRequest, { params }: LeagueParams) {
  const { id } = await params
  const auth = await getAuthUser() || getDevAuth(request)
  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'SUPER_ADMIN')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-052', message: 'Apenas super admin pode deletar.' } },
      { status: 403 }
    )
  }

  try {
    await prisma.sponsoredLeague.delete({
      where: { id },
    })
    return ok({ message: 'Liga deletada com sucesso' })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'SPONSOR-002', message: 'Liga nao encontrada' } },
        { status: 404 }
      )
    }
    console.error('[sponsors] Error:', error)
    return errors.server()
  }
}
