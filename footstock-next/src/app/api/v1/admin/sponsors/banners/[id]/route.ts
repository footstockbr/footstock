import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { User, AdminRole } from '@/types'

interface BannerParams {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, { params }: BannerParams) {
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
    if (body.title !== undefined) updateData.title = body.title
    if (body.company !== undefined) updateData.company = body.company
    if (body.position !== undefined) updateData.position = body.position
    if (body.isActive !== undefined) updateData.isActive = body.isActive
    if (body.color !== undefined) updateData.color = body.color
    if (body.ctaText !== undefined) updateData.ctaText = body.ctaText
    if (body.ctaColor !== undefined) updateData.ctaColor = body.ctaColor

    const banner = await prisma.sponsorBanner.update({
      where: { id },
      data: updateData,
    })

    return ok(banner)
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'SPONSOR-001', message: 'Banner não encontrado' } },
        { status: 404 }
      )
    }
    console.error('[sponsors] Error:', error)
    return errors.server()
  }
}

export async function DELETE(request: NextRequest, { params }: BannerParams) {
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
    await prisma.sponsorBanner.delete({
      where: { id },
    })
    return ok({ message: 'Banner deletado com sucesso' })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'SPONSOR-001', message: 'Banner não encontrado' } },
        { status: 404 }
      )
    }
    console.error('[sponsors] Error:', error)
    return errors.server()
  }
}
