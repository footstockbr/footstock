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

    // Set fs-admin-role cookie for middleware to validate dev access
    if (user.adminRole) {
      response.cookies.set('fs-admin-role', user.adminRole, {
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      })
    }

    return response
  } catch (error) {
    console.error('[dev-login]', error)
    return NextResponse.json({ error: 'Erro no servidor' }, { status: 500 })
  }
}
