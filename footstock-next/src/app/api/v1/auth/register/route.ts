import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ConsentPurpose } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { registerSchema } from '@/lib/schemas/auth.schema'
import { hashCPF } from '@/lib/utils/crypto'
import { verifyAge, verifyAgeWithFlagCheck } from '@/lib/services/age-verification'
import { getRegisterRateLimit } from '@/lib/ratelimit'
import { CLUB_DISPLAY_NAMES } from '@/lib/constants/clubs'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'
import { generateUniqueAffiliateCode } from '@/lib/utils/affiliate-code-gen'
import { sendNotification } from '@/lib/services/NotificationService'
import { NOTIFICATION_TYPE } from '@/lib/enums'
import { applyRateLimitHeaders, normalizeIp, msToResetSeconds, retryAfterFromReset } from '@/middleware/rateLimit'
import type { RateLimitInfo } from '@/middleware/rateLimit'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'

// FS$ concedidos ao referrer a cada cadastro com código válido
const REFERRAL_SIGNUP_REWARD = 100

export async function POST(req: NextRequest) {
  let supabaseUserId: string | null = null
  let prismaCommitted = false // flag: não compensar Supabase se DB já commitou

  // ── Rate limiting (TASK-026 — 3 req / 1 hora por IP) ─────────────────────────
  const rawIp = req.headers.get('x-forwarded-for') ?? '127.0.0.1'
  const ip = normalizeIp(rawIp)

  // Captura info de rl para headers em TODAS as respostas (não apenas 429)
  let rlInfo: RateLimitInfo = { limit: 3, remaining: 3, resetTimestampSeconds: 0 }

  try {
    const rlResult = await getRegisterRateLimit().limit(ip)
    rlInfo = {
      limit: 3,
      remaining: rlResult.remaining,
      resetTimestampSeconds: msToResetSeconds(rlResult.reset),
    }

    if (!rlResult.success) {
      const retryAfter = retryAfterFromReset(rlResult.reset)
      const res = NextResponse.json(
        { error: { code: 'RATE_001', message: 'Limite de cadastros atingido. Tente novamente em 1 hora.' } },
        { status: 429 }
      )
      applyRateLimitHeaders(res, rlInfo, retryAfter)
      return res
    }
  } catch {
    // Rate limiter indisponível (Redis offline) — fail-open
  }

  try {
    const body = await req.json()

    // ── Validação de schema (VAL-001) ─────────────────────────────────────────
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      const res = NextResponse.json(
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
      applyRateLimitHeaders(res, rlInfo)
      return res
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
      const res = NextResponse.json(
        { success: false, error: { code: ERROR_CODES.AUTH_004, message: ERROR_MESSAGES['AUTH-004'] } },
        { status: 409 }
      )
      applyRateLimitHeaders(res, rlInfo)
      return res
    }

    // ── 2. Hash do CPF e verificar unicidade (AUTH-003) ───────────────────────
    const cpfHash = hashCPF(cpf)
    const cpfExists = await prisma.user.findFirst({ where: { cpfHash } })
    if (cpfExists) {
      const res = NextResponse.json(
        { success: false, error: { code: ERROR_CODES.AUTH_003, message: ERROR_MESSAGES['AUTH-003'] } },
        { status: 409 }
      )
      applyRateLimitHeaders(res, rlInfo)
      return res
    }

    // ── 3. Verificar maioridade por data de nascimento declarada (VAL-002) ──────
    const basicAgeCheck = verifyAge(birthDate)
    if (!basicAgeCheck.isAdult) {
      const res = NextResponse.json(
        { success: false, error: { code: ERROR_CODES.VAL_002, message: ERROR_MESSAGES['VAL-002'] } },
        { status: 400 }
      )
      applyRateLimitHeaders(res, rlInfo)
      return res
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
      const res = NextResponse.json(
        { success: false, error: { code: ERROR_CODES.SYS_001, message: ERROR_MESSAGES['SYS-001'] } },
        { status: 500 }
      )
      applyRateLimitHeaders(res, rlInfo)
      return res
    }

    supabaseUserId = authData.user.id

    // ── 4b. FlagCheck — verificação de maioridade via CPF (T-023) ─────────────
    const flagCheckResult = await verifyAgeWithFlagCheck(cpf, birthDate)

    if (!flagCheckResult.isAdult) {
      // EVT-004: Verificacao de Idade Bloqueada
      mixpanelServer.track(supabaseUserId, 'age_verification_blocked', {
        verification_method: flagCheckResult.method === 'flagcheck' ? 'flagcheck' : 'dob_calculation',
        step: 1,
      })
      await supabase.auth.admin.deleteUser(supabaseUserId)
      const res = NextResponse.json(
        { success: false, error: { code: ERROR_CODES.AUTH_011, message: ERROR_MESSAGES['AUTH-011'] } },
        { status: 403 }
      )
      applyRateLimitHeaders(res, rlInfo)
      return res
    }

    const isAgePending = flagCheckResult.pending

    // ── 5. Pré-gerar código de afiliado para o novo usuário ───────────────────
    const newAffiliateCode = await generateUniqueAffiliateCode(name, async (code) => {
      const existing = await prisma.affiliateCode.findUnique({ where: { code } })
      return !!existing
    })

    // ── 6. Saga Prisma: tudo numa única transaction ───────────────────────────
    const user = await prisma.$transaction(async (tx) => {
      // 6a. Validar referral DENTRO da transaction (evita race condition T7)
      let referrerAffiliateCodeId: string | null = null
      let referrerUserId: string | null = null
      if (referredByCode) {
        const affiliateRecord = await tx.affiliateCode.findFirst({
          where: { code: referredByCode, active: true },
          select: { id: true, userId: true },
        })
        if (affiliateRecord) {
          referrerAffiliateCodeId = affiliateRecord.id
          referrerUserId = affiliateRecord.userId
        }
      }

      // 6b. Criar User
      const newUser = await tx.user.create({
        data: {
          id: supabaseUserId!,
          email,
          cpfHash,
          name,
          phone,
          birthDate: new Date(birthDate),
          favoriteClub,
          favoriteClubDisplayName,
          userType: userType ?? 'NORMAL',
          referredByCode: referrerAffiliateCodeId ? referredByCode : null,
          investorProfile: 'INICIANTE',
          ageVerificationPending: isAgePending,
          tourCompleted: false,
        },
      })

      // 6b2. Registrar verificação de idade (T-023)
      await tx.ageVerification.create({
        data: {
          userId: newUser.id,
          cpfHash,
          isAdult: true,
          method: flagCheckResult.method === 'flagcheck' ? 'FLAGCHECK' : 'AUTODECLARATION',
          verifiedAt: new Date(),
        },
      })

      // 6c. Auto-criar AffiliateCode para o novo usuário (afiliado universal)
      await tx.affiliateCode.create({
        data: {
          userId: newUser.id,
          code: newAffiliateCode,
          affiliateType: 'USER',
          commissionPercentage: 0,
          active: true,
        },
      })

      // 6d. Criar consentimentos LGPD
      const consentRecords: { userId: string; purpose: ConsentPurpose }[] = [
        { userId: newUser.id, purpose: 'ESSENTIAL' as ConsentPurpose },
      ]
      if (consents.marketing) consentRecords.push({ userId: newUser.id, purpose: 'MARKETING' as ConsentPurpose })
      if (consents.analytics) consentRecords.push({ userId: newUser.id, purpose: 'ANALYTICS' as ConsentPurpose })
      if (consents.thirdParty) consentRecords.push({ userId: newUser.id, purpose: 'DATA_TERCEIROS' as ConsentPurpose })
      consentRecords.push({ userId: newUser.id, purpose: 'AGE_VERIFICATION' as ConsentPurpose })
      await tx.consent.createMany({ data: consentRecords })

      // 6e. Processar recompensa de referral (anti-self, anti-duplo, atômico)
      if (referrerAffiliateCodeId && referrerUserId && referrerUserId !== newUser.id) {
        const existingSignup = await tx.affiliateTransaction.findFirst({
          where: { referredUserId: newUser.id, transactionType: 'SIGNUP' },
        })
        if (!existingSignup) {
          const now = new Date()
          await tx.affiliateTransaction.create({
            data: {
              affiliateCodeId: referrerAffiliateCodeId,
              referredUserId: newUser.id,
              transactionType: 'SIGNUP',
              amount: REFERRAL_SIGNUP_REWARD,
              status: 'PAID',
              paidAt: now,
            },
          })
          await tx.user.update({
            where: { id: referrerUserId },
            data: { fsBalance: { increment: REFERRAL_SIGNUP_REWARD } },
          })
        }
      }

      return newUser
    })

    prismaCommitted = true

    // EVT-003: Cadastro Concluido (server-side)
    const hasAnalyticsConsent = consents.analytics === true
    mixpanelServer.trackWithConsentCheck(
      user.id,
      'signup_completed',
      {
        age_verified: !isAgePending,
        age_verification_method: flagCheckResult.method === 'flagcheck' ? 'flagcheck' : 'self_declaration_fallback',
      },
      hasAnalyticsConsent
    )

    // EVT-040: Cadastro via Afiliado Concluido (se aplicavel)
    if (referredByCode && user.referredByCode) {
      mixpanelServer.trackWithConsentCheck(
        user.id,
        'affiliate_signup_completed',
        {
          affiliateCode: referredByCode,
          affiliateType: 'INFLUENCIADOR',
          referredUserId: user.id,
        },
        hasAnalyticsConsent
      )
    }

    // ── 6f. Notificação AFFILIATE_INVITE_JOINED ───────────────────────────────
    if (user.referredByCode) {
      const referrer = await prisma.affiliateCode.findFirst({
        where: {
          code: user.referredByCode,
          active: true,
          affiliateType: { in: ['TIME_PARCEIRO', 'INFLUENCIADOR'] },
        },
        select: { userId: true },
      })
      if (referrer && referrer.userId !== user.id) {
        sendNotification(
          referrer.userId,
          NOTIFICATION_TYPE.AFFILIATE_INVITE_JOINED,
          {
            title: 'Novo indicado!',
            body: 'Um novo usuário se cadastrou usando seu link de indicação.',
            metadata: { referredUserId: user.id, rewardFs: REFERRAL_SIGNUP_REWARD },
          }
        ).catch((notifErr: unknown) => console.error('[register] Falha ao notificar afiliado:', notifErr))
      }
    }

    // ── 6g. Notificação REFERRAL_JOINED ──────────────────────────────────────
    if (user.referredByCode) {
      sendNotification(
        user.id,
        NOTIFICATION_TYPE.REFERRAL_JOINED,
        {
          title: 'Bem-vindo ao FootStock!',
          body: 'Você se cadastrou via indicação e recebeu bônus de boas-vindas. Explore o mercado!',
          metadata: { referralCode: user.referredByCode },
        }
      ).catch((notifErr: unknown) => console.error('[register] Falha ao notificar REFERRAL_JOINED:', notifErr))
    }

    // ── 6h. Notificação de verificação pendente (T-023) ──────────────────────
    if (isAgePending) {
      sendNotification(
        user.id,
        NOTIFICATION_TYPE.AGE_VERIFICATION_PENDING,
        {
          title: 'Verificação de maioridade em andamento',
          body: 'Sua verificação de maioridade está sendo processada. Algumas funcionalidades estarão restritas até a conclusão.',
        }
      ).catch((notifErr: unknown) => console.error('[register] Falha ao notificar AGE_VERIFICATION_PENDING:', notifErr))
    }

    // ── 7. Sessão inicial ─────────────────────────────────────────────────────
    const { data: sessionData } = await supabase.auth.signInWithPassword({ email, password })

    const res = NextResponse.json(
      {
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            planType: user.planType,
            affiliateCode: newAffiliateCode,
          },
          session: sessionData.session
            ? {
                access_token: sessionData.session.access_token,
                refresh_token: sessionData.session.refresh_token,
              }
            : null,
          requiresOnboarding: true,
          ageVerification: {
            method: flagCheckResult.method,
            verified: flagCheckResult.verified,
            pending: isAgePending,
          },
        },
      },
      { status: 201 }
    )
    applyRateLimitHeaders(res, rlInfo)
    return res
  } catch (err) {
    console.error('[register] Erro interno:', (err as Error).message)

    if (supabaseUserId && !prismaCommitted) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        await supabase.auth.admin.deleteUser(supabaseUserId)
        console.info('[register] Compensação: usuário Supabase removido após falha Prisma', supabaseUserId)
      } catch (compensationErr) {
        console.error('[register] CRÍTICO: falha na compensação Supabase:', (compensationErr as Error).message)
      }
    }

    const res = NextResponse.json(
      { success: false, error: { code: ERROR_CODES.SYS_001, message: ERROR_MESSAGES['SYS-001'] } },
      { status: 500 }
    )
    applyRateLimitHeaders(res, rlInfo)
    return res
  }
}
