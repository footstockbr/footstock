// ============================================================================
// Foot Stock — AIRateLimiter (module-21/TASK-1/ST001)
// Rate limiting por userId via Redis INCR + TTL (10 req/hora)
// Padrão idêntico ao forumRateLimit — fail-open quando Redis indisponível
// ============================================================================

import { redisPublisher as redis } from '@/lib/redis'
import type { AIRateLimitStatus } from '@/lib/types/ai'

const MAX_REQUESTS_PER_HOUR = 10
const WINDOW_SECONDS = 3600

/**
 * Gerencia o rate limit do Assessor IA por userId.
 * Chave Redis: ai:rate:{userId}
 * Limite: 10 req/hora. Token bucket simplificado (INCR + TTL).
 */
export class AIRateLimiter {
  /**
   * Verifica e incrementa o counter de rate limit.
   * Se allowed=false, decrementa o counter de volta (não desperdiça a contagem).
   */
  async check(userId: string): Promise<AIRateLimitStatus> {
    const key = `ai:rate:${userId}`

    try {
      const count = await redis.incr(key)
      if (count === 1) {
        await redis.expire(key, WINDOW_SECONDS)
      }

      const ttl = await redis.ttl(key)
      const resetAt = Date.now() + (ttl > 0 ? ttl : WINDOW_SECONDS) * 1000

      if (count > MAX_REQUESTS_PER_HOUR) {
        // Não consome a contagem quando bloqueado
        await redis.decr(key)
        return { allowed: false, remaining: 0, resetAt }
      }

      return {
        allowed: true,
        remaining: Math.max(0, MAX_REQUESTS_PER_HOUR - count),
        resetAt,
      }
    } catch {
      // Redis indisponível — fail-open (não bloqueia usuário por falha de infra)
      console.error('[AIRateLimiter] Redis indisponível — fail-open para userId:', userId)
      return {
        allowed: true,
        remaining: MAX_REQUESTS_PER_HOUR,
        resetAt: 0,
      }
    }
  }

  /**
   * Retorna o status atual sem incrementar (para o RateLimitBadge).
   */
  async getStatus(userId: string): Promise<AIRateLimitStatus> {
    const key = `ai:rate:${userId}`

    try {
      const countRaw = await redis.get(key)
      const count = countRaw ? parseInt(String(countRaw), 10) : 0
      const ttl = await redis.ttl(key)
      const resetAt = Date.now() + (ttl > 0 ? ttl : WINDOW_SECONDS) * 1000
      const remaining = Math.max(0, MAX_REQUESTS_PER_HOUR - count)

      return {
        allowed: count < MAX_REQUESTS_PER_HOUR,
        remaining,
        resetAt: remaining === 0 ? resetAt : 0,
      }
    } catch {
      return { allowed: true, remaining: MAX_REQUESTS_PER_HOUR, resetAt: 0 }
    }
  }
}

export const aiRateLimiter = new AIRateLimiter()
