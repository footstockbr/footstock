// ============================================================================
// Foot Stock — AIRateLimiter Tests (module-21/TASK-1/ST001)
// Cobre: check (allow/block), getStatus, fail-open e reset de janela
// ============================================================================

import { AIRateLimiter } from './AIRateLimiter'

// ─── Mock: @/lib/redis ───────────────────────────────────────────────────────

jest.mock('@/lib/redis', () => ({
  redisPublisher: {
    incr:   jest.fn(),
    expire: jest.fn(),
    decr:   jest.fn(),
    ttl:    jest.fn(),
    get:    jest.fn(),
  },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { redisPublisher: mockRedis } = require('@/lib/redis')

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FIXED_NOW = 1_700_000_000_000 // ms
const FIXED_TTL = 3600

function setupRedisForCount(count: number) {
  mockRedis.incr.mockResolvedValue(count)
  mockRedis.expire.mockResolvedValue(1)
  mockRedis.decr.mockResolvedValue(count - 1)
  mockRedis.ttl.mockResolvedValue(FIXED_TTL)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AIRateLimiter.check', () => {
  let limiter: AIRateLimiter
  const userId = 'user-test-1'

  beforeEach(() => {
    limiter = new AIRateLimiter()
    jest.clearAllMocks()
    jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // ── 10 chamadas → todas allowed=true, remaining decrementa ────────────────

  test('primeiras 10 chamadas retornam allowed=true com remaining correto', async () => {
    for (let i = 1; i <= 10; i++) {
      setupRedisForCount(i)

      const result = await limiter.check(userId)

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(10 - i)
    }

    // 10 chamadas ao incr
    expect(mockRedis.incr).toHaveBeenCalledTimes(10)
    // expire só é chamado na primeira (count === 1)
    expect(mockRedis.expire).toHaveBeenCalledTimes(1)
  })

  // ── 11ª chamada → allowed=false, decr chamado ─────────────────────────────

  test('11ª chamada retorna allowed=false e chama decr para não desperdiçar contagem', async () => {
    setupRedisForCount(11) // count > MAX_REQUESTS_PER_HOUR (10)

    const result = await limiter.check(userId)

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(mockRedis.decr).toHaveBeenCalledWith(`ai:rate:${userId}`)
    expect(mockRedis.decr).toHaveBeenCalledTimes(1)
  })

  // ── 11ª chamada → resetAt calculado corretamente ─────────────────────────

  test('allowed=false → resetAt = Date.now() + ttl * 1000', async () => {
    setupRedisForCount(11)

    const result = await limiter.check(userId)

    expect(result.resetAt).toBe(FIXED_NOW + FIXED_TTL * 1000)
  })

  // ── TTL expirado (ttl = -2 ou 0) → usa WINDOW_SECONDS como fallback ───────

  test('TTL expirado (ttl <= 0): usa WINDOW_SECONDS como resetAt', async () => {
    mockRedis.incr.mockResolvedValue(1)
    mockRedis.expire.mockResolvedValue(1)
    mockRedis.ttl.mockResolvedValue(-2) // chave sem TTL
    mockRedis.decr.mockResolvedValue(0)

    const result = await limiter.check(userId)

    // ttl <= 0 → fallback usa WINDOW_SECONDS (3600)
    expect(result.resetAt).toBe(FIXED_NOW + 3600 * 1000)
  })

  // ── Redis indisponível → fail-open ────────────────────────────────────────

  test('Redis indisponível: retorna allowed=true (fail-open)', async () => {
    mockRedis.incr.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await limiter.check(userId)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(10)
    expect(result.resetAt).toBe(0)
  })
})

// ─── getStatus ───────────────────────────────────────────────────────────────

describe('AIRateLimiter.getStatus', () => {
  let limiter: AIRateLimiter
  const userId = 'user-test-2'

  beforeEach(() => {
    limiter = new AIRateLimiter()
    jest.clearAllMocks()
    jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('getStatus não chama incr — apenas get e ttl', async () => {
    mockRedis.get.mockResolvedValue('5')
    mockRedis.ttl.mockResolvedValue(1800)

    await limiter.getStatus(userId)

    expect(mockRedis.incr).not.toHaveBeenCalled()
    expect(mockRedis.get).toHaveBeenCalledWith(`ai:rate:${userId}`)
    expect(mockRedis.ttl).toHaveBeenCalledWith(`ai:rate:${userId}`)
  })

  test('getStatus com count=5 → remaining=5, allowed=true', async () => {
    mockRedis.get.mockResolvedValue('5')
    mockRedis.ttl.mockResolvedValue(1800)

    const result = await limiter.getStatus(userId)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(5)
    expect(result.resetAt).toBe(0) // remaining > 0 → resetAt = 0
  })

  test('getStatus com count=10 → remaining=0, allowed=false, resetAt calculado', async () => {
    mockRedis.get.mockResolvedValue('10')
    mockRedis.ttl.mockResolvedValue(FIXED_TTL)

    const result = await limiter.getStatus(userId)

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.resetAt).toBe(FIXED_NOW + FIXED_TTL * 1000)
  })

  test('getStatus com chave inexistente (get null) → remaining=10, allowed=true', async () => {
    mockRedis.get.mockResolvedValue(null)
    mockRedis.ttl.mockResolvedValue(-2)

    const result = await limiter.getStatus(userId)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(10)
  })

  test('Redis indisponível em getStatus → fail-open', async () => {
    mockRedis.get.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await limiter.getStatus(userId)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(10)
    expect(result.resetAt).toBe(0)
  })
})
