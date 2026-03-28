// ============================================================================
// Foot Stock — Rate Limiter via Redis
// Implementação simples com contador e TTL. Fail-open em caso de erro Redis.
// ============================================================================

import { redisPublisher as redis } from '@/lib/redis'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfter?: number
}

/**
 * Verifica o rate limit por chave (geralmente userId + endpoint).
 * Fail-open: se Redis estiver offline, retorna allowed=true.
 *
 * @param key   Chave do Redis (ex: "ratelimit:assets:userId123")
 * @param max   Máximo de requisições no período
 * @param ttl   Período em segundos (ex: 60)
 */
export async function checkRateLimit(
  key: string,
  max: number,
  ttl: number
): Promise<RateLimitResult> {
  try {
    const current = await redis.incr(key)
    if (current === 1) {
      await redis.expire(key, ttl)
    }
    if (current > max) {
      return { allowed: false, remaining: 0, retryAfter: ttl }
    }
    return { allowed: true, remaining: max - current }
  } catch (err) {
    console.warn('[rateLimit] Redis indisponível, fail-open:', err instanceof Error ? err.message : err)
    return { allowed: true, remaining: max }
  }
}
