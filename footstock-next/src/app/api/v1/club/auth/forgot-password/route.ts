// ============================================================================
// Foot Stock — POST /api/v1/club/auth/forgot-password
// Reset de senha para representantes de clubes parceiros.
// Usa Supabase Auth (mesmo mecanismo, email separado).
// Rastreabilidade: TASK-015 sub-item 6, US-025
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { getForgotPasswordRateLimit } from '@/lib/ratelimit'

const ForgotSchema = z.object({
  email: z.string().email('E-mail inválido'),
})

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

  // Enviar reset via Supabase Auth
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/club/login?reset=true`,
  })

  // Sempre retornar sucesso para não vazar se o email existe
  return NextResponse.json({
    success: true,
    message: 'Se o e-mail estiver cadastrado, você receberá instruções para redefinir sua senha.',
  })
}
