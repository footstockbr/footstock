import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loginSchema } from '@/lib/schemas/auth.schema'
import { authRateLimit } from '@/lib/ratelimit'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import { DEV_TEST_USERS, type DevTestUserProfile } from '@/lib/constants/dev-test-users'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    return null
  }

  try {
    return createClient(url, serviceRoleKey)
  } catch (error) {
    console.warn('[POST /api/v1/auth/login] Supabase client indisponível:', error)
    return null
  }
}

async function buildOrCreateDevUser(email: string, profile: DevTestUserProfile) {
  const cpfHash = createHash('sha256').update(`dev-local:${email}`).digest('hex')

  try {
    return await prisma.user.upsert({
      where: { email },
      create: {
        email,
        name: profile.name,
        cpfHash,
        planType: profile.planType,
        adminRole: profile.adminRole ?? null,
        investorProfile: 'INTERMEDIARIO',
        tourCompleted: true,
      },
      update: {
        name: profile.name,
        planType: profile.planType,
        adminRole: profile.adminRole ?? null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        planType: true,
        status: true,
        tourCompleted: true,
        adminRole: true,
        createdAt: true,
      },
    })
  } catch (error) {
    console.warn('[POST /api/v1/auth/login] DEV fallback sem banco:', error)
    const idHash = createHash('sha256').update(email).digest('hex').slice(0, 24)
    return {
      id: `dev-${idHash}`,
      email,
      name: profile.name,
      planType: profile.planType,
      status: 'ACTIVE',
      tourCompleted: true,
      adminRole: profile.adminRole ?? null,
      createdAt: new Date(),
    }
  }
}

function setDevCookie(
  response: NextResponse,
  email: string,
  isAdmin: boolean,
  clubId?: string,
  clubName?: string,
) {
  response.cookies.set('fs_dev_auth', email, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  response.cookies.set('fs_dev_admin', isAdmin ? '1' : '0', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  if (clubId) {
    response.cookies.set('fs_dev_club_id', clubId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })
    response.cookies.set('fs_dev_club_name', clubName ?? clubId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })
  } else {
    response.cookies.delete('fs_dev_club_id')
    response.cookies.delete('fs_dev_club_name')
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VAL_001,
            message: ERROR_MESSAGES[ERROR_CODES.VAL_001],
          },
        },
        { status: 400 }
      )
    }

    const { email, password } = parsed.data

    if (authRateLimit) {
      try {
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
        const { success } = await authRateLimit.limit(ip)
        if (!success) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: ERROR_CODES.SYS_004,
                message: ERROR_MESSAGES[ERROR_CODES.SYS_004],
              },
            },
            { status: 429, headers: { 'Retry-After': '300' } }
          )
        }
      } catch (rateLimitError) {
        if (process.env.NODE_ENV === 'production') {
          throw rateLimitError
        }
        console.warn('[POST /api/v1/auth/login] Rate limit indisponível em DEV:', rateLimitError)
      }
    }

    const supabaseAdmin = getSupabaseAdmin()
    let authData: {
      user: { id: string; user_metadata?: Record<string, unknown> } | null
      session: { access_token: string; refresh_token: string; expires_at: number | null } | null
    } | null = null
    let authError: unknown = null

    if (supabaseAdmin) {
      try {
        const response = await supabaseAdmin.auth.signInWithPassword({ email, password })
        authData = {
          user: response.data.user
            ? {
                id: response.data.user.id,
                user_metadata: (response.data.user.user_metadata as Record<string, unknown>) ?? {},
              }
            : null,
          session: response.data.session
            ? {
                access_token: response.data.session.access_token,
                refresh_token: response.data.session.refresh_token,
                expires_at: response.data.session.expires_at ?? null,
              }
            : null,
        }
        authError = response.error
      } catch (supabaseError) {
        authError = supabaseError
      }
    } else {
      authError = new Error('Supabase não configurado')
    }

    if (authError || !authData || !authData.user || !authData.session) {
      const devProfile = DEV_TEST_USERS[email]
      if (process.env.NODE_ENV !== 'production' && devProfile && devProfile.password === password) {
        const devUser = await buildOrCreateDevUser(email, devProfile)
        const response = NextResponse.json(
          {
            success: true,
            data: {
              user: devUser,
              session: null,
              requiresOnboarding: !devUser.tourCompleted,
              mode: 'dev-fallback',
            },
          },
          { status: 200 }
        )
        setDevCookie(response, email, Boolean(devProfile.adminRole) && devProfile.adminRole !== 'CLUB_PARTNER', devProfile.clubId, devProfile.clubName)
        return response
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.AUTH_001,
            message: ERROR_MESSAGES[ERROR_CODES.AUTH_001],
          },
        },
        { status: 401 }
      )
    }

    let user: {
      id: string
      email: string
      name: string
      planType: string
      status: string
      tourCompleted: boolean
      adminRole: string | null
      createdAt: Date
    } | null = null

    try {
      user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          planType: true,
          status: true,
          tourCompleted: true,
          adminRole: true,
          createdAt: true,
        },
      })

      if (!user && process.env.NODE_ENV !== 'production') {
        user = await prisma.user.upsert({
          where: { email },
          create: {
            id: authData.user.id,
            email,
            name: (authData.user.user_metadata?.name as string) ?? (email.split('@')[0] ?? email),
            cpfHash: createHash('sha256').update(`dev-supabase:${email}`).digest('hex'),
            planType: 'JOGADOR',
            investorProfile: 'INTERMEDIARIO',
            tourCompleted: true,
          },
          update: {},
          select: {
            id: true,
            email: true,
            name: true,
            planType: true,
            status: true,
            tourCompleted: true,
            adminRole: true,
            createdAt: true,
          },
        })
      }
    } catch (dbError) {
      if (process.env.NODE_ENV === 'production') {
        throw dbError
      }
      console.warn('[POST /api/v1/auth/login] Banco indisponível em DEV:', dbError)
      const idHash = createHash('sha256').update(email).digest('hex').slice(0, 24)
      user = {
        id: `dev-${idHash}`,
        email,
        name: email.split('@')[0] ?? email,
        planType: 'JOGADOR',
        status: 'ACTIVE',
        tourCompleted: true,
        adminRole: null,
        createdAt: new Date(),
      }
    }

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.AUTH_001,
            message: ERROR_MESSAGES[ERROR_CODES.AUTH_001],
          },
        },
        { status: 401 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          user,
          session: {
            accessToken: authData.session.access_token,
            refreshToken: authData.session.refresh_token,
            expiresAt: authData.session.expires_at,
          },
          requiresOnboarding: !user.tourCompleted,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[POST /api/v1/auth/login] Erro interno:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.SYS_001,
          message: ERROR_MESSAGES[ERROR_CODES.SYS_001],
        },
      },
      { status: 500 }
    )
  }
}
