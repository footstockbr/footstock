import { NextRequest } from 'next/server'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { supabaseAdmin } from '@/lib/supabase'
import { message, errors } from '@/lib/api'
import { getForgotPasswordRateLimit } from '@/lib/ratelimit'
import { env } from '@/lib/env'
import { signIn } from '../../../../../../auth'

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
})

// Resposta genérica — nunca revelar se o email está ou não cadastrado (segurança)
const SAFE_RESPONSE = message('Se este email estiver cadastrado, você receberá as instruções em breve.')

function magicLinkEnabled(): boolean {
  return env.AUTH_ENABLE_MAGIC_LINK_RESET === 'true' && Boolean(env.RESEND_API_KEY)
}

export async function POST(request: NextRequest) {
  try {
    // ─── Rate limiting por email + IP ────────────────────────────────────────
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return SAFE_RESPONSE
    }

    const parsed = ForgotPasswordSchema.safeParse(body)
    if (!parsed.success) {
      // Retornar resposta genérica — não revelar erro de validação
      return SAFE_RESPONSE
    }

    const { email } = parsed.data

    try {
      const { success } = await getForgotPasswordRateLimit().limit(`${ip}:${email}`)
      if (!success) {
        // Rate limit atingido — retornar 429 (aceitável para este endpoint)
        return errors.rateLimit('Limite de solicitações atingido. Aguarde alguns minutos.')
      }
    } catch {
      // Rate limiter indisponível — continuar sem bloquear
    }

    const appUrl = env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    if (magicLinkEnabled()) {
      // ─── Auth.js Resend magic-link (passwordless recovery, NXAUTH-07) ──────
      try {
        await signIn('resend', {
          email,
          redirect: false,
          redirectTo: `${appUrl}/`,
        })
      } catch (err) {
        // Falha no Resend não pode revelar status do email — continua silencioso.
        Sentry.captureException(err, {
          tags: { route: 'forgot-password', flow: 'authjs-magic-link' },
        })
      }
      return SAFE_RESPONSE
    }

    // ─── Legacy Supabase reset (transition-safe fallback) ─────────────────────
    Sentry.addBreadcrumb({
      category: 'auth.legacy',
      message: 'auth.legacy.resetPasswordForEmail',
      level: 'info',
    })

    await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/redefinir-senha`,
    })

    // Sempre retornar resposta genérica (Supabase não envia email se não houver cadastro)
    return SAFE_RESPONSE
  } catch {
    // Nunca revelar erro interno — resposta genérica (segurança)
    return SAFE_RESPONSE
  }
}
