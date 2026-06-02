// ============================================================================
// FootStock — Rate Limiting centralizado (ioredis sliding window)
// Substitui @upstash/ratelimit — mesma semântica, sem limite de comandos/dia.
// ============================================================================

import { SlidingWindowRateLimiter } from '@/lib/redis'

// ─── Auth ─────────────────────────────────────────────────────────────────────

let _authRL: SlidingWindowRateLimiter | null = null
let _forgotRL: SlidingWindowRateLimiter | null = null
let _webauthnRL: SlidingWindowRateLimiter | null = null
let _registerRL: SlidingWindowRateLimiter | null = null

/** Reset-password / reset geral por IP: 100 req / 5 min */
export function getAuthRateLimit(): SlidingWindowRateLimiter {
  if (!_authRL) _authRL = new SlidingWindowRateLimiter(100, 5 * 60 * 1000, 'rl:auth:reset')
  return _authRL
}

/** Forgot-password: 30 req / 15 min por email+IP */
export function getForgotPasswordRateLimit(): SlidingWindowRateLimiter {
  if (!_forgotRL) _forgotRL = new SlidingWindowRateLimiter(30, 15 * 60 * 1000, 'rl:auth:forgot')
  return _forgotRL
}

/** WebAuthn: 50 req / 1 min por IP ou userId */
export function getWebAuthnRateLimit(): SlidingWindowRateLimiter {
  if (!_webauthnRL) _webauthnRL = new SlidingWindowRateLimiter(50, 60 * 1000, 'rl:auth:webauthn')
  return _webauthnRL
}

/**
 * Registro: 3 req / 1 hora por IP (TASK-026 — brute force protection)
 * Chave Redis: rl:register:{ip}
 */
export function getRegisterRateLimit(): SlidingWindowRateLimiter {
  if (!_registerRL) _registerRL = new SlidingWindowRateLimiter(3, 60 * 60 * 1000, 'rl:register')
  return _registerRL
}

// ─── Login IP pre-check (proteção anti-lockout por terceiros) ─────────────────

let _loginIpRL: SlidingWindowRateLimiter | null = null

/**
 * Login por IP: 20 tentativas / 15 min por IP (camada de defesa adicional).
 * Evita que um atacante bloqueie contas alheias disparando 5 falhas por email.
 * Chave Redis: rl:login:ip:{normalizedIp}
 */
export function getLoginIpRateLimit(): SlidingWindowRateLimiter {
  if (!_loginIpRL) _loginIpRL = new SlidingWindowRateLimiter(20, 15 * 60 * 1000, 'rl:login:ip')
  return _loginIpRL
}

// ─── AI Assessor ──────────────────────────────────────────────────────────────

let _aiAnalyzeRL: SlidingWindowRateLimiter | null = null

/**
 * Assessor IA: 10 req / 1 hora por userId (TASK-026 — controle billing Anthropic)
 * Chave Redis: rl:ai:analyze:{userId}
 */
export function getAIAnalyzeRateLimit(): SlidingWindowRateLimiter {
  if (!_aiAnalyzeRL) _aiAnalyzeRL = new SlidingWindowRateLimiter(10, 60 * 60 * 1000, 'rl:ai:analyze')
  return _aiAnalyzeRL
}

// ─── Orders ───────────────────────────────────────────────────────────────────

let _ordersRL: SlidingWindowRateLimiter | null = null

/**
 * Ordens: 100 req / 60 segundos por userId (TASK-026 — sliding window ZSET)
 * Chave Redis: rl:orders:{userId}
 */
export function getOrdersRateLimit(): SlidingWindowRateLimiter {
  if (!_ordersRL) _ordersRL = new SlidingWindowRateLimiter(100, 60 * 1000, 'rl:orders')
  return _ordersRL
}

// ─── Payments Webhook ─────────────────────────────────────────────────────────

let _webhookRL: SlidingWindowRateLimiter | null = null

/**
 * Webhook de pagamentos: 1000 req / 60 segundos por IP (TASK-026)
 * Alta tolerância para gateway de pagamento.
 * Chave Redis: rl:webhook:{normalizedIp}
 * Verificar assinatura ANTES de contar para rate limit.
 */
export function getWebhookRateLimit(): SlidingWindowRateLimiter {
  if (!_webhookRL) _webhookRL = new SlidingWindowRateLimiter(1000, 60 * 1000, 'rl:webhook')
  return _webhookRL
}

// ─── Checkout ────────────────────────────────────────────────────────────────

let _checkoutRL: SlidingWindowRateLimiter | null = null

/**
 * Checkout de assinatura: 5 req / 5 min por userId.
 * Previne abuso de criação de intents PENDING e cobranças acidentais.
 * Chave Redis: rl:checkout:{userId}
 */
export function getCheckoutRateLimit(): SlidingWindowRateLimiter {
  if (!_checkoutRL) _checkoutRL = new SlidingWindowRateLimiter(5, 5 * 60 * 1000, 'rl:checkout')
  return _checkoutRL
}

// ─── Club ─────────────────────────────────────────────────────────────────────

let _clubLoginRL: SlidingWindowRateLimiter | null = null

/** Club Login: 5 req / 1 min por email (TASK-015 sub-item 2 — rate limiting) */
export function getClubLoginRateLimit(): SlidingWindowRateLimiter {
  if (!_clubLoginRL) _clubLoginRL = new SlidingWindowRateLimiter(5, 60 * 1000, 'rl:club:login')
  return _clubLoginRL
}

// ─── Forum ────────────────────────────────────────────────────────────────────

let _forumPostRL: SlidingWindowRateLimiter | null = null

/**
 * Forum: 10 posts / 1 hora por userId (FDD noticias-comunidade §4.2 — FORUM_060)
 * Chave Redis: rl:forum:post:{userId}
 */
export function getForumPostRateLimit(): SlidingWindowRateLimiter {
  if (!_forumPostRL) _forumPostRL = new SlidingWindowRateLimiter(10, 60 * 60 * 1000, 'rl:forum:post')
  return _forumPostRL
}
