// ============================================================================
// Foot Stock — Redis Client (footstock-next)
// Substitui @upstash/redis: usa ioredis com conexão persistente.
// ============================================================================

import Redis from 'ioredis'

// ─── Singleton ────────────────────────────────────────────────────────────────

// Usar globalThis para sobreviver a HMR em dev e evitar múltiplas instâncias.
const _global = globalThis as unknown as { _redisClientFN: Redis | undefined }

export function getRedisClient(): Redis | null {
  if (!process.env.REDIS_URL) return null
  if (!_global._redisClientFN) {
    _global._redisClientFN = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
      enableReadyCheck: false,
      lazyConnect: false,
      retryStrategy: (times) => (times > 2 ? null : Math.min(times * 300, 1_000)),
    })
    _global._redisClientFN.on('error', (err: Error) => {
      if (process.env.NODE_ENV !== 'test') {
        console.error('[redis:footstock-next] error:', err.message)
      }
    })
  }
  return _global._redisClientFN
}

// ─── Aliases para compatibilidade com código legado ──────────────────────────

/**
 * Alias de compatibilidade: retorna a instância Redis singleton.
 * Módulos legados importam `redisPublisher` para operações get/set/publish etc.
 * Quando REDIS_URL não está configurada, retorna um proxy no-op (fail-open).
 */
const _noopProxy = new Proxy({} as Redis, {
  get: (_target, prop) => {
    if (prop === 'then') return undefined // não é uma Promise
    return (..._args: unknown[]) => Promise.resolve(null)
  },
})
export const redisPublisher: Redis = getRedisClient() ?? _noopProxy

/** Cria um subscriber Redis dedicado (conexão separada). */
export function createSubscriber(): Redis | null {
  if (!process.env.REDIS_URL) return null
  return new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000,
    enableReadyCheck: false,
    lazyConnect: false,
    retryStrategy: (times) => (times > 2 ? null : Math.min(times * 300, 1_000)),
  })
}

/** Canais Redis utilizados para pub/sub. */
export const REDIS_CHANNELS = {
  MARKET_TICK: 'market:tick',
  NEWS_FEED: 'news:feed',
  ADMIN_BROADCAST: 'admin:broadcast',
  ASSET_HALT: 'asset:halt',
  ORDER_BOOK: 'order:book',
  MOTOR_CONTROL: 'motor:control',
  NEWS_INJECT: 'news:inject',
} as const

// ─── JSON helpers ─────────────────────────────────────────────────────────────

export async function redisGetJSON<T>(key: string): Promise<T | null> {
  const r = getRedisClient()
  if (!r) return null
  try {
    const raw = await r.get(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export async function redisSetJSON<T>(key: string, value: T, exSeconds: number): Promise<void> {
  const r = getRedisClient()
  if (!r) return
  try {
    await r.set(key, JSON.stringify(value), 'EX', exSeconds)
  } catch { /* ignora */ }
}

// ─── Sliding window rate limiter ──────────────────────────────────────────────
// Algoritmo idêntico ao @upstash/ratelimit.slidingWindow:
// ZSET com timestamp como score; entradas fora da janela são removidas atomicamente.

const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local windowStart = now - window
redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
local count = redis.call('ZCARD', key)
if count < limit then
  local seqKey = key .. ':s'
  local id = redis.call('INCR', seqKey)
  redis.call('ZADD', key, now, tostring(id))
  redis.call('PEXPIRE', key, window + 1000)
  redis.call('PEXPIRE', seqKey, window + 1000)
  return {1, limit - count - 1, 0}
else
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  if oldest and #oldest >= 2 then
    return {0, 0, math.ceil(tonumber(oldest[2]) + window)}
  end
  return {0, 0, now + window}
end
`

export interface RateLimitResult {
  success: boolean
  remaining: number
  reset: number // timestamp ms quando o limite reseta
}

export class SlidingWindowRateLimiter {
  constructor(
    private readonly limitCount: number,
    private readonly windowMs: number,
    private readonly prefix: string
  ) {}

  async limit(identifier: string): Promise<RateLimitResult> {
    const r = getRedisClient()
    // Fail-open: Redis offline não bloqueia usuário
    if (!r) return { success: true, remaining: this.limitCount, reset: 0 }

    const key = `${this.prefix}:${identifier}`
    const now = Date.now()

    try {
      const result = (await r.eval(
        SLIDING_WINDOW_LUA,
        1,
        key,
        String(now),
        String(this.windowMs),
        String(this.limitCount)
      )) as [number, number, number]

      return {
        success: result[0] === 1,
        remaining: result[1],
        reset: result[2] || now + this.windowMs,
      }
    } catch {
      return { success: true, remaining: this.limitCount, reset: 0 }
    }
  }
}
