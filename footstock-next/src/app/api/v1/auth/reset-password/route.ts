import { NextRequest } from 'next/server'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { createSupabaseServerClient } from '@/lib/supabase'
import { errors, message } from '@/lib/api'
import { getAuthRateLimit } from '@/lib/ratelimit'
import { env } from '@/lib/env'

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
})

function magicLinkEnabled(): boolean {
  return env.AUTH_ENABLE_MAGIC_LINK_RESET === 'true' && Boolean(env.RESEND_API_KEY)
}

export async function POST(request: NextRequest) {
  try {
    // ─── Rate limiting por IP (5 req/15min) ──────────────────────────────────
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'

    try {
      const { success } = await getAuthRateLimit().limit(`reset:${ip}`)
      if (!success) {
        return errors.rateLimit('Muitas tentativas. Aguarde alguns minutos.')
      }
    } catch {
      // Rate limiter indisponível — continuar sem bloquear
    }

    // ─── Auth.js magic-link mode (NXAUTH-07) ─────────────────────────────────
    // Quando AUTH_ENABLE_MAGIC_LINK_RESET=true, o token de recovery é consumido
    // por /api/auth/callback/resend (Auth.js) — este endpoint vira informativo.
    if (magicLinkEnabled()) {
      return errors.validation(
        'Use o link enviado por email para entrar. Senhas tradicionais foram substituídas por login passwordless.',
      )
    }

    // ─── Legacy Supabase reset (transition-safe fallback) ─────────────────────
    const body = await request.json()
    const parsed = ResetPasswordSchema.safeParse(body)

    if (!parsed.success) {
      return errors.validation('Dados inválidos. Verifique os campos e tente novamente.')
    }

    const { token, newPassword } = parsed.data

    Sentry.addBreadcrumb({
      category: 'auth.legacy',
      message: 'auth.legacy.exchangeCodeForSession',
      level: 'info',
    })

    const supabase = await createSupabaseServerClient()

    // Verificar e aplicar o token de reset via Supabase Auth
    const { error } = await supabase.auth.exchangeCodeForSession(token)

    if (error) {
      // Não expor error.message do Supabase — pode vazar informação interna
      return errors.validation('Token de reset inválido ou expirado. Solicite um novo link.')
    }

    Sentry.addBreadcrumb({
      category: 'auth.legacy',
      message: 'auth.legacy.updateUser',
      level: 'info',
    })

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      return errors.server()
    }

    return message('Senha redefinida com sucesso. Faça login para continuar.')
  } catch {
    return errors.server()
  }
}
