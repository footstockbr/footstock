import RedisMock from 'ioredis-mock'
import type Redis from 'ioredis'
import { PriceBuffer } from '../PriceBuffer'
import type { MarketSnapshot } from '../PriceBuffer'

function makeSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    assetId: 'asset-1',
    ticker: 'PETR4',
    price: 29.0,
    open: 28.5,
    high: 29.5,
    low: 28.0,
    close: 28.5,
    volume: 1_000_000,
    change: 0.5,
    changePercent: 1.75,
    sessionType: 'TRADING',
    timestamp: 1_000_001,
    ofi: 0.12,
    bookPressure: 45_000,
    pendingBuyVolume: 20_000,
    pendingSellVolume: 25_000,
    ...overrides,
  }
}

describe('PriceBuffer', () => {
  let redis: Redis
  let buffer: PriceBuffer

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis
    buffer = new PriceBuffer(redis)
    await (redis as any).flushall()
  })

  afterEach(() => {
    ;(redis as unknown as { disconnect: () => void }).disconnect()
  })

  test('[SUCCESS] push + getDelayed(0) retorna snapshot completo mais recente', async () => {
    const older = makeSnapshot({ price: 28.5, timestamp: 1_000_000 })
    const latest = makeSnapshot({ price: 29.0, timestamp: 1_000_001 })
    await buffer.push('PETR4', older)
    await buffer.push('PETR4', latest)
    const result = await buffer.getDelayed('PETR4', 0)
    expect(result).toEqual(latest)
  })

  test('[SUCCESS] push multiplos + getDelayed retorna snapshot anterior ao cutoff', async () => {
    const now = Date.now()
    const oldSnapshot = makeSnapshot({ price: 28.0, timestamp: now - 120_000 })
    const midSnapshot = makeSnapshot({ price: 28.5, timestamp: now - 60_000 })
    const latestSnapshot = makeSnapshot({ price: 29.0, timestamp: now })
    await buffer.push('PETR4', oldSnapshot)
    await buffer.push('PETR4', midSnapshot)
    await buffer.push('PETR4', latestSnapshot)
    const result = await buffer.getDelayed('PETR4', 90_000)
    expect(result).toEqual(oldSnapshot)
  })

  test('[SUCCESS] getDelayed(0) preserva OHLCV, OFI, book e volumes pendentes', async () => {
    const snapshot = makeSnapshot()
    await buffer.push('PETR4', snapshot)
    const result = await buffer.getDelayed('PETR4', 0)
    expect(result).toMatchObject({
      price: 29.0,
      open: 28.5,
      high: 29.5,
      low: 28.0,
      close: 28.5,
      volume: 1_000_000,
      change: 0.5,
      changePercent: 1.75,
      ofi: 0.12,
      bookPressure: 45_000,
      pendingBuyVolume: 20_000,
      pendingSellVolume: 25_000,
    })
  })

  test('[SUCCESS] ticker vazio retorna null', async () => {
    const result = await buffer.getDelayed('UNKNOWN', 0)
    expect(result).toBeNull()
  })

  test('[SUCCESS] TTL é aplicado (key existe após push)', async () => {
    await buffer.push('PETR4', makeSnapshot())
    const ttl = await redis.ttl('priceBuffer:PETR4')
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(24 * 3600)
  })

  test('[SUCCESS] fallback v1 compatível converte preço/timestamp para snapshot mínimo', async () => {
    await redis.zadd('priceBuffer:PETR4', 1_000_000, JSON.stringify({ p: 28.5, t: 1_000_000 }))
    const result = await buffer.getDelayed('PETR4', 0)
    expect(result).toMatchObject({
      price: 28.5,
      open: 28.5,
      high: 28.5,
      low: 28.5,
      close: 28.5,
      timestamp: 1_000_000,
    })
  })
})
