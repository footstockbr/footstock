import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ok, errors } from '@/lib/api'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')?.trim()

    if (!token) {
      return errors.unauthorized()
    }

    // Obter userId a partir do Bearer token antes de revogar
    const { data: { user }, error: getUserError } = await supabaseAdmin.auth.getUser(token)

    if (getUserError || !user) {
      // Token já expirado ou inválido — tratar como sucesso (idempotente)
      return ok({ message: 'Logout realizado.' })
    }

    // Revogar sessão no Supabase pelo userId (UUID) — não pelo token
    await supabaseAdmin.auth.admin.signOut(user.id)

    return ok({ message: 'Logout realizado.' })
  } catch {
    return errors.server()
  }
}
