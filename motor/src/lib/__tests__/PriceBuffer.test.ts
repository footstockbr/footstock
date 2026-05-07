import RedisMock from 'ioredis-mock'
import type Redis from 'ioredis'
import { PriceBuffer } from '../PriceBuffer'

describe('PriceBuffer', () => {
  let redis: Redis
  let buffer: PriceBuffer

  beforeEach(() => {
    redis = new RedisMock() as unknown as Redis
    buffer = new PriceBuffer(redis)
  })

  afterEach(() => {
    ;(redis as unknown as { disconnect: () => void }).disconnect()
  })

  test('[SUCCESS] push + getDelayed(0) retorna latest', async () => {
    await buffer.push('PETR4', 28.5, 1_000_000)
    await buffer.push('PETR4', 29.0, 1_000_001)
    const result = await buffer.getDelayed('PETR4', 0)
    expect(result).toEqual({ price: 29.0, timestamp: 1_000_001 })
  })

  test('[SUCCESS] push multiplos + getDelayed retorna anterior ao cutoff', async () => {
    const now = Date.now()
    await buffer.push('PETR4', 28.0, now - 120_000)
    await buffer.push('PETR4', 28.5, now - 60_000)
    await buffer.push('PETR4', 29.0, now)
    const result = await buffer.getDelayed('PETR4', 90_000)
    expect(result).toEqual({ price: 28.0, timestamp: now - 120_000 })
  })

  test('[SUCCESS] ticker vazio retorna null', async () => {
    const result = await buffer.getDelayed('UNKNOWN', 0)
    expect(result).toBeNull()
  })

  test('[SUCCESS] TTL é aplicado (key existe após push)', async () => {
    await buffer.push('PETR4', 30.0)
    const ttl = await redis.ttl('priceBuffer:PETR4')
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(24 * 3600)
  })
})
