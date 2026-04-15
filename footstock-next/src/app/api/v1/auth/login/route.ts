import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { serializeUser } from '@/lib/auth'
import { getLoginIpRateLimit } from '@/lib/ratelimit'
import { emailNotificationService } from '@/lib/services/EmailNotificationService'
import { getRedisClient } from '@/lib/redis'
import { atomicIncrWithTtl, getCounterStatus } from '@/utils/redisRateLimit'
import { applyRateLimitHeaders, normalizeIp, retryAfterFromReset } from '@/middleware/rateLimit'
import type { RateLimitInfo } from '@/middleware/rateLimit'

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// ─── Constantes de rate limit de login ───────────────────────────────────────

const LOGIN_FAIL_LIMIT = 5
const LOGIN_WINDOW_SECONDS = 900 // 15 minutos

/** Chave do contador de falhas por email */
function failKey(email: string): string {
  return `rl:login:fail:${email}`
}

/** Chave de bloqueio temporário por email (TTL = 900s) */
function blockedKey(email: string): string {
  return `rl:login:blocked:${email}`
}

/** Constrói RateLimitInfo a partir do contador de falhas */
function buildRlInfo(failCount: number, failTtlSeconds: number): RateLimitInfo {
  return {
    limit: LOGIN_FAIL_LIMIT,
    remaining: Math.max(0, LOGIN_FAIL_LIMIT - failCount),
    resetTimestampSeconds: failTtlSeconds > 0
      ? Math.floor(Date.now() / 1000) + failTtlSeconds
      : 0,
  }
}

export async function POST(request: NextRequest) {
  try {
    // ─── 1. Parse e validação do body ─────────────────────────────────────────
    let rawBody: unknown
    try { rawBody = await request.json() } catch { return errors.validation() }

    const parsed = LoginSchema.safeParse(rawBody)
    if (!parsed.success) return errors.validation()

    const { email, password } = parsed.data

    // ─── 2. Pre-check por IP (proteção anti-lockout por terceiros) ────────────
    // Limita IPs que disparam muitas tentativas antes de verificar o email específico.
    // Sem isso, um atacante poderia bloquear contas alheias enviando 5 falhas/email.
    const rawIp = request.headers.get('x-forwarded-for') ?? '127.0.0.1'
    const ip = normalizeIp(rawIp)

    try {
      const ipResult = await getLoginIpRateLimit().limit(ip)
      if (!ipResult.success) {
        const retryAfter = retryAfterFromReset(ipResult.reset)
        const res = errors.rateLimit(
          'Muitas tentativas de login deste endereço. Aguarde antes de tentar novamente.',
          new Date(ipResult.reset).toISOString()
        )
        applyRateLimitHeaders(
          res,
          { limit: 20, remaining: 0, resetTimestampSeconds: Math.floor(ipResult.reset / 1000) },
          retryAfter
        )
        return res
      }
    } catch {
      // Redis offline — continuar sem bloquear (fail-open para IP pre-check)
    }

    // ─── 3. Leitura do status atual de falhas (para headers em todas as respostas)
    const fk = failKey(email)
    const bk = blockedKey(email)
    const r = getRedisClient()

    let currentFailCount = 0
    let failTtl = 0
    let isBlocked = false
    let blockedTtl = 0

    if (r) {
      try {
        const [rawCount, rawTtl, rawBlockedTtl] = await Promise.all([
          r.get(fk),
          r.ttl(fk),
          r.ttl(bk),
        ])
        currentFailCount = rawCount ? parseInt(String(rawCount), 10) : 0
        failTtl = rawTtl > 0 ? rawTtl : 0
        blockedTtl = rawBlockedTtl
        isBlocked = blockedTtl > 0
      } catch {
        // Redis offline — fail-open
      }
    }

    // ─── 4. Verificar bloqueio ativo ──────────────────────────────────────────
    if (isBlocked) {
      const rlInfo = buildRlInfo(LOGIN_FAIL_LIMIT, blockedTtl)
      const res = errors.rateLimit(
        'Conta temporariamente bloqueada. Tente novamente em 15 minutos.',
        new Date(Date.now() + blockedTtl * 1000).toISOString()
      )
      applyRateLimitHeaders(res, rlInfo, blockedTtl)
      return res
    }

    // Headers base para respostas não bloqueadas
    let rlInfo = buildRlInfo(currentFailCount, failTtl)

    // ─── 5. Tentativa de autenticação via Supabase Auth ───────────────────────
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    })

    // ─── 6. Autenticação falhou: incrementar contador de falhas ───────────────
    if (authError || !authData.session || !authData.user) {
      if (r) {
        try {
          const { count, ttl } = await atomicIncrWithTtl(fk, LOGIN_WINDOW_SECONDS)
          currentFailCount = count
          failTtl = ttl > 0 ? ttl : LOGIN_WINDOW_SECONDS
          rlInfo = buildRlInfo(currentFailCount, failTtl)

          // Threshold atingido: bloquear e notificar
          if (count >= LOGIN_FAIL_LIMIT) {
            await r.set(bk, '1', 'EX', LOGIN_WINDOW_SECONDS)

            emailNotificationService.sendForType('BRUTE_FORCE_BLOCKED', email, {
              title: 'Acesso temporariamente bloqueado',
              body: `Detectamos ${LOGIN_FAIL_LIMIT} tentativas de login falhadas na sua conta. Por segurança, o acesso foi bloqueado por 15 minutos.`,
              ctaLabel: 'Redefinir senha',
              ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://footstock.app'}/esqueci-senha`,
            }).catch((err: unknown) => console.error('[login] Erro ao enviar BRUTE_FORCE_BLOCKED:', err))
          }
        } catch {
          // Redis offline — não incrementar (fail-open)
        }
      }

      // Mensagem genérica — não revelar se é email ou senha incorreto (SEC)
      const res = NextResponse.json(
        { error: { code: 'AUTH_001', message: 'Credenciais inválidas.' } },
        { status: 401 }
      )
      applyRateLimitHeaders(res, rlInfo)
      return res
    }

    // ─── 7. Autenticação bem-sucedida ─────────────────────────────────────────
    // NAO reseta o contador de falhas — janela expira naturalmente (spec §2)
    const dbUser = await prisma.user.findUnique({
      where: { id: authData.user.id },
    })

    if (!dbUser) {
      const res = NextResponse.json(
        { error: { code: 'AUTH_001', message: 'Credenciais inválidas.' } },
        { status: 401 }
      )
      applyRateLimitHeaders(res, rlInfo)
      return res
    }

    const res = ok({
      user: serializeUser(dbUser),
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_at: authData.session.expires_at,
      },
      requiresOnboarding: !dbUser.tourCompleted,
    })
    applyRateLimitHeaders(res, rlInfo)
    return res
  } catch {
    return errors.server()
  }
}
