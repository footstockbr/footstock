import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase'
import { ok, errors, message } from '@/lib/api'
import { getAuthRateLimit } from '@/lib/ratelimit'

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
})

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

    const body = await request.json()
    const parsed = ResetPasswordSchema.safeParse(body)

    if (!parsed.success) {
      return errors.validation('Dados inválidos. Verifique os campos e tente novamente.')
    }

    const { token, newPassword } = parsed.data

    const supabase = await createSupabaseServerClient()

    // Verificar e aplicar o token de reset via Supabase Auth
    const { error } = await supabase.auth.exchangeCodeForSession(token)

    if (error) {
      // Não expor error.message do Supabase — pode vazar informação interna
      return errors.validation('Token de reset inválido ou expirado. Solicite um novo link.')
    }

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
