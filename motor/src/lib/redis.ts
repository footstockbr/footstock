import Redis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const REDIS_TLS = process.env.REDIS_TLS === 'true'

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
  ...(REDIS_TLS ? { tls: {} } : {}),
})
