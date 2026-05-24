// ============================================================================
// FootStock — POST /api/v1/club/auth/login
// Login exclusivo para clubes parceiros (role CLUB_PARTNER).
// Usa Auth.js (Credentials + JWE cookie). Redireciona para /club/login se role incorreto.
// Rate limiting: 5 tentativas/min por email (TASK-015 sub-item 2).
// Rastreabilidade: FDD painel-admin §2.12, MILESTONE-9 TASK-1/ST001, TASK-015
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { encode } from '@auth/core/jwt'
import { prisma } from '@/lib/prisma'
import { authorizeCredentials } from '@/lib/auth-credentials'
import { getClubLoginRateLimit } from '@/lib/ratelimit'

const LoginSchema = z.object({
  email: z.string().email('E-mail inválido').transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1, 'Senha obrigatória'),
})

// JWT Auth.js — alinhar com cookie name de auth.config para derivar a sessão
const AUTHJS_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
const AUTHJS_SALT_PROD = '__Secure-authjs.session-token'
const AUTHJS_SALT_DEV = 'authjs.session-token'

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
  const rlResult = await rl.limit(email)
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

  // 1. Autenticar via Auth.js Credentials (Zod + bcrypt.compare com timing defense)
  const authjsUser = await authorizeCredentials({ email, password })

  if (!authjsUser) {
    return NextResponse.json(
      { error: { code: 'AUTH-001', message: 'Email ou senha incorretos.' } },
      { status: 401 }
    )
  }

  // 2. Verificar role CLUB_PARTNER no banco (nunca confiar só no JWT)
  if (authjsUser.adminRole !== 'CLUB_PARTNER') {
    return NextResponse.json(
      { error: { code: 'ADMIN_050', message: 'Email ou senha incorretos.' } },
      { status: 403 }
    )
  }

  // 3. Resolver clubId pelo padrão de email institucional (sem user_metadata)
  const clubId = deriveClubIdFromEmail(email)

  if (!clubId) {
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
      where: { email, isActive: true },
      data: { lastLoginAt: new Date() },
    })
  } catch {
    // ClubUser pode não existir — não bloqueia login
  }

  // 6. Registrar acesso no log
  try {
    const clubUser = await prisma.clubUser.findUnique({
      where: { email },
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

  // 7. Emitir sessão Auth.js (JWE cookie HttpOnly) — mesmo contrato que signIn faria
  const salt = process.env.NODE_ENV === 'production' ? AUTHJS_SALT_PROD : AUTHJS_SALT_DEV
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: { code: 'SRV_001', message: 'Erro de configuração do servidor.' } },
      { status: 500 }
    )
  }

  const access_token = await encode({
    token: {
      id: authjsUser.id,
      sub: authjsUser.id,
      email: authjsUser.email,
      adminRole: authjsUser.adminRole,
      planType: authjsUser.planType,
      userType: authjsUser.userType,
      favoriteClub: authjsUser.favoriteClub,
    },
    secret,
    salt,
    maxAge: AUTHJS_SESSION_MAX_AGE_SECONDS,
  })

  const res = NextResponse.json({
    success: true,
    data: {
      clubId: asset.ticker,
      clubName: asset.displayName,
      message: 'Login realizado com sucesso.',
    },
  })
  res.cookies.set({
    name: salt,
    value: access_token,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: AUTHJS_SESSION_MAX_AGE_SECONDS,
  })
  return res
}
