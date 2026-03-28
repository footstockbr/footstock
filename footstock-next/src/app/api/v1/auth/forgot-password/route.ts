import { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase'
import { message, errors } from '@/lib/api'
import { getForgotPasswordRateLimit } from '@/lib/ratelimit'

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
})

// Resposta genérica — nunca revelar se o email está ou não cadastrado (segurança)
const SAFE_RESPONSE = message('Se este email estiver cadastrado, você receberá as instruções em breve.')

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

    // ─── Enviar email de recuperação via Supabase Auth ────────────────────────
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

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
