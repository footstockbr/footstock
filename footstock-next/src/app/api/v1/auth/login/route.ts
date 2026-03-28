import { NextRequest } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase'
import { prisma } from '@/lib/prisma'
import { ok, errors, error as apiError } from '@/lib/api'
import { serializeUser } from '@/lib/auth'
import { getAuthRateLimit } from '@/lib/ratelimit'

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    // ─── Rate limiting por IP ────────────────────────────────────────────────
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'

    try {
      const { success, reset } = await getAuthRateLimit().limit(ip)
      if (!success) {
        const resetAt = new Date(reset).toISOString()
        return errors.rateLimit('Muitas tentativas de login. Tente novamente em 5 minutos.', resetAt)
      }
    } catch {
      // Rate limiter indisponível (Redis offline) — continuar sem bloquear
    }

    // ─── Validação de input ──────────────────────────────────────────────────
    const body = await request.json()
    const parsed = LoginSchema.safeParse(body)
    if (!parsed.success) {
      return errors.validation()
    }

    const { email, password } = parsed.data

    // ─── Autenticação via Supabase Auth ──────────────────────────────────────
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    })

    if (authError || !authData.session || !authData.user) {
      // Mensagem genérica — não revelar se é email ou senha incorreto (SEC)
      return apiError('AUTH_001', 'Credenciais inválidas.', 401)
    }

    // ─── Buscar usuário no Prisma ────────────────────────────────────────────
    const dbUser = await prisma.user.findUnique({
      where: { id: authData.user.id },
    })

    if (!dbUser) {
      return apiError('AUTH_001', 'Credenciais inválidas.', 401)
    }

    return ok({
      user: serializeUser(dbUser),
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_at: authData.session.expires_at,
      },
      requiresOnboarding: !dbUser.tourCompleted,
    })
  } catch {
    return errors.server()
  }
}
