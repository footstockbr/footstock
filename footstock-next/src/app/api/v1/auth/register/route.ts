import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { registerSchema } from '@/lib/schemas/auth.schema'
import { hashCPF } from '@/lib/utils/crypto'
import { verifyAge } from '@/lib/services/age-verification'
import { getRegisterRateLimit } from '@/lib/ratelimit'
import { CLUB_DISPLAY_NAMES } from '@/lib/constants/clubs'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'

export async function POST(req: NextRequest) {
  try {
    // ── Rate limiting (AUTH-009) ──────────────────────────────────────────────
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
    const { success: withinLimit } = await getRegisterRateLimit().limit(ip)
    if (!withinLimit) {
      return NextResponse.json(
        { success: false, error: { code: ERROR_CODES.AUTH_009, message: ERROR_MESSAGES['AUTH-009'] } },
        { status: 429 }
      )
    }

    const body = await req.json()

    // ── Validação de schema (VAL-001) ─────────────────────────────────────────
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.VAL_001,
            message: ERROR_MESSAGES['VAL-001'],
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
      userType,
      referredByCode,
    } = parsed.data

    // ── 1. Verificar unicidade de email (AUTH-004) ────────────────────────────
    const emailExists = await prisma.user.findUnique({ where: { email } })
    if (emailExists) {
      return NextResponse.json(
        { success: false, error: { code: ERROR_CODES.AUTH_004, message: ERROR_MESSAGES['AUTH-004'] } },
        { status: 409 }
      )
    }

    // ── 2. Hash do CPF e verificar unicidade (AUTH-003) ───────────────────────
    const cpfHash = hashCPF(cpf)
    const cpfExists = await prisma.user.findFirst({ where: { cpfHash } })
    if (cpfExists) {
      return NextResponse.json(
        { success: false, error: { code: ERROR_CODES.AUTH_003, message: ERROR_MESSAGES['AUTH-003'] } },
        { status: 409 }
      )
    }

    // ── 3. Verificar maioridade via FlagCheck (VAL-002) ───────────────────────
    const ageVerification = await verifyAge(cpf, birthDate)
    if (!ageVerification.isAdult) {
      return NextResponse.json(
        { success: false, error: { code: ERROR_CODES.VAL_002, message: ERROR_MESSAGES['VAL-002'] } },
        { status: 400 }
      )
    }

    // ── 3b. Validar referredByCode (silencioso se inválido) ───────────────────
    let validReferralCode: string | null = null
    if (referredByCode) {
      const affiliate = await prisma.affiliateCode.findFirst({
        where: { code: referredByCode, active: true },
      })
      if (affiliate) validReferralCode = referredByCode
    }

    // ── 3c. Resolver favoriteClubDisplayName via constante local ─────────────
    const favoriteClubDisplayName = CLUB_DISPLAY_NAMES[favoriteClub] ?? null

    // ── 4. Criar usuário no Supabase Auth ─────────────────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError || !authData.user) {
      console.error('[register] Supabase Auth error:', authError?.message)
      return NextResponse.json(
        { success: false, error: { code: ERROR_CODES.SYS_001, message: ERROR_MESSAGES['SYS-001'] } },
        { status: 500 }
      )
    }

    // ── 5. Criar registro no PostgreSQL via Prisma ────────────────────────────
    const user = await prisma.user.create({
      data: {
        id: authData.user.id,
        email,
        cpfHash,
        name,
        phone,
        birthDate: new Date(birthDate),
        favoriteClub,
        favoriteClubDisplayName,
        userType: userType ?? 'NORMAL',
        referredByCode: validReferralCode,
        investorProfile: 'INICIANTE',
        ageVerificationPending: !ageVerification.verified,
        tourCompleted: false,
      },
    })

    // ── 6. Salvar consentimentos LGPD (US-026) ────────────────────────────────
    // Cria registros apenas para consentimentos concedidos.
    // TERMS sempre verdadeiro (validado pelo schema). Opcionais só se marcados.
    const consentRecords: { userId: string; purpose: string }[] = [
      { userId: user.id, purpose: 'TERMS' },
    ]
    if (consents.marketing) consentRecords.push({ userId: user.id, purpose: 'MARKETING' })
    if (consents.analytics) consentRecords.push({ userId: user.id, purpose: 'ANALYTICS' })
    if (consents.thirdParty) consentRecords.push({ userId: user.id, purpose: 'THIRD_PARTY' })

    await prisma.consent.createMany({ data: consentRecords })

    // ── 7. Sessão inicial ─────────────────────────────────────────────────────
    const { data: sessionData } = await supabase.auth.signInWithPassword({ email, password })

    return NextResponse.json(
      {
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            planType: user.planType,
          },
          session: sessionData.session
            ? {
                access_token: sessionData.session.access_token,
                refresh_token: sessionData.session.refresh_token,
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
    console.error('[register] Erro interno:', (err as Error).message)
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.SYS_001, message: ERROR_MESSAGES['SYS-001'] } },
      { status: 500 }
    )
  }
}
