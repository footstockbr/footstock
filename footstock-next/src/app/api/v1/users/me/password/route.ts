import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'
import bcrypt from 'bcryptjs'

import { withAuth, type AuthContext } from '@/app/api/middleware'
import { changePasswordSchema } from '@/lib/schemas/auth.schema'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import { MESSAGES } from '@/lib/constants/messages'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'

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

    const isDevCookieSession =
      process.env.NODE_ENV !== 'production' && req.cookies.get('fs_dev_auth')?.value === user.email

    const fallbackEnabled = process.env.FEATURE_AUTH_SUPABASE_FALLBACK === 'true'

    // ─── 1. Buscar user no Prisma (fonte da verdade pos-M054) ─────────────────
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, passwordHash: true },
    })

    if (!dbUser) {
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

    // ─── 2. Verify-old: bcrypt quando temos hash, Supabase fallback caso flag ─
    let verifiedViaSupabaseFallback = false
    let needsBackfill = false

    if (!isDevCookieSession) {
      if (dbUser.passwordHash != null) {
        Sentry.addBreadcrumb({
          category: 'auth.changepw',
          message: 'auth.changepw.verify.bcrypt',
          level: 'info',
          data: { path: 'authjs' },
        })

        const ok = await bcrypt.compare(currentPassword, dbUser.passwordHash)
        if (!ok) {
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
      } else if (fallbackEnabled) {
        const supabaseAdmin = getSupabaseAdmin()

        if (!supabaseAdmin) {
          // Sem hash + sem Supabase + fallback ligado = nao da pra verificar.
          // Em dev sem supabase ainda permitimos pseudo-success (legado).
          if (process.env.NODE_ENV !== 'production') {
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
          category: 'auth.changepw',
          message: 'auth.changepw.verify.supabase_fallback',
          level: 'info',
          data: { path: 'supabase_fallback' },
        })

        const { error: verifyError } = await supabaseAdmin.auth.signInWithPassword({
          email: dbUser.email,
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

        verifiedViaSupabaseFallback = true
        needsBackfill = true
      } else {
        // Sem hash + flag OFF = nao ha como verificar. Tratar como mismatch.
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

    // ─── 3. Update via Prisma (hash bcrypt 12 rounds) ─────────────────────────
    const newHash = await bcrypt.hash(newPassword, 12)

    try {
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { passwordHash: newHash, updatedAt: new Date() },
      })
    } catch {
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

    Sentry.addBreadcrumb({
      category: 'auth.changepw',
      message: 'auth.changepw.update.prisma',
      level: 'info',
      data: { backfill_applied: needsBackfill, via: verifiedViaSupabaseFallback ? 'supabase_fallback' : 'authjs' },
    })

    // ─── 4. Atualizacao paralela no Supabase (gated por flag) ────────────────
    // Preserva login para sessoes Supabase ainda ativas em outros devices ate o
    // cookie expirar. Fire-and-forget: erros sao apenas logados em Sentry.
    if (fallbackEnabled) {
      const supabaseAdmin = getSupabaseAdmin()
      if (supabaseAdmin) {
        supabaseAdmin.auth.admin
          .updateUserById(user.id, { password: newPassword })
          .then(({ error }) => {
            if (error) {
              Sentry.captureMessage('auth.changepw.supabase_update_failed', {
                level: 'warning',
                extra: { user_id: user.id, supabase_error: error.message },
              })
            }
          })
          .catch((err: unknown) => {
            Sentry.captureException(err, {
              tags: { feature: 'auth.changepw', op: 'supabase_admin_update' },
            })
          })
      }
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
