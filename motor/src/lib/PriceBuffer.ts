import type Redis from 'ioredis'
import { redis as defaultRedis } from './redis'

const KEY = (ticker: string) => `priceBuffer:${ticker}`
const TTL_S = 24 * 3600
const MAX_ENTRIES = 10000

export class PriceBuffer {
  constructor(private redis: Redis = defaultRedis) {}

  async push(ticker: string, price: number, timestamp: number = Date.now()) {
    const k = KEY(ticker)
    const member = JSON.stringify({ p: price, t: timestamp })
    await this.redis.zadd(k, timestamp, member)
    await this.redis.zremrangebyrank(k, 0, -MAX_ENTRIES - 1)
    await this.redis.expire(k, TTL_S)
  }

  async getDelayed(
    ticker: string,
    delayMs: number
  ): Promise<{ price: number; timestamp: number } | null> {
    if (delayMs === 0) {
      const latest = await this.redis.zrevrange(KEY(ticker), 0, 0)
      if (!latest.length) return null
      const { p, t } = JSON.parse(latest[0])
      return { price: p, timestamp: t }
    }
    const cutoff = Date.now() - delayMs
    const range = await this.redis.zrevrangebyscore(
      KEY(ticker),
      cutoff,
      0,
      'LIMIT',
      0,
      1
    )
    if (!range.length) return null
    const { p, t } = JSON.parse(range[0])
    return { price: p, timestamp: t }
  }
}
