import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { encode } from '@auth/core/jwt'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { serializeUser } from '@/lib/auth'
import { authorizeCredentials } from '@/lib/auth-credentials'
import { getLoginIpRateLimit } from '@/lib/ratelimit'
import { emailNotificationService } from '@/lib/services/EmailNotificationService'
import { getRedisClient } from '@/lib/redis'
import { atomicIncrWithTtl, getCounterStatus } from '@/utils/redisRateLimit'
import { applyRateLimitHeaders, normalizeIp, retryAfterFromReset } from '@/middleware/rateLimit'
import type { RateLimitInfo } from '@/middleware/rateLimit'

const LoginSchema = z.object({
  // ID-NEW-005 (Codex round 3): canonicalizar email para casar com o que o
  // register persiste (trim + lowercase). Sem isso, login com `USER@x.com`
  // falha quando o DB armazenou `user@x.com`.
  email: z
    .string()
    .email()
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1),
})

// ─── Constantes de rate limit de login ───────────────────────────────────────

const LOGIN_FAIL_LIMIT = 5
const LOGIN_WINDOW_SECONDS = 900 // 15 minutos

// JWT Auth.js — alinhar com cookie name de auth.config para derivar access_token
const AUTHJS_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
const AUTHJS_SALT_PROD = '__Secure-authjs.session-token'
const AUTHJS_SALT_DEV = 'authjs.session-token'

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

type LoginPath = 'authjs' | 'fail'

/**
 * Codex P1#3 (2026-05-23): browsers nao precisam do access_token no JSON —
 * o cookie HttpOnly+Secure ja autentica requests subsequentes. Eco-lo no
 * payload abre XSS exfiltration path (atacante com qualquer XSS le o JSON
 * antes do redirect e exfiltra o JWE).
 *
 * Native clients (Expo/iOS/Android) NAO sao browsers — nao podem ler cookies
 * httpOnly e dependem do token no JSON para anexar Authorization: Bearer.
 * Gate via header explicito X-Client: native.
 */
function wantsTokenInBody(request: NextRequest): boolean {
  const xclient = request.headers.get('x-client')?.toLowerCase().trim()
  return xclient === 'native' || xclient === 'mobile' || xclient === 'expo'
}

function maskedToken(jwt: string): string {
  return `${jwt.slice(0, 10)}***${jwt.slice(-4)}`
}

function emitLoginBreadcrumb(path: LoginPath, backfillApplied: boolean): void {
  // Sem PII — apenas o caminho de autenticacao e se houve backfill assincrono.
  Sentry.addBreadcrumb({
    category: 'auth',
    message: 'login_path',
    level: 'info',
    data: { path, backfill_applied: backfillApplied },
  })
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

    // ─── 5. Auth.js path PRIMEIRO (TASK-3 dual-stack) ─────────────────────────
    // authorizeCredentials roda Zod + bcrypt.compare contra Prisma.passwordHash
    // com timing defense. Retorno nullable: null = falha Auth.js (sem hash OR
    // hash invalido OR user nao existe). Caller decide se cabe Supabase fallback.
    const authjsUser = await authorizeCredentials({ email, password })

    let path: LoginPath = 'fail'
    let backfillApplied = false

    if (authjsUser) {
      // ─── 5a. Auth.js path bem-sucedido ──────────────────────────────────────
      path = 'authjs'

      const dbUser = await prisma.user.findUnique({ where: { id: authjsUser.id } })
      if (!dbUser) {
        // Defesa: deletou entre authorize e findUnique. Trata como auth fail.
        path = 'fail'
      } else {
        const salt = process.env.NODE_ENV === 'production' ? AUTHJS_SALT_PROD : AUTHJS_SALT_DEV
        const secret = process.env.AUTH_SECRET
        if (!secret) {
          emitLoginBreadcrumb('fail', false)
          return errors.server()
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

        emitLoginBreadcrumb('authjs', false)

        const expiresAt = Math.floor(Date.now() / 1000) + AUTHJS_SESSION_MAX_AGE_SECONDS
        const echoToken = wantsTokenInBody(request)
        const res = ok({
          user: serializeUser(dbUser),
          session: {
            // Web (default): omite access_token do JSON — cookie HttpOnly basta.
            // Native (X-Client: native): inclui access_token para Bearer auth.
            access_token: echoToken ? access_token : null,
            refresh_token: null,
            expires_at: expiresAt,
            access_token_in_body: echoToken,
          },
          requiresOnboarding: !dbUser.tourCompleted,
        })
        if (!echoToken) {
          // Audit: marca JWE com prefixo+sufixo para correlacionar com logs sem expor o token.
          Sentry.addBreadcrumb({
            category: 'auth',
            message: 'access_token_omitted_from_body',
            level: 'info',
            data: { jwt_fingerprint: maskedToken(access_token) },
          })
        }
        // Tambem seteia o cookie Auth.js para que requests subsequentes
        // funcionem via middleware (mesmo contrato que signIn faria).
        res.cookies.set({
          name: salt,
          value: access_token,
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          secure: process.env.NODE_ENV === 'production',
          maxAge: AUTHJS_SESSION_MAX_AGE_SECONDS,
        })
        applyRateLimitHeaders(res, rlInfo)
        return res
      }
    }

    // Tech debt #33 (2026-05-23): Supabase fallback removido. Apenas Auth.js.
    // Users sem passwordHash devem usar /esqueci-senha (magic link reset).

    // ─── 6. Autenticação falhou: incrementar contador de falhas ───────────────
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

    emitLoginBreadcrumb('fail', false)

    // Mensagem genérica — não revelar se é email ou senha incorreto (SEC)
    const res = NextResponse.json(
      { error: { code: 'AUTH-001', message: 'Credenciais inválidas.' } },
      { status: 401 }
    )
    applyRateLimitHeaders(res, rlInfo)
    return res
  } catch {
    return errors.server()
  }
}
