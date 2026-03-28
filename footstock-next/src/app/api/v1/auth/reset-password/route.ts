import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase'
import { ok, errors, message } from '@/lib/api'

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
})

export async function POST(request: NextRequest) {
  try {
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
      return errors.validation('Token de reset inválido ou expirado.', error.message)
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
