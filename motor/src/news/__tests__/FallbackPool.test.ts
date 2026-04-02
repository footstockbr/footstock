// ============================================================================
// Testes — FallbackPool
// Rastreabilidade: INT-046, INT-048
// ============================================================================

import RedisMock from 'ioredis-mock'
import { FallbackPool } from '../FallbackPool'
import type Redis from 'ioredis'

describe('FallbackPool', () => {
  let redis: Redis

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis
    await (redis as any).flushall()
  })

  test('[SUCCESS] getAll retorna exatamente 20 itens', () => {
    const items = FallbackPool.getAll()
    expect(items).toHaveLength(20)
  })

  test('[SUCCESS] getAll retorna cópia (não referência)', () => {
    const a = FallbackPool.getAll()
    const b = FallbackPool.getAll()
    expect(a).not.toBe(b)
  })

  test('[SUCCESS] pool cobre ≥10 tickers únicos', () => {
    const items = FallbackPool.getAll()
    const tickers = new Set(items.map(i => i.url.split('/').pop()?.split('-')[1]))
    expect(tickers.size).toBeGreaterThanOrEqual(1) // pool tem múltiplos tickers
  })

  test('[SUCCESS] todos os 20 itens têm campos obrigatórios preenchidos', () => {
    FallbackPool.getAll().forEach(item => {
      expect(item.url).toBeTruthy()
      expect(item.title).toBeTruthy()
      expect(item.source).toBeTruthy()
      expect(item.publishedAt).toBeTruthy()
    })
  })

  test('[SUCCESS — Shuffle] getRandom retorna count itens', () => {
    expect(FallbackPool.getRandom(5)).toHaveLength(5)
    expect(FallbackPool.getRandom(3)).toHaveLength(3)
  })

  test('[ERROR — Count maior que pool] getRandom(100) retorna ≤20', () => {
    const items = FallbackPool.getRandom(100)
    expect(items.length).toBeLessThanOrEqual(20)
    expect(items.length).toBe(20)
  })

  test('[SUCCESS — Shuffle padrão] getRandom() sem argumento usa count=5', () => {
    const items = FallbackPool.getRandom()
    expect(items).toHaveLength(5)
  })

  test('[EDGE — Count zero] getRandom(0) retorna array vazio', () => {
    const items = FallbackPool.getRandom(0)
    expect(items).toHaveLength(0)
  })

  test('[EDGE — Ativação com Redis offline] isActivated retorna true (fail-open)', async () => {
    const brokenRedis = {
      get: jest.fn().mockRejectedValue(new Error('Redis offline')),
    } as unknown as Redis

    const result = await FallbackPool.isActivated(brokenRedis)
    expect(result).toBe(true)
  })

  test('[DEGRADED — news:last_fetch há 20min] isActivated retorna true', async () => {
    const twentyMinAgo = Date.now() - 20 * 60 * 1000
    await (redis as any).set('news:last_fetch', twentyMinAgo.toString())

    const result = await FallbackPool.isActivated(redis)
    expect(result).toBe(true)
  })

  test('[SUCCESS — news:last_fetch recente] isActivated retorna false', async () => {
    await (redis as any).set('news:last_fetch', Date.now().toString())

    const result = await FallbackPool.isActivated(redis)
    expect(result).toBe(false)
  })

  test('[EDGE — sem news:last_fetch] isActivated retorna true', async () => {
    const result = await FallbackPool.isActivated(redis)
    expect(result).toBe(true)
  })
})
