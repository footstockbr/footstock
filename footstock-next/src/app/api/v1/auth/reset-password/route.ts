import { NextRequest } from 'next/server'
import { errors } from '@/lib/api'
import { getAuthRateLimit } from '@/lib/ratelimit'

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

    // Pós-decomissão Supabase: recovery é exclusivamente passwordless (Auth.js
    // Resend). O token de recovery é consumido por /api/auth/callback/resend —
    // não há mais reset de senha tradicional. Endpoint mantido como informativo.
    return errors.validation(
      'Use o link enviado por email para entrar. Senhas tradicionais foram substituídas por login passwordless.',
    )
  } catch {
    return errors.server()
  }
}
