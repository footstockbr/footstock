// ============================================================================
// Foot Stock — Redis Rate Limit Utilities (TASK-026)
// Padrão sliding window + atomic INCR helper.
// A implementação principal (SlidingWindowRateLimiter) vive em src/lib/redis.ts.
// ============================================================================

export { SlidingWindowRateLimiter, getRedisClient } from '@/lib/redis'
export type { RateLimitResult } from '@/lib/redis'

import { getRedisClient } from '@/lib/redis'

// ─── Lua: INCR atômico com EXPIRE condicional ─────────────────────────────────
// Evita a race condition TOCTOU do padrão ingênuo INCR + EXPIRE separados:
// dois processos concorrentes poderiam ambos ver count=0 e apenas um setaria TTL,
// deixando o outro sem expiração → chave eterna.
// Aqui: EXPIRE só é chamado quando count==1 (primeira inserção), garantindo atomicidade.

const ATOMIC_INCR_LUA = `
local key   = KEYS[1]
local ttl   = tonumber(ARGV[1])
local count = redis.call('INCR', key)
if count == 1 then
  redis.call('EXPIRE', key, ttl)
end
local remaining_ttl = redis.call('TTL', key)
return {count, remaining_ttl}
`

export interface AtomicIncrResult {
  count: number
  /** TTL restante em segundos (-1 se sem expiração, -2 se chave não existe) */
  ttl: number
}

/**
 * INCR atômico com EXPIRE apenas no primeiro incremento.
 * Seguro para uso concorrente — sem race condition.
 *
 * @param key       Chave Redis (ex: "rl:login:fail:user@example.com")
 * @param ttlSeconds TTL a aplicar APENAS na primeira inserção
 * @returns { count, ttl } — count=0 e ttl=ttlSeconds quando Redis indisponível (fail-open)
 */
export async function atomicIncrWithTtl(
  key: string,
  ttlSeconds: number
): Promise<AtomicIncrResult> {
  const r = getRedisClient()
  if (!r) return { count: 0, ttl: ttlSeconds }

  try {
    const result = (await r.eval(
      ATOMIC_INCR_LUA,
      1,
      key,
      String(ttlSeconds)
    )) as [number, number]
    return { count: result[0], ttl: result[1] }
  } catch {
    // Redis indisponível — fail-open (não bloqueia usuário por falha de infra)
    return { count: 0, ttl: ttlSeconds }
  }
}

/**
 * Lê o contador atual e TTL sem incrementar (para headers em respostas de sucesso).
 * Fail-open: retorna { count: 0, ttl: 0 } quando Redis indisponível.
 */
export async function getCounterStatus(key: string): Promise<AtomicIncrResult> {
  const r = getRedisClient()
  if (!r) return { count: 0, ttl: 0 }

  try {
    const [rawCount, ttl] = await Promise.all([
      r.get(key),
      r.ttl(key),
    ])
    return {
      count: rawCount ? parseInt(String(rawCount), 10) : 0,
      ttl: ttl > 0 ? ttl : 0,
    }
  } catch {
    return { count: 0, ttl: 0 }
  }
}
