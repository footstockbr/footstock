import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { changePasswordSchema } from '@/lib/schemas/auth.schema'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import { MESSAGES } from '@/lib/constants/messages'
import { env } from '@/lib/env'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) return null

  try {
    return createClient(url, serviceRoleKey)
  } catch {
    return null
  }
}

function passwordEndpointDisabled(): boolean {
  // NXAUTH-07: quando o flow passwordless via Auth.js está ativo, change-password
  // (que ainda escreve em Supabase Auth) deixa de ter sentido — bloquear até
  // sunset definitivo em NXAUTH-09.
  return env.AUTH_ENABLE_MAGIC_LINK_RESET === 'true'
}

async function handler(req: NextRequest, { user }: AuthContext) {
  try {
    if (passwordEndpointDisabled()) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.SYS_002,
            message:
              'Alteração de senha indisponível: a conta agora usa login por link mágico. Use "Esqueci minha senha" para receber um novo link.',
          },
        },
        { status: 410 },
      )
    }

    const body = await req.json()
    const parsed = changePasswordSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VAL_001,
            message: parsed.error.issues[0]?.message ?? ERROR_MESSAGES[ERROR_CODES.VAL_001],
          },
        },
        { status: 400 }
      )
    }

    const { currentPassword, newPassword } = parsed.data
    const supabaseAdmin = getSupabaseAdmin()

    const isDevCookieSession =
      process.env.NODE_ENV !== 'production' && req.cookies.get('fs_dev_auth')?.value === user.email

    if (!supabaseAdmin) {
      if (process.env.NODE_ENV !== 'production' || isDevCookieSession) {
        return NextResponse.json({
          success: true,
          data: { message: MESSAGES.PROFILE.PASSWORD_CHANGED },
        })
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.SYS_002,
            message: ERROR_MESSAGES[ERROR_CODES.SYS_002],
          },
        },
        { status: 503 }
      )
    }

    Sentry.addBreadcrumb({
      category: 'auth.legacy',
      message: 'auth.legacy.signInWithPassword',
      level: 'info',
    })

    if (!isDevCookieSession) {
      const { error: verifyError } = await supabaseAdmin.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      })

      if (verifyError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.AUTH_001,
              message: MESSAGES.PROFILE.PASSWORD_MISMATCH,
            },
          },
          { status: 401 }
        )
      }
    }

    Sentry.addBreadcrumb({
      category: 'auth.legacy',
      message: 'auth.legacy.admin.updateUserById',
      level: 'info',
    })

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    })

    if (updateError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.AUTH_007,
            message: ERROR_MESSAGES[ERROR_CODES.AUTH_007],
          },
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      data: { message: MESSAGES.PROFILE.PASSWORD_CHANGED },
    })
  } catch {
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

export const PATCH = withAuth(handler as never)
