/**
 * Dev-only Login endpoint
 * Para desenvolvimento local sem Supabase Auth
 *
 * SECURITY: Remove em produção!
 * Apenas funciona se NODE_ENV !== 'production'
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { serializeUser } from '@/lib/auth'
import { DEV_TEST_USERS } from '@/lib/constants/dev-test-users'

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Dev login desabilitado em produção' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { email, password } = body

    if (!email) {
      return NextResponse.json({ error: 'Email é obrigatório' }, { status: 400 })
    }

    // Em dev, qualquer email + qualquer senha funciona
    console.log('[dev-login] Attempting login for:', email)

    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    // Gera um token JWT fake para dev
    const mockToken = Buffer.from(JSON.stringify({
      sub: user.id,
      email: user.email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    })).toString('base64')

    const response = NextResponse.json({
      data: {
        user: serializeUser(user),
        session: {
          access_token: mockToken,
          refresh_token: mockToken,
          expires_at: Date.now() + 86400000,
        },
        requiresOnboarding: !user.tourCompleted,
      },
    })

    // Set fs_dev_auth cookie — email-based identity for dev fallback in withAuth/getAuthUser
    response.cookies.set('fs_dev_auth', encodeURIComponent(user.email), {
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: 'lax',
      httpOnly: true,
      secure: false,
    })

    // Set fs-admin-role cookie for middleware to validate dev access
    if (user.adminRole) {
      response.cookies.set('fs-admin-role', user.adminRole, {
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
        sameSite: 'lax',
        secure: false,
      })
    }

    // Set fs_dev_club_id for CLUB_PARTNER dev bypass in withClubAuth()
    if (user.adminRole === 'CLUB_PARTNER') {
      const devProfile = DEV_TEST_USERS[email as keyof typeof DEV_TEST_USERS]
      const clubId = devProfile?.clubId
      if (clubId) {
        response.cookies.set('fs_dev_club_id', clubId, {
          path: '/',
          maxAge: 60 * 60 * 24 * 30,
          sameSite: 'lax',
          httpOnly: true,
          secure: false,
        })
      }
    }

    return response
  } catch (error) {
    console.error('[dev-login]', error)
    return NextResponse.json({ error: 'Erro no servidor' }, { status: 500 })
  }
}
