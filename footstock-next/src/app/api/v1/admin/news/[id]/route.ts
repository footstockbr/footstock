import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { User, AdminRole } from '@/types'

interface NewsParams {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, { params }: NewsParams) {
  const { id } = await params
  let auth = await getAuthUser()

  // Dev mode fallback
  if (!auth && process.env.NODE_ENV === 'development') {
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
      { error: { code: 'ADMIN-051', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const { title, content, impact, sentiment, ticker, isPublished, isArchived } = body

    const updateData: Record<string, unknown> = {}
    if (title !== undefined) updateData.title = title
    if (content !== undefined) updateData.content = content
    if (impact !== undefined) updateData.impact = impact
    if (sentiment !== undefined) updateData.sentiment = sentiment
    if (ticker !== undefined) {
      updateData.ticker = ticker || null
    }
    if (isArchived !== undefined) {
      updateData.isArchived = isArchived
      if (isArchived) updateData.archivedAt = new Date()
    }
    if (isPublished !== undefined) {
      updateData.isPublished = isPublished
      if (isPublished && !updateData.publishedAt) {
        updateData.publishedAt = new Date()
      }
    }

    const news = await prisma.news.update({
      where: { id },
      data: updateData,
    })

    return ok(news)
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'NEWS-001', message: 'Notícia não encontrada' } },
        { status: 404 }
      )
    }
    console.error('[news] Error:', error)
    return errors.server()
  }
}

export async function DELETE(request: NextRequest, { params }: NewsParams) {
  const { id } = await params
  let auth = await getAuthUser()

  // Dev mode fallback
  if (!auth && process.env.NODE_ENV === 'development') {
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
      { error: { code: 'ADMIN-051', message: 'Apenas super admin pode deletar notícias.' } },
      { status: 403 }
    )
  }

  try {
    await prisma.news.delete({
      where: { id },
    })

    return ok({ message: 'Notícia deletada com sucesso' })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'NEWS-001', message: 'Notícia não encontrada' } },
        { status: 404 }
      )
    }
    console.error('[news] Error:', error)
    return errors.server()
  }
}
