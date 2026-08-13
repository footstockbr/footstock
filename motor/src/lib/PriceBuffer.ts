import type Redis from 'ioredis'
import { redis as defaultRedis } from './redis'
import type { MotorTick } from '../types/motor.types'

const KEY = (ticker: string) => `priceBuffer:${ticker}`
const TTL_S = 24 * 3600
const MAX_ENTRIES = 10000

export type MarketSnapshot = MotorTick

interface BufferEntryV2 {
  v: 2
  snapshot: MarketSnapshot
  t: number
}

interface BufferEntryV1 {
  p: number
  t: number
}

type BufferEntry = BufferEntryV2 | BufferEntryV1

function isV1(entry: BufferEntry): entry is BufferEntryV1 {
  return 'p' in entry && !('v' in entry)
}

function parseMember(member: string): MarketSnapshot | null {
  try {
    const entry = JSON.parse(member) as BufferEntry
    if (isV1(entry)) {
      // Fallback de compatibilidade: v1 só armazenava preço/timestamp.
      return {
        assetId: '',
        ticker: '',
        price: entry.p,
        open: entry.p,
        high: entry.p,
        low: entry.p,
        close: entry.p,
        volume: 0,
        change: 0,
        changePercent: 0,
        sessionType: 'TRADING',
        timestamp: entry.t,
      }
    }
    return entry.snapshot
  } catch {
    return null
  }
}

export class PriceBuffer {
  constructor(private redis: Redis = defaultRedis) {}

  async push(
    ticker: string,
    snapshot: MarketSnapshot,
    timestamp: number = snapshot.timestamp ?? Date.now()
  ) {
    const k = KEY(ticker)
    const member = JSON.stringify({ v: 2, snapshot, t: timestamp })
    await this.redis.zadd(k, timestamp, member)
    await this.redis.zremrangebyrank(k, 0, -MAX_ENTRIES - 1)
    await this.redis.expire(k, TTL_S)
  }

  async getDelayed(
    ticker: string,
    delayMs: number
  ): Promise<MarketSnapshot | null> {
    if (delayMs === 0) {
      const latest = await this.redis.zrevrange(KEY(ticker), 0, 0)
      if (!latest.length) return null
      return parseMember(latest[0])
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
    return parseMember(range[0])
  }
}
