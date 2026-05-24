// ============================================================================
// FootStock — POST /api/v1/club/auth/forgot-password
// Reset de senha para representantes de clubes parceiros.
// Usa Auth.js Resend magic-link (passwordless recovery). Email separado.
// Rastreabilidade: TASK-015 sub-item 6, US-025
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { getForgotPasswordRateLimit } from '@/lib/ratelimit'
import { env } from '@/lib/env'
import { signIn } from '@/auth'

const ForgotSchema = z.object({
  email: z.string().email('E-mail inválido'),
})

function magicLinkEnabled(): boolean {
  return env.AUTH_ENABLE_MAGIC_LINK_RESET === 'true' && Boolean(env.RESEND_API_KEY)
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const parsed = ForgotSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VAL_001', message: 'E-mail inválido.' } },
      { status: 422 }
    )
  }

  const { email } = parsed.data

  // Rate limiting (reutiliza o rate limiter de forgot-password)
  const rl = getForgotPasswordRateLimit()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const rlResult = await rl.limit(`${email}:${ip}`)
  if (!rlResult.success) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMIT', message: 'Muitas tentativas. Aguarde e tente novamente.' } },
      { status: 429 }
    )
  }

  const appUrl = env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // Auth.js Resend magic-link (pós-decomissão Supabase). Falhas são silenciosas
  // para não vazar se o email existe.
  if (magicLinkEnabled()) {
    try {
      await signIn('resend', {
        email,
        redirect: false,
        redirectTo: `${appUrl}/club/login?reset=true`,
      })
    } catch (err) {
      Sentry.captureException(err, {
        tags: { route: 'club/forgot-password', flow: 'authjs-magic-link' },
      })
    }
  } else {
    Sentry.captureMessage('club forgot-password requested but magic-link disabled', {
      level: 'warning',
      tags: { route: 'club/forgot-password' },
    })
  }

  // Sempre retornar sucesso para não vazar se o email existe
  return NextResponse.json({
    success: true,
    message: 'Se o e-mail estiver cadastrado, você receberá instruções para redefinir sua senha.',
  })
}
