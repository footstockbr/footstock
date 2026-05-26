import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { ConsentPurpose, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getRedisClient } from '@/lib/redis'
import { registerSchema } from '@/lib/schemas/auth.schema'
import { hashCPF } from '@/lib/utils/crypto'
import { verifyAge } from '@/lib/services/age-verification'
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

// bcrypt cost factor — alinhado com authorizeCredentials (src/lib/auth-credentials.ts).
// Trocar aqui exige bump coordenado para preservar timing defense.
const BCRYPT_ROUNDS = 12

// 60-char dummy bcrypt-shaped string. Espelha DUMMY_HASH de
// src/lib/auth-credentials.ts: mesmo shape e cost factor para que o
// bcrypt.compare execute o mesmo trabalho dos paths "novo usuario", fechando
// timing leak entre "email/cpf existe" e "novo cadastro" (ID-001 do Codex).
const DUMMY_HASH = '$2a$12$' + '.'.repeat(53)

// Quantas vezes regerar o codigo de afiliado antes de desistir. Cobre o
// caso raro de colisao com afiliados ja existentes (ID-006 do Codex).
const AFFILIATE_CODE_RETRY = 5

// TTL do reservation lock (ID-005 do Codex). Suficiente para bcrypt(12) +
// transaction. Apos isso o lock expira automaticamente mesmo em crash.
// Acquire via SET NX EX.
const REGISTRATION_LOCK_TTL_SECONDS = 60

// CAS release (ID-NEW-006 Codex round 3): so deleta a chave SE o valor bater
// com o token desta requisicao. Sem isso, request A apos TTL overrun roda
// `del()` na lock que ja pertence a request B. Token aleatorio via
// randomUUID() + KEYS[1]/ARGV[1].
const LOCK_RELEASE_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`

async function acquireRegistrationLock(key: string): Promise<{ acquired: boolean; release: () => Promise<void> }> {
  const r = getRedisClient()
  if (!r) {
    // Pre-gate Redis acima ja deveria ter retornado 503. Best-effort no-op
    // mantido apenas para defesa em profundidade — nao deve ser hit em prod.
    return { acquired: true, release: async () => {} }
  }
  const lockKey = `reg:lock:${key}`
  const token = randomUUID()
  // 'NX' + 'EX' = SET if Not eXists with EXpiry. ioredis assinatura:
  //   set(key, value, expiryMode, time, setMode)
  const result = await r.set(lockKey, token, 'EX', REGISTRATION_LOCK_TTL_SECONDS, 'NX')
  if (result !== 'OK') return { acquired: false, release: async () => {} }
  return {
    acquired: true,
    release: async () => {
      try {
        await r.eval(LOCK_RELEASE_LUA, 1, lockKey, token)
      } catch {
        /* expira sozinho via TTL */
      }
    },
  }
}

export async function POST(req: NextRequest) {
  // ── Rate limiting (TASK-026 — 3 req / 1 hora por IP) ─────────────────────────
  const rawIp = req.headers.get('x-forwarded-for') ?? '127.0.0.1'
  const ip = normalizeIp(rawIp)

  // Captura info de rl para headers em TODAS as respostas (não apenas 429)
  let rlInfo: RateLimitInfo = { limit: 3, remaining: 3, resetTimestampSeconds: 0 }

  // ID-003 v3 (Codex round 3): PING real, nao apenas presence-check. O
  // getRedisClient() pode retornar um objeto cliente cujo Redis subjacente
  // esta offline; nesse caso SlidingWindowRateLimiter.limit() pegaria o erro
  // de comando no try/catch interno e retornaria success:true (fail-open).
  // PING explicito quebra esse caminho: se o servidor nao responde, 503.
  try {
    const r = getRedisClient()
    if (!r) throw new Error('redis client null')
    const pong = await r.ping()
    if (pong !== 'PONG') throw new Error(`unexpected ping reply: ${pong}`)
  } catch (pingErr) {
    console.error('[register] Redis ping falhou (rate-limiter fail-closed):', (pingErr as Error).message)
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.SYS_001, message: 'Servico de cadastro temporariamente indisponivel. Tente novamente em instantes.' } },
      { status: 503 },
    )
  }

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
  } catch (rlErr) {
    // Rate limiter indisponivel (Redis offline) — fail-CLOSED em cadastro.
    // Sem o limiter, atacante pode driblar 3/hr e consumir bcrypt.
    // ID-003 do Codex review. Login mantem fail-open porque ja tem outras
    // defesas (counters por email); register nao tem fallback equivalente.
    console.error('[register] rate limiter indisponivel (fail-closed):', (rlErr as Error).message)
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.SYS_001, message: 'Servico de cadastro temporariamente indisponivel. Tente novamente em instantes.' } },
      { status: 503 },
    )
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
      referredByCode,
    } = parsed.data

    // ── 1. Verificar unicidade de email ───────────────────────────────────────
    // Reversao parcial de P1-Codex#1 (2026-05-26): retornamos AUTH-004 (email)
    // e AUTH-003 (CPF) em vez do AUTH-013 generico. Decisao UX-first: cliente
    // ja recebia mensagem opaca ("Verifique e tente novamente") e nao sabia
    // que precisava ir para login. /recuperar-senha ja vaza existencia de
    // conta no fluxo de reset, entao manter generico aqui era defesa parcial.
    // Timing defense (dummy bcrypt) e log mascarado de IP permanecem.
    const emailExists = await prisma.user.findUnique({ where: { email } })
    if (emailExists) {
      // Timing defense (ID-001): equaliza com o path de sucesso, que faz
      // bcrypt.hash(password, 12). Sem este compare o atacante mede a
      // latencia para enumerar emails cadastrados.
      await bcrypt.compare(password, DUMMY_HASH).catch(() => false)
      console.info('[register] conflict pre_check', { reason: 'email_exists', ip })
      const res = NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.AUTH_004,
            message: ERROR_MESSAGES['AUTH-004'],
            meta: { reason: 'email', suggestion: 'login', emailHint: email },
          },
        },
        { status: 409 }
      )
      applyRateLimitHeaders(res, rlInfo)
      return res
    }

    // ── 2. Hash do CPF e verificar unicidade ──────────────────────────────────
    const cpfHash = hashCPF(cpf)
    const cpfExists = await prisma.user.findFirst({ where: { cpfHash } })
    if (cpfExists) {
      await bcrypt.compare(password, DUMMY_HASH).catch(() => false)
      console.info('[register] conflict pre_check', { reason: 'cpf_exists', ip })
      const res = NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.AUTH_003,
            message: ERROR_MESSAGES['AUTH-003'],
            meta: { reason: 'cpf', suggestion: 'login' },
          },
        },
        { status: 409 }
      )
      applyRateLimitHeaders(res, rlInfo)
      return res
    }

    // ── 3. Verificar maioridade por data de nascimento declarada (VAL-002) ──────
    // Modelo atual: autodeclaração (confirmação do usuário). Menor declarado é
    // bloqueado aqui, antes de qualquer escrita no Prisma.
    const basicAgeCheck = verifyAge(birthDate)
    if (!basicAgeCheck.isAdult) {
      // EVT-004: Verificacao de Idade Bloqueada — UUID aleatorio (sem derivacao de CPF).
      mixpanelServer.track(`anon-${randomUUID()}`, 'age_verification_blocked', {
        verification_method: 'dob_calculation',
        step: 1,
      })
      const res = NextResponse.json(
        { success: false, error: { code: ERROR_CODES.VAL_002, message: ERROR_MESSAGES['VAL-002'] } },
        { status: 400 }
      )
      applyRateLimitHeaders(res, rlInfo)
      return res
    }

    // ── 3a-lock. Reservation locks (ID-005 + ID-NEW-003) ─────────────────────
    // Antes do bcrypt(12) + transaction, adquire DOIS locks Redis: um em email
    // (normalizado) e outro em cpfHash. Fecha duas janelas de race:
    //  (a) mesmo CPF + emails diferentes (so 1 vence email-uniq, mas todos
    //      gastavam bcrypt antes do lock CPF + email);
    //  (b) mesmo email + CPFs diferentes (mesma logica simetrica).
    // Ordem fixa email -> cpf evita deadlock entre pares (A,B) e (B,A).
    const emailKey = email.trim().toLowerCase()
    const lockEmail = await acquireRegistrationLock(`email:${emailKey}`)
    if (!lockEmail.acquired) {
      await bcrypt.compare(password, DUMMY_HASH).catch(() => false)
      console.info('[register] conflict lock', { reason: 'email_lock_held', ip })
      const res = NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.AUTH_004,
            message: ERROR_MESSAGES['AUTH-004'],
            meta: { reason: 'email', suggestion: 'login', emailHint: email },
          },
        },
        { status: 409 },
      )
      applyRateLimitHeaders(res, rlInfo)
      return res
    }
    const lockCpf = await acquireRegistrationLock(`cpf:${cpfHash}`)
    if (!lockCpf.acquired) {
      // Solta o lock de email ja adquirido antes de retornar (ID-005 self-heal
      // via TTL cobre, mas explicit release evita stale window de 60s).
      await lockEmail.release()
      await bcrypt.compare(password, DUMMY_HASH).catch(() => false)
      console.info('[register] conflict lock', { reason: 'cpf_lock_held', ip })
      const res = NextResponse.json(
        {
          success: false,
          error: {
            code: ERROR_CODES.AUTH_003,
            message: ERROR_MESSAGES['AUTH-003'],
            meta: { reason: 'cpf', suggestion: 'login' },
          },
        },
        { status: 409 },
      )
      applyRateLimitHeaders(res, rlInfo)
      return res
    }

    try {

    // ── 3c. Resolver favoriteClubDisplayName via constante local ─────────────
    const favoriteClubDisplayName = CLUB_DISPLAY_NAMES[favoriteClub] ?? null

    // ── 4. Hash da senha (bcrypt) ─────────────────────────────────────────────
    // Auth.js v5 Credentials provider compara via bcrypt em src/lib/auth-credentials.ts.
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

    // ── 5. Pré-gerar código de afiliado para o novo usuário ───────────────────
    // ID-006: generate-then-create e TOCTOU. Tratamos colisao via retry com
    // reseed (ate AFFILIATE_CODE_RETRY tentativas). A unicidade DEFINITIVA
    // continua sendo a constraint do banco (P2002 capturado abaixo).
    let newAffiliateCode = await generateUniqueAffiliateCode(name, async (code) => {
      const existing = await prisma.affiliateCode.findUnique({ where: { code } })
      return !!existing
    })

    // ── 6. Saga Prisma: tudo numa única transaction com retry de colisao ──────
    // ID-009 (Codex): isolation level Serializable fecha a janela onde dois
    // requests concorrentes com mesmo `referredByCode` leem `active: true` e
    // ambos creditam SIGNUP. Combinado com a uniqueness implicita (P2002 em
    // email/cpf) + retry-loop externo, garante creditacao exatamente-uma-vez.
    const runRegistrationTx = async () => prisma.$transaction(async (tx) => {
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

      // 6b. Criar User — ID gerado por Prisma cuid (default no schema).
      const newUser = await tx.user.create({
        data: {
          email,
          cpfHash,
          name,
          phone,
          birthDate: new Date(birthDate),
          favoriteClub,
          favoriteClubDisplayName,
          // ID-NEW-002: userType e SEMPRE NORMAL no fluxo publico. Promocao
          // para TIME_PARCEIRO/INFLUENCIADOR e admin-side (rota separada).
          userType: 'NORMAL',
          planType: 'JOGADOR',
          passwordHash,
          referredByCode: referrerAffiliateCodeId ? referredByCode : null,
          investorProfile: 'INICIANTE',
          tourCompleted: false,
        },
      })

      // 6b2. Registrar verificação de idade (T-023) — autodeclaração
      await tx.ageVerification.create({
        data: {
          userId: newUser.id,
          cpfHash,
          isAdult: true,
          method: 'AUTODECLARATION',
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    let user: Awaited<ReturnType<typeof runRegistrationTx>>
    let attempt = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt++
      try {
        user = await runRegistrationTx()
        break
      } catch (txErr) {
        // ID-009 (Codex): Serializable pode levantar 40001 (Postgres
        // serialization_failure). Prisma surface-a como P2034 ou
        // PrismaClientUnknownRequestError. Retry ate AFFILIATE_CODE_RETRY
        // (mesmo cap usado para colisao de codigo) — eventos raros, sem
        // backoff (transaction inteira ja pagou bcrypt(12) so 1x).
        if (
          txErr instanceof Prisma.PrismaClientKnownRequestError &&
          (txErr.code === 'P2034' || (txErr.meta?.code === '40001'))
        ) {
          if (attempt < AFFILIATE_CODE_RETRY) continue
          throw txErr
        }
        if (
          txErr instanceof Prisma.PrismaClientKnownRequestError &&
          txErr.code === 'P2002'
        ) {
          const target = (txErr.meta?.target as string[] | string | undefined) ?? ''
          const targetStr = Array.isArray(target) ? target.join(',') : target

          // Colisao no codigo de afiliado: regera e retenta (ID-006).
          if (targetStr.includes('code') && attempt < AFFILIATE_CODE_RETRY) {
            newAffiliateCode = await generateUniqueAffiliateCode(name, async (code) => {
              const existing = await prisma.affiliateCode.findUnique({ where: { code } })
              return !!existing
            })
            continue
          }

          // Colisao em email/cpfHash: outro request venceu a race (ID-002).
          // Retorna 409 controlado em vez de 500. Pre-checks ja deram dummy
          // bcrypt, mas em race o path agora gastou bcrypt.hash real;
          // aceitavel pois e evento raro (apenas concorrencia). Codigo unificado
          // AUTH-013 para nao re-introduzir o enum (P1-Codex#1).
          if (targetStr.includes('email')) {
            console.info('[register] conflict race', { reason: 'email_race_loss', ip })
            const res = NextResponse.json(
              {
                success: false,
                error: {
                  code: ERROR_CODES.AUTH_004,
                  message: ERROR_MESSAGES['AUTH-004'],
                  meta: { reason: 'email', suggestion: 'login', emailHint: email },
                },
              },
              { status: 409 },
            )
            applyRateLimitHeaders(res, rlInfo)
            return res
          }
          if (targetStr.includes('cpf')) {
            console.info('[register] conflict race', { reason: 'cpf_race_loss', ip })
            const res = NextResponse.json(
              {
                success: false,
                error: {
                  code: ERROR_CODES.AUTH_003,
                  message: ERROR_MESSAGES['AUTH-003'],
                  meta: { reason: 'cpf', suggestion: 'login' },
                },
              },
              { status: 409 },
            )
            applyRateLimitHeaders(res, rlInfo)
            return res
          }
        }
        throw txErr
      }
    }

    // EVT-003: Cadastro Concluido (server-side)
    const hasAnalyticsConsent = consents.analytics === true
    mixpanelServer.trackWithConsentCheck(
      user.id,
      'signup_completed',
      {
        age_verified: true,
        age_verification_method: 'self_declaration',
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

    // ── 7. Resposta (sem sessao) ──────────────────────────────────────────────
    // Frontend faz signIn via /api/v1/auth/login (mesmo path do login-form), que
    // chama authorizeCredentials -> bcrypt.compare -> setCookie Auth.js v5.
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
          requiresOnboarding: true,
        },
      },
      { status: 201 }
    )
    applyRateLimitHeaders(res, rlInfo)
    return res

    } finally {
      // ID-005 / ID-NEW-003: libera ambos os locks (email + cpf) independe de
      // sucesso/erro. Em crash, TTL Redis garante self-heal. Ordem reversa
      // da aquisicao para simetria (cpf -> email).
      await lockCpf.release()
      await lockEmail.release()
    }
  } catch (err) {
    console.error('[register] Erro interno:', (err as Error).message)
    const res = NextResponse.json(
      { success: false, error: { code: ERROR_CODES.SYS_001, message: ERROR_MESSAGES['SYS-001'] } },
      { status: 500 }
    )
    applyRateLimitHeaders(res, rlInfo)
    return res
  }
}
