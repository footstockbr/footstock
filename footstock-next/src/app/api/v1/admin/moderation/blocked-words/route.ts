import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { invalidateBlockedWordsCache } from '@/lib/moderation'
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
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, supabaseId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'MODERADOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  try {
    const words = await prisma.blockedWord.findMany({
      orderBy: { createdAt: 'desc' },
    })

    return ok({
      words: words.map((w) => w.word),
      count: words.length,
    })
  } catch (error) {
    console.error('[moderation] Error:', error)
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
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, supabaseId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'MODERADOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const { word } = body

    if (!word || typeof word !== 'string' || word.trim().length === 0) {
      return errors.validation('Palavra inválida')
    }

    const normalizedWord = word.toLowerCase().trim()

    const existing = await prisma.blockedWord.findUnique({
      where: { word: normalizedWord },
    })

    if (existing) {
      return NextResponse.json(
        { error: { code: 'MODERATION-002', message: 'Palavra já está bloqueada' } },
        { status: 409 }
      )
    }

    await prisma.blockedWord.create({
      data: { word: normalizedWord },
    })

    invalidateBlockedWordsCache()
    return ok({ message: 'Palavra adicionada à lista bloqueada', word: normalizedWord })
  } catch (error) {
    console.error('[moderation] Error:', error)
    return errors.server()
  }
}
