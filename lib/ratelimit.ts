// ============================================================================
// Foot Stock — Rate Limiting centralizado (@upstash/ratelimit)
// ============================================================================

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

function createRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN são obrigatórios em produção para rate limiting.'
      )
    }
    return null
  }
  return new Redis({ url, token })
}

const redis = createRedisClient()

/** Rate limiter para login: 5 req / 15 min por IP (spec HLD/LLD) */
export const authRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '15 m'),
      analytics: true,
      prefix: 'ratelimit:auth:login',
    })
  : null

/** Rate limiter para forgot-password: 3 req / 15 min por email+IP */
export const forgotPasswordRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, '15 m'),
      analytics: true,
      prefix: 'ratelimit:auth:forgot',
    })
  : null

/** Rate limiter para reset-password: 5 req / 15 min por IP */
export const resetPasswordRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '15 m'),
      analytics: true,
      prefix: 'ratelimit:auth:reset',
    })
  : null

/** Rate limiter para registro: 5 req / 1 hora por IP */
export const registerRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '1 h'),
      analytics: true,
      prefix: 'ratelimit:auth:register',
    })
  : null

/** Rate limiter para webhooks de pagamento: 100 req / 1 min por IP (PCI-DSS req. 5 / PAYMENT_055) */
export const webhookRateLimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, '1 m'),
      analytics: true,
      prefix: 'ratelimit:webhook',
    })
  : null
