// ============================================================================
// FootStock — POST /api/v1/club/auth/login
// Login exclusivo para clubes parceiros (role CLUB_PARTNER).
// Usa Supabase Auth. Redireciona para /club/login se role incorreto.
// Rate limiting: 5 tentativas/min por email (TASK-015 sub-item 2).
// Rastreabilidade: FDD painel-admin §2.12, MILESTONE-9 TASK-1/ST001, TASK-015
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { getClubLoginRateLimit } from '@/lib/ratelimit'

const LoginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
})

function deriveClubIdFromEmail(email: string): string | null {
  const match = email.match(/^([^@]+)@footstock\.com$/)
  return match?.[1] ? match[1].toUpperCase() : null
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const parsed = LoginSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VAL_001', message: 'E-mail ou senha inválidos.' } },
      { status: 422 }
    )
  }

  const { email, password } = parsed.data

  // Rate limiting: 5 tentativas por email por minuto
  const rl = getClubLoginRateLimit()
  const rlResult = await rl.limit(email.toLowerCase())
  if (!rlResult.success) {
    return NextResponse.json(
      {
        error: {
          code: 'RATE_LIMIT',
          message: 'Muitas tentativas de login. Aguarde 1 minuto e tente novamente.',
        },
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rlResult.reset - Date.now()) / 1000)),
          'X-RateLimit-Remaining': String(rlResult.remaining),
        },
      }
    )
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* ignora em Server Component */ }
        },
      },
    }
  )

  // 1. Autenticar via Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (authError || !authData.user) {
    return NextResponse.json(
      { error: { code: 'AUTH-001', message: 'Email ou senha incorretos.' } },
      { status: 401 }
    )
  }

  // 2. Verificar role CLUB_PARTNER no banco (nunca confiar só no JWT)
  const dbUser = await prisma.user.findUnique({
    where: { id: authData.user.id },
    select: { adminRole: true },
  })

  if (dbUser?.adminRole !== 'CLUB_PARTNER') {
    // Fazer logout e retornar 403
    await supabase.auth.signOut()
    return NextResponse.json(
      {
        error: {
          code: 'ADMIN_050',
          message: 'Email ou senha incorretos.',
        },
      },
      { status: 403 }
    )
  }

  // 3. Resolver clubId (metadata -> email pattern)
  const metaClubId = (authData.user.user_metadata?.clubId as string | undefined)?.toUpperCase()
  const emailClubId = deriveClubIdFromEmail(email)
  const clubId = metaClubId ?? emailClubId

  if (!clubId) {
    await supabase.auth.signOut()
    return NextResponse.json(
      {
        error: {
          code: 'CLUB_001',
          message: 'Clube não identificado. Entre em contato com o administrador.',
        },
      },
      { status: 403 }
    )
  }

  // 4. Verificar se o clube existe no sistema
  const asset = await prisma.asset.findUnique({
    where: { ticker: clubId },
    select: { ticker: true, displayName: true },
  })

  if (!asset) {
    await supabase.auth.signOut()
    return NextResponse.json(
      {
        error: {
          code: 'CLUB_002',
          message: `Clube ${clubId} não encontrado no sistema.`,
        },
      },
      { status: 404 }
    )
  }

  // 5. Atualizar lastLoginAt no ClubUser (se existir registro)
  try {
    await prisma.clubUser.updateMany({
      where: { email: email.toLowerCase(), isActive: true },
      data: { lastLoginAt: new Date() },
    })
  } catch {
    // ClubUser pode não existir (auth via Supabase direto) — não bloqueia login
  }

  // 6. Registrar acesso no log
  try {
    const clubUser = await prisma.clubUser.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    })
    if (clubUser) {
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? null
      await prisma.clubAccessLog.create({
        data: {
          clubUserId: clubUser.id,
          action: 'LOGIN',
          ipAddress: ip,
          userAgent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
        },
      })
    }
  } catch {
    // Log falhou — não bloqueia login
  }

  // 7. Login bem-sucedido — sessão já foi criada pelo Supabase via cookies
  return NextResponse.json({
    success: true,
    data: {
      clubId: asset.ticker,
      clubName: asset.displayName,
      message: 'Login realizado com sucesso.',
    },
  })
}
