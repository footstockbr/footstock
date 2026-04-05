// ============================================================================
// Foot Stock — Rate Limiting centralizado (ioredis sliding window)
// Substitui @upstash/ratelimit — mesma semântica, sem limite de comandos/dia.
// ============================================================================

import { SlidingWindowRateLimiter } from '@/lib/redis'

let _authRL: SlidingWindowRateLimiter | null = null
let _forgotRL: SlidingWindowRateLimiter | null = null
let _webauthnRL: SlidingWindowRateLimiter | null = null
let _registerRL: SlidingWindowRateLimiter | null = null
let _aiAnalyzeRL: SlidingWindowRateLimiter | null = null

// TODO: reduzir limites antes de ir para produção real
/** Login: 100 req / 5 min por IP */
export function getAuthRateLimit(): SlidingWindowRateLimiter {
  if (!_authRL) _authRL = new SlidingWindowRateLimiter(100, 5 * 60 * 1000, 'rl:auth:login')
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

/** Registro: 50 req / 1 hora por IP */
export function getRegisterRateLimit(): SlidingWindowRateLimiter {
  if (!_registerRL) _registerRL = new SlidingWindowRateLimiter(50, 60 * 60 * 1000, 'rl:auth:register')
  return _registerRL
}

/** Assessor IA: 100 req / 1 hora por userId */
export function getAIAnalyzeRateLimit(): SlidingWindowRateLimiter {
  if (!_aiAnalyzeRL) _aiAnalyzeRL = new SlidingWindowRateLimiter(100, 60 * 60 * 1000, 'rl:ai:analyze')
  return _aiAnalyzeRL
}
