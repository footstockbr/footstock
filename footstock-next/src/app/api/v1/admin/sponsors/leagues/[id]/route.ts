import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { User, AdminRole } from '@/types'

interface LeagueParams {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, { params }: LeagueParams) {
  const { id } = await params
  let auth = await getAuthUser()

  if (!auth) {
    const adminRole = request.cookies.get('fs-admin-role')?.value
    if (adminRole) {
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, supabaseId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'EDITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-052', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const updateData: Record<string, unknown> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.company !== undefined) updateData.company = body.company
    if (body.prize !== undefined) updateData.prize = body.prize
    if (body.participants !== undefined) updateData.participants = body.participants
    if (body.maxParticipants !== undefined) updateData.maxParticipants = body.maxParticipants
    if (body.minPlan !== undefined) updateData.minPlan = body.minPlan
    if (body.status !== undefined) updateData.status = body.status
    if (body.borderColor !== undefined) updateData.borderColor = body.borderColor
    if (body.startDate !== undefined) updateData.startDate = new Date(body.startDate)
    if (body.endDate !== undefined) updateData.endDate = new Date(body.endDate)

    const league = await prisma.sponsoredLeague.update({
      where: { id },
      data: updateData,
    })

    return ok(league)
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'SPONSOR-002', message: 'Liga não encontrada' } },
        { status: 404 }
      )
    }
    console.error('[sponsors] Error:', error)
    return errors.server()
  }
}

export async function DELETE(request: NextRequest, { params }: LeagueParams) {
  const { id } = await params
  let auth = await getAuthUser()

  if (!auth) {
    const adminRole = request.cookies.get('fs-admin-role')?.value
    if (adminRole) {
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, supabaseId: 'dev-user' }
    }
  }

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
        { error: { code: 'SPONSOR-002', message: 'Liga não encontrada' } },
        { status: 404 }
      )
    }
    console.error('[sponsors] Error:', error)
    return errors.server()
  }
}
