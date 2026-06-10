import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import bcrypt from 'bcryptjs'
import { encode } from '@auth/core/jwt'

import { withAuth, type AuthContext } from '@/app/api/middleware'
import { changePasswordSchema } from '@/lib/schemas/auth.schema'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import { MESSAGES } from '@/lib/constants/messages'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'

function passwordEndpointDisabled(): boolean {
  // NXAUTH-07: quando o flow passwordless via Auth.js está ativo, alteração de
  // senha por credenciais deixa de fazer sentido — bloquear o endpoint.
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

    // Tech debt #33 (2026-05-23): Supabase fallback removido. Sem passwordHash =
    // user precisa usar /esqueci-senha (magic link) para reset.

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

    // ─── 2. Verify-old: bcrypt (unico path apos remocao do fallback) ─────────
    if (!isDevCookieSession) {
      if (dbUser.passwordHash == null) {
        // Sem hash = user nunca migrou. Direcionar para magic link reset.
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
    }

    // ─── 3. Update via Prisma (hash bcrypt 12 rounds) ─────────────────────────
    const newHash = await bcrypt.hash(newPassword, 12)
    // Marca-d'água que invalida sessões antigas (outras telas/dispositivos):
    // qualquer token JWT com iat anterior a este instante passa a ser rejeitado
    // em getAuthUser.
    const changedAt = new Date()

    try {
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { passwordHash: newHash, passwordChangedAt: changedAt, updatedAt: changedAt },
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
      data: { via: 'authjs' },
    })

    const res = NextResponse.json({
      success: true,
      data: { message: MESSAGES.PROFILE.PASSWORD_CHANGED },
    })

    // ─── 4. Reemitir a sessão ATUAL (web/cookie) ──────────────────────────────
    // Todas as OUTRAS sessões (tokens com iat < changedAt) são invalidadas em
    // getAuthUser; esta continua válida porque o novo token tem iat ≈ agora.
    // Sessão dev (fs_dev_auth) não usa JWE e nunca é invalidada (sem iat).
    if (!isDevCookieSession) {
      try {
        const secret = process.env.AUTH_SECRET
        if (secret) {
          const salt =
            process.env.NODE_ENV === 'production'
              ? '__Secure-authjs.session-token'
              : 'authjs.session-token'
          const maxAge = 30 * 24 * 60 * 60
          const access_token = await encode({
            token: {
              id: user.id,
              sub: user.id,
              email: user.email,
              adminRole: user.adminRole,
              planType: user.planType,
              userType: user.userType,
              favoriteClub: user.favoriteClub,
            },
            secret,
            salt,
            maxAge,
          })
          res.cookies.set({
            name: salt,
            value: access_token,
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            secure: process.env.NODE_ENV === 'production',
            maxAge,
          })
        }
      } catch (err) {
        // Best-effort: se a reemissão falhar, a sessão atual será invalidada no
        // próximo request (usuário reloga). Nunca bloquear a troca de senha.
        console.error('[password] falha ao reemitir sessão atual:', err)
      }
    }

    return res
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
