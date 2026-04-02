// ============================================================================
// Foot Stock — Forum Rate Limit (30 posts/hora por userId via Redis)
// Fonte: module-18/TASK-1/ST007
// Distinto da Regra 5 de auto-moderação (5/hora, configurável por SuperAdmin)
// ============================================================================

import { redisPublisher as redis } from '@/lib/redis'

const FORUM_RATE_LIMIT_MAX = 30
const FORUM_RATE_LIMIT_WINDOW = 3600 // 1 hora em segundos

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetInSeconds: number
}

/**
 * Verifica e incrementa o rate limit de criação de posts do fórum.
 * Chave Redis: forum:ratelimit:{userId}
 * Limite: 30 posts por hora. Retorna allowed=false quando excedido.
 * Código de erro: RATE_001
 */
export async function checkForumRateLimit(userId: string): Promise<RateLimitResult> {
  const key = `forum:ratelimit:${userId}`

  try {
    // INCR-first atômico: evita race condition do GET→check→INCR
    const count = await redis.incr(key)
    if (count === 1) {
      await redis.expire(key, FORUM_RATE_LIMIT_WINDOW)
    }

    if (count > FORUM_RATE_LIMIT_MAX) {
      const ttl = await redis.ttl(key)
      return {
        allowed: false,
        remaining: 0,
        resetInSeconds: ttl > 0 ? ttl : FORUM_RATE_LIMIT_WINDOW,
      }
    }

    return {
      allowed: true,
      remaining: FORUM_RATE_LIMIT_MAX - count,
      resetInSeconds: 0,
    }
  } catch {
    // Redis indisponível — permitir por segurança (fail-open)
    return { allowed: true, remaining: FORUM_RATE_LIMIT_MAX, resetInSeconds: FORUM_RATE_LIMIT_WINDOW }
  }
}
