// ============================================================================
// Foot Stock — Redis Client (footstock-next)
// Substitui @upstash/redis: usa ioredis com conexão persistente.
// Resiliente a cold starts em ambiente serverless (Vercel).
// ============================================================================

import Redis from 'ioredis'

// ─── Singleton com detecção de conexão morta ─────────────────────────────────

const _global = globalThis as unknown as { _redisClientFN: Redis | undefined }

/**
 * Opções de conexão alinhadas com o motor (Railway).
 * Diferenças críticas vs. versão anterior:
 *   - retryStrategy: tenta 10x (~13s) em vez de 2x (matava a conexão permanentemente)
 *   - enableReadyCheck: true (aguarda PING antes de aceitar comandos)
 *   - maxRetriesPerRequest: 3 (tolerância a falhas transientes por request)
 */
function buildRedisOptions(): Redis['options'] {
  return {
    maxRetriesPerRequest: 3,
    connectTimeout: 5_000,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times) => {
      if (times > 10) return null // desiste após ~13s de tentativas
      return Math.min(times * 300, 2_000)
    },
  }
}

/**
 * Verifica se a instância Redis está em estado terminal (desconectada sem
 * possibilidade de reconexão). Isso acontece quando retryStrategy retorna null
 * e o ioredis entra em status 'end'.
 */
function isDeadConnection(redis: Redis): boolean {
  return redis.status === 'end' || redis.status === 'close'
}

export function getRedisClient(): Redis | null {
  if (!process.env.REDIS_URL) return null

  // Se singleton existe mas morreu (retryStrategy esgotou), descarta e recria
  if (_global._redisClientFN && isDeadConnection(_global._redisClientFN)) {
    _global._redisClientFN.disconnect()
    _global._redisClientFN = undefined
  }

  if (!_global._redisClientFN) {
    _global._redisClientFN = new Redis(process.env.REDIS_URL, buildRedisOptions())
    _global._redisClientFN.on('error', (err: Error) => {
      if (process.env.NODE_ENV !== 'test') {
        console.error('[redis:footstock-next] error:', err.message)
      }
    })
    if (process.env.NODE_ENV !== 'test') {
      _global._redisClientFN.on('ready', () => {
        console.log('[redis:footstock-next] connected')
      })
      _global._redisClientFN.on('reconnecting', () => {
        console.log('[redis:footstock-next] reconnecting...')
      })
    }
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
  return new Redis(process.env.REDIS_URL, buildRedisOptions())
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

  /** Consulta o status atual sem incrementar o contador. */
  async peek(identifier: string): Promise<RateLimitResult> {
    const r = getRedisClient()
    if (!r) return { success: true, remaining: this.limitCount, reset: 0 }

    const key = `${this.prefix}:${identifier}`
    const now = Date.now()
    const windowStart = now - this.windowMs

    try {
      await r.zremrangebyscore(key, '-inf', String(windowStart))
      const count = await r.zcard(key)
      const remaining = Math.max(0, this.limitCount - count)

      if (count >= this.limitCount) {
        const oldest = await r.zrange(key, 0, 0, 'WITHSCORES')
        const resetAt = oldest.length >= 2
          ? Math.ceil(Number(oldest[1]) + this.windowMs)
          : now + this.windowMs
        return { success: false, remaining: 0, reset: resetAt }
      }

      return { success: true, remaining, reset: 0 }
    } catch {
      return { success: true, remaining: this.limitCount, reset: 0 }
    }
  }
}
