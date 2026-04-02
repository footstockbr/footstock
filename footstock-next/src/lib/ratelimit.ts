import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// ─── Lazy Redis factory ────────────────────────────────────────────────────────
// Do NOT call createRedis() at module-evaluation time — it would throw
// during `next build` (static analysis) when env vars are absent.

function createRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    throw new Error(
      '[ratelimit] UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN são obrigatórios. ' +
        'Configure no .env.local antes de usar rate limiting.'
    )
  }

  return new Redis({ url, token })
}

function createRatelimit(limiter: ReturnType<typeof Ratelimit.slidingWindow>, prefix: string) {
  return new Ratelimit({
    redis: createRedis(),
    limiter,
    analytics: true,
    prefix,
  })
}

// ─── Lazy rate limiters (instantiated on first access) ────────────────────────

let _authRateLimit: Ratelimit | null = null
let _forgotPasswordRateLimit: Ratelimit | null = null
let _webAuthnRateLimit: Ratelimit | null = null
let _registerRateLimit: Ratelimit | null = null
let _aiAnalyzeRateLimit: Ratelimit | null = null

/**
 * Rate limiter para login: 10 requisições por 5 minutos por IP.
 * Previne ataques de força bruta.
 */
export function getAuthRateLimit(): Ratelimit {
  if (!_authRateLimit) {
    _authRateLimit = createRatelimit(Ratelimit.slidingWindow(10, '5 m'), 'rl:auth:login')
  }
  return _authRateLimit
}

/**
 * Rate limiter para recuperação de senha: 3 requisições por 15 minutos por email+IP.
 * Previne enumeração de emails e spam.
 */
export function getForgotPasswordRateLimit(): Ratelimit {
  if (!_forgotPasswordRateLimit) {
    _forgotPasswordRateLimit = createRatelimit(Ratelimit.slidingWindow(3, '15 m'), 'rl:auth:forgot')
  }
  return _forgotPasswordRateLimit
}

/**
 * Rate limiter para WebAuthn: 5 requisições por minuto por usuário.
 */
export function getWebAuthnRateLimit(): Ratelimit {
  if (!_webAuthnRateLimit) {
    _webAuthnRateLimit = createRatelimit(Ratelimit.slidingWindow(5, '1 m'), 'rl:auth:webauthn')
  }
  return _webAuthnRateLimit
}

/**
 * Rate limiter para registro: 5 cadastros por hora por IP.
 * Previne criação em massa de contas (AUTH-009).
 */
export function getRegisterRateLimit(): Ratelimit {
  if (!_registerRateLimit) {
    _registerRateLimit = createRatelimit(Ratelimit.slidingWindow(5, '1 h'), 'rl:auth:register')
  }
  return _registerRateLimit
}

/**
 * Rate limiter para Assessor IA: 10 requisições por hora por userId.
 * Aplica-se ao plano Craque. Lenda herda o mesmo limite (custo por req é alto).
 * Conforme INTAKE: máximo 10 req/h/usuário para controle de billing Anthropic.
 */
export function getAIAnalyzeRateLimit(): Ratelimit {
  if (!_aiAnalyzeRateLimit) {
    _aiAnalyzeRateLimit = createRatelimit(Ratelimit.slidingWindow(10, '1 h'), 'rl:ai:analyze')
  }
  return _aiAnalyzeRateLimit
}
