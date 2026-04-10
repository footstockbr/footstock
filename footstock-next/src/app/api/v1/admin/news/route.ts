import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { User, AdminRole } from '@/types'

export async function GET(request: NextRequest) {
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
      { error: { code: 'ADMIN-051', message: 'Permissão insuficiente para gerenciar notícias.' } },
      { status: 403 }
    )
  }

  try {
    const news = await prisma.news.findMany({
      orderBy: { publishedAt: { sort: 'desc', nulls: 'last' } },
      take: 100,
    })

    return ok(news)
  } catch (error) {
    console.error('[news] Error:', error)
    return errors.server()
  }
}

export async function POST(request: NextRequest) {
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
    const { title, content, impact, sentiment, assetIds, source, isPublished } = body

    const news = await prisma.news.create({
      data: {
        title,
        content,
        impact,
        sentiment,
        assetIds,
        source,
        isPublished,
        publishedAt: isPublished ? new Date() : null,
        author: auth.user.name,
      },
    })

    return ok(news, 201)
  } catch (error) {
    console.error('[news] Error:', error)
    return errors.server()
  }
}
