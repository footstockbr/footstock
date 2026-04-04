// ============================================================================
// Foot Stock — Redis Client Singleton (Next.js app)
// Usado pelo SSE endpoint e pelos serviços que precisam de pub/sub.
// ============================================================================

import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

// ---------------------------------------------------------------------------
// Publisher (comandos normais + PUBLISH)
// ---------------------------------------------------------------------------

const globalForRedis = globalThis as unknown as {
  redisPublisher: Redis | undefined
}

function createPublisher(): Redis {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000,
    enableReadyCheck: false,
    lazyConnect: false,
    retryStrategy: (times) => (times > 2 ? null : Math.min(times * 300, 1_000)),
  })
  client.on('error', err => {
    console.error('[redis:publisher] Erro:', err.message)
  })
  return client
}

export const redisPublisher: Redis =
  globalForRedis.redisPublisher ?? createPublisher()

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redisPublisher = redisPublisher
}

// ---------------------------------------------------------------------------
// Factory de Subscriber (cada subscriber precisa de conexão própria)
// ---------------------------------------------------------------------------

/**
 * Cria um novo cliente Redis para uso como SUBSCRIBER.
 * Deve ser fechado após uso (não compartilhar entre requests).
 *
 * Uso:
 *   const sub = createSubscriber()
 *   sub.subscribe('market:tick')
 *   sub.on('message', (channel, message) => { ... })
 *   // No cleanup: sub.quit()
 */
export function createSubscriber(): Redis {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 3_000,
    enableReadyCheck: false,
    lazyConnect: false,
    retryStrategy: (times) => (times > 2 ? null : Math.min(times * 300, 1_000)),
  })
}

export const REDIS_CHANNELS = {
  MARKET_TICK: 'market:tick',
  MOTOR_CONTROL: 'motor:control',
  NEWS_INJECT: 'news:inject',
} as const

export type RedisChannel = (typeof REDIS_CHANNELS)[keyof typeof REDIS_CHANNELS]
