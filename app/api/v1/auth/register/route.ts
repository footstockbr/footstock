import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import prisma from '@/lib/prisma'
import { registerSchema } from '@/lib/schemas/auth.schema'
import { hashCPF } from '@/lib/utils/crypto'
import { verifyAge } from '@/lib/services/age-verification'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import { INITIAL_FS_BALANCE } from '@/lib/constants/limits'
import { CLUB_DISPLAY_NAMES, normalizeClubTicker } from '@/lib/constants/clubs'
import { registerRateLimit } from '@/lib/ratelimit'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // ---------- Rate Limit (REG-003) ----------
    if (registerRateLimit) {
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        'unknown'
      const { success } = await registerRateLimit.limit(ip)
      if (!success) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: ERROR_CODES.REG_003,
              message: ERROR_MESSAGES[ERROR_CODES.REG_003],
            },
          },
          { status: 429, headers: { 'Retry-After': '3600' } }
        )
      }
    }

    const body = await request.json()

    // ---------- Validacao Zod ----------
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VAL_001,
            message: ERROR_MESSAGES[ERROR_CODES.VAL_001],
            details: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      )
    }

    const {
      name,
      email,
      password,
      phone,
      birthDate,
      cpf,
      favoriteClub,
      consents,
      referredByCode,
      userType,
    } = parsed.data

    // ---------- Display name do clube favorito ----------
    const normalizedFavoriteClub = favoriteClub
      ? normalizeClubTicker(favoriteClub)
      : null

    const favoriteClubDisplayName = normalizedFavoriteClub
      ? CLUB_DISPLAY_NAMES[normalizedFavoriteClub] ?? null
      : null

    // ---------- Unicidade email (REG-002) ----------
    const emailExists = await prisma.user.findUnique({ where: { email } })
    if (emailExists) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.REG_002,
            message: ERROR_MESSAGES[ERROR_CODES.REG_002],
          },
        },
        { status: 409 }
      )
    }

    // ---------- Hash CPF + unicidade (REG-001) ----------
    const cpfHash = hashCPF(cpf)
    const cpfExists = await prisma.user.findFirst({ where: { cpfHash } })
    if (cpfExists) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.REG_001,
            message: ERROR_MESSAGES[ERROR_CODES.REG_001],
          },
        },
        { status: 409 }
      )
    }

    // ---------- Verificacao de idade (FlagCheck / ECA Digital) ----------
    const ageVerification = await verifyAge(cpf, birthDate)
    if (!ageVerification.verified) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.SYS_006,
            message: 'Nao foi possivel concluir a verificacao de maioridade via CPF. Tente novamente.',
          },
        },
        { status: 503 }
      )
    }

    if (!ageVerification.isAdult) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.AGE_001,
            message: ERROR_MESSAGES[ERROR_CODES.AGE_001],
          },
        },
        { status: 400 }
      )
    }

    // ---------- Criar usuario no Supabase Auth ----------
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

    if (authError || !authData.user) {
      console.error('[register] Supabase Auth error:', authError?.message)
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.SYS_001,
            message: ERROR_MESSAGES[ERROR_CODES.SYS_001],
          },
        },
        { status: 500 }
      )
    }

    // ---------- Criar registro na tabela users ----------
    const user = await prisma.user.create({
      data: {
        id: authData.user.id,
        email,
        cpfHash,
        name,
        phone,
        birthDate: new Date(birthDate),
        favoriteClub: normalizedFavoriteClub,
        favoriteClubDisplayName,
        referredByCode: referredByCode ?? null,
        userType: userType ?? 'NORMAL',
        fsBalance: INITIAL_FS_BALANCE,
        ageVerificationPending: !ageVerification.verified,
        tourCompleted: false,
      },
    })

    // ---------- Salvar consentimentos LGPD ----------
    // ConsentPurpose enum: ESSENTIAL, MARKETING, ANALYTICS, DATA_TERCEIROS, AGE_VERIFICATION
    const consentEntries: Array<{ purpose: 'ESSENTIAL' | 'MARKETING' | 'ANALYTICS' | 'DATA_TERCEIROS'; granted: boolean }> = [
      { purpose: 'ESSENTIAL', granted: true }, // essencial + termos de uso — obrigatório
      { purpose: 'MARKETING', granted: consents.marketing ?? false },
      { purpose: 'ANALYTICS', granted: consents.analytics ?? false },
      { purpose: 'DATA_TERCEIROS', granted: consents.thirdParty ?? false },
    ]

    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown'
    const userAgent = request.headers.get('user-agent') ?? 'unknown'

    await prisma.consent.createMany({
      data: consentEntries.map((c) => ({
        userId: user.id,
        purpose: c.purpose,
        granted: c.granted,
        grantedAt: new Date(),
        ipAddress,
        userAgent,
      })),
    })

    // ---------- Sign in para retornar sessao ----------
    const { data: sessionData } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            planType: (user as { planType?: string }).planType ?? 'JOGADOR',
          },
          session: sessionData.session
            ? {
                accessToken: sessionData.session.access_token,
                refreshToken: sessionData.session.refresh_token,
                expiresAt: sessionData.session.expires_at,
              }
            : null,
          requiresOnboarding: true,
          ageVerification: {
            method: ageVerification.method,
            verified: ageVerification.verified,
          },
        },
      },
      { status: 201 }
    )
  } catch (err) {
    // NUNCA logar CPF ou senha
    console.error('[register] Erro interno:', (err as Error).message)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.SYS_001,
          message: ERROR_MESSAGES[ERROR_CODES.SYS_001],
        },
      },
      { status: 500 }
    )
  }
}
