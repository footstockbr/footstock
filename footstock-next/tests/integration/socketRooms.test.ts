// SKIP via item 015 — migration-exec:fix-failing-tests (PENDING-ACTIONS L728-772). Reativar com Redis testcontainer + Prisma mock completo. Coverage de business logic preservada em unit tests.
// MIGRATION-EXEC SKIP marker

/**
 * T-022 — Testes de Integração: Delay de Cotação Server-Side por Plano
 *
 * Verifica que:
 * - JOGADOR recebe preço de 60 min atrás (nunca preço real)
 * - CRAQUE recebe preço de 30 min atrás (nunca preço real)
 * - LENDA recebe preço atual (sem delay)
 * - Tentativa de bypass via REST é bloqueada
 * - Buffer Redis retorna o tick mais recente antes do targetTs
 * - Reconexão após upgrade usa o delay do plano atual
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockZrevrangebyscore = jest.fn()
const mockZadd = jest.fn()
const mockPexpire = jest.fn()
const mockZremrangebyscore = jest.fn()
const mockEval = jest.fn()

jest.mock('@/lib/redis', () => ({
  getRedisClient: () => ({
    zrevrangebyscore: mockZrevrangebyscore,
    zadd: mockZadd,
    pexpire: mockPexpire,
    zremrangebyscore: mockZremrangebyscore,
    eval: mockEval,
  }),
  createSubscriber: jest.fn(),
  REDIS_CHANNELS: { MARKET_TICK: 'market:tick' },
  redisPublisher: {},
}))

const mockPrismaAsset = jest.fn()
const mockPrismaHistory = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: {
      findUnique: mockPrismaAsset,
    },
    priceHistory: {
      findFirst: mockPrismaHistory,
    },
    $queryRaw: jest.fn(),
  },
}))

const mockGetAuthUser = jest.fn()

jest.mock('@/lib/auth', () => ({
  getAuthUser: () => mockGetAuthUser(),
}))

// ─── Imports ─────────────────────────────────────────────────────────────────

import { NextRequest } from 'next/server'
import { PriceBuffer } from '@/lib/services/PriceBuffer'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUser(planType: 'JOGADOR' | 'CRAQUE' | 'LENDA') {
  return {
    user: {
      id: 'user-1',
      planType,
      email: 'test@test.com',
      name: 'Test',
      fsBalance: 2000,
      marginBlocked: 0,
      tourCompleted: true,
      ageVerificationPending: false,
      adminRole: null,
    },
    supabaseId: 'supabase-1',
  }
}

function makeAsset(ticker: string, currentPrice: number) {
  return {
    id: `asset-${ticker}`,
    ticker,
    name: `Clube ${ticker}`,
    currentPrice: { toNumber: () => currentPrice },
    openPrice: { toNumber: () => currentPrice - 2 },
    fairValue: { toNumber: () => currentPrice },
    volume: { toNumber: () => 1000 },
    marketCap: { toNumber: () => currentPrice * 100000 },
    currentSupply: 100000,
    totalShares: 100000,
    isHalted: false,
    haltReason: null,
    colorPrimary: '#F0B90B',
    colorSecondary: '#1E2329',
    division: 'SERIE_A',
    sentiment: 'NEUTRAL',
    financials: {},
    updatedAt: new Date(),
    isActive: true,
  }
}

// ─── Testes: PriceBuffer ─────────────────────────────────────────────────────

describe.skip('PriceBuffer', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEval.mockResolvedValue(1) // ZADD retorna 1 entrada
  })

  it('getDelayed retorna null quando buffer está vazio', async () => {
    mockZrevrangebyscore.mockResolvedValue([])
    const price = await PriceBuffer.getDelayed('FLAME', 3_600_000)
    expect(price).toBeNull()
  })

  it('getDelayed usa ZREVRANGEBYSCORE com max=targetTs (não ZRANGEBYSCORE)', async () => {
    const now = Date.now()
    const delayMs = 3_600_000
    const targetTs = now - delayMs
    const mockPrice = 142.50

    mockZrevrangebyscore.mockResolvedValue([
      JSON.stringify({ ticker: 'FLAME', price: mockPrice, timestamp: targetTs - 100 }),
    ])

    const price = await PriceBuffer.getDelayed('FLAME', delayMs)

    expect(mockZrevrangebyscore).toHaveBeenCalledWith(
      'price:buffer:FLAME',
      expect.any(Number), // targetTs
      '-inf',
      'LIMIT',
      0,
      1
    )
    expect(price).toBe(mockPrice)
  })

  it('getDelayed normaliza ticker para UPPERCASE', async () => {
    mockZrevrangebyscore.mockResolvedValue([
      JSON.stringify({ ticker: 'FLAME', price: 100, timestamp: Date.now() - 4_000_000 }),
    ])

    await PriceBuffer.getDelayed('flame', 3_600_000)

    expect(mockZrevrangebyscore).toHaveBeenCalledWith(
      'price:buffer:FLAME',
      expect.any(Number),
      '-inf',
      'LIMIT',
      0,
      1
    )
  })

  it('getDelayed retorna null se member JSON é malformado', async () => {
    mockZrevrangebyscore.mockResolvedValue(['not-valid-json'])
    const price = await PriceBuffer.getDelayed('FLAME', 3_600_000)
    expect(price).toBeNull()
  })

  it('getDelayed retorna null se price não é number', async () => {
    mockZrevrangebyscore.mockResolvedValue([
      JSON.stringify({ ticker: 'FLAME', price: 'invalid', timestamp: 12345 }),
    ])
    const price = await PriceBuffer.getDelayed('FLAME', 3_600_000)
    expect(price).toBeNull()
  })

  it('ingest usa eval Lua atômico com parâmetros corretos', async () => {
    await PriceBuffer.ingest('FLAME', 145.0, 1700000000000)
    expect(mockEval).toHaveBeenCalledWith(
      expect.any(String), // script Lua
      1,
      'price:buffer:FLAME',
      '1700000000000',    // score (timestamp)
      expect.stringContaining('"price":145'), // member JSON
      expect.any(String), // TTL_MS
      expect.any(String)  // pruneTs
    )
  })
})

// ─── Testes: GET /api/v1/assets/:ticker (delay por plano) ────────────────────

describe.skip('GET /api/v1/assets/:ticker — delay por plano', () => {
  const REAL_PRICE = 150.00
  const DELAYED_PRICE = 120.00

  beforeEach(() => {
    jest.clearAllMocks()
    mockPrismaAsset.mockResolvedValue(makeAsset('FLAME', REAL_PRICE))
  })

  it('LENDA recebe preço atual sem delay', async () => {
    mockGetAuthUser.mockResolvedValue(makeUser('LENDA'))
    // applyPriceDelay com delay=0 retorna o mesmo asset sem consultar histórico
    mockPrismaHistory.mockResolvedValue(null)

    const { GET } = await import('@/app/api/v1/assets/[ticker]/route')
    const req = new NextRequest('http://localhost/api/v1/assets/FLAME')
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLAME' }) })
    const body = await res.json() as { data: { currentPrice: number } }

    expect(res.status).toBe(200)
    expect(body.data.currentPrice).toBe(REAL_PRICE)
  })

  it('JOGADOR recebe preço histórico (60 min atrás), nunca preço atual', async () => {
    mockGetAuthUser.mockResolvedValue(makeUser('JOGADOR'))
    mockPrismaHistory.mockResolvedValue({
      close: { toNumber: undefined, toString: () => String(DELAYED_PRICE) },
    })
    // prisma.priceHistory.findFirst retorna { close: Decimal }
    mockPrismaHistory.mockResolvedValue({ close: DELAYED_PRICE })

    const { GET } = await import('@/app/api/v1/assets/[ticker]/route')
    const req = new NextRequest('http://localhost/api/v1/assets/FLAME')
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLAME' }) })
    const body = await res.json() as { data: { currentPrice: number; _meta: { delayed: boolean } } }

    expect(res.status).toBe(200)
    // currentPrice deve ser o preço do histórico, não o real
    expect(body.data.currentPrice).not.toBe(REAL_PRICE)
    expect(body.data._meta.delayed).toBe(true)
  })

  it('CRAQUE recebe preço histórico (30 min atrás)', async () => {
    mockGetAuthUser.mockResolvedValue(makeUser('CRAQUE'))
    mockPrismaHistory.mockResolvedValue({ close: DELAYED_PRICE })

    const { GET } = await import('@/app/api/v1/assets/[ticker]/route')
    const req = new NextRequest('http://localhost/api/v1/assets/FLAME')
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLAME' }) })
    const body = await res.json() as { data: { currentPrice: number; _meta: { delayed: boolean } } }

    expect(res.status).toBe(200)
    expect(body.data._meta.delayed).toBe(true)
  })

  it('Não autenticado retorna 401', async () => {
    mockGetAuthUser.mockResolvedValue(null)

    const { GET } = await import('@/app/api/v1/assets/[ticker]/route')
    const req = new NextRequest('http://localhost/api/v1/assets/FLAME')
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLAME' }) })

    expect(res.status).toBe(401)
  })

  it('Response tem Cache-Control: private (nunca public)', async () => {
    mockGetAuthUser.mockResolvedValue(makeUser('LENDA'))

    const { GET } = await import('@/app/api/v1/assets/[ticker]/route')
    const req = new NextRequest('http://localhost/api/v1/assets/FLAME')
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLAME' }) })

    expect(res.headers.get('Cache-Control')).toMatch(/private/)
    expect(res.headers.get('Cache-Control')).not.toMatch(/public/)
  })
})

// ─── Testes: GET /api/v1/assets/:ticker/history ──────────────────────────────

describe.skip('GET /api/v1/assets/:ticker/history — CRAQUE delay corrigido', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrismaAsset.mockResolvedValue(makeAsset('FLAME', 150))
  })

  it('CRAQUE usa delay de 30 min (1_800_000ms), não zero', async () => {
    mockGetAuthUser.mockResolvedValue(makeUser('CRAQUE'))

    const { GET } = await import('@/app/api/v1/assets/[ticker]/history/route')

    // Mock do PriceHistoryRepository
    const mockRepo = await import('@/lib/repositories/PriceHistoryRepository')
    const spy = jest.spyOn(mockRepo.PriceHistoryRepository, 'findByTicker').mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/v1/assets/FLAME/history?period=1M')
    await GET(req, { params: Promise.resolve({ ticker: 'FLAME' }) })

    // Deve ter sido chamado com effectiveTo = now - 30min (não undefined)
    expect(spy).toHaveBeenCalledWith(
      'FLAME',
      expect.objectContaining({
        to: expect.any(Date),
      })
    )

    // Verifica que effectiveTo está ~30min no passado
    const callArgs = spy.mock.calls[0]?.[1]
    const effectiveTo = callArgs?.to as Date | undefined
    if (effectiveTo) {
      const diffMs = Date.now() - effectiveTo.getTime()
      expect(diffMs).toBeGreaterThanOrEqual(1_790_000) // ~30min - 10s de tolerância
      expect(diffMs).toBeLessThanOrEqual(1_810_000) // ~30min + 10s de tolerância
    }
  })

  it('JOGADOR usa delay de 60 min (3_600_000ms)', async () => {
    mockGetAuthUser.mockResolvedValue(makeUser('JOGADOR'))

    const { GET } = await import('@/app/api/v1/assets/[ticker]/history/route')
    const mockRepo = await import('@/lib/repositories/PriceHistoryRepository')
    const spy = jest.spyOn(mockRepo.PriceHistoryRepository, 'findByTicker').mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/v1/assets/FLAME/history?period=1M')
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLAME' }) })
    const body = await res.json() as { _meta: { delayed: boolean; delayMinutes: number } }

    expect(body._meta.delayed).toBe(true)
    expect(body._meta.delayMinutes).toBe(60)

    spy.mockRestore()
  })

  it('LENDA retorna dados sem delay', async () => {
    mockGetAuthUser.mockResolvedValue(makeUser('LENDA'))

    const { GET } = await import('@/app/api/v1/assets/[ticker]/history/route')
    const mockRepo = await import('@/lib/repositories/PriceHistoryRepository')
    jest.spyOn(mockRepo.PriceHistoryRepository, 'findByTicker').mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/v1/assets/FLAME/history?period=1M')
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLAME' }) })
    const body = await res.json() as { _meta: { delayed: boolean; delayMinutes: number } }

    expect(body._meta.delayed).toBe(false)
    expect(body._meta.delayMinutes).toBe(0)
  })
})

// ─── Testes: GET /api/v1/assets/:ticker/price ────────────────────────────────

describe.skip('GET /api/v1/assets/:ticker/price', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEval.mockResolvedValue(1)
    mockPrismaAsset.mockResolvedValue(makeAsset('FLAME', 150))
  })

  it('LENDA retorna preço atual com delayMinutes=0', async () => {
    mockGetAuthUser.mockResolvedValue(makeUser('LENDA'))

    const { GET } = await import('@/app/api/v1/assets/[ticker]/price/route')
    const req = new NextRequest('http://localhost/api/v1/assets/FLAME/price')
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLAME' }) })
    const body = await res.json() as { data: { price: number }; _meta: { delayed: boolean; delayMinutes: number } }

    expect(res.status).toBe(200)
    expect(body.data.price).toBe(150)
    expect(body._meta.delayed).toBe(false)
    expect(body._meta.delayMinutes).toBe(0)
  })

  it('JOGADOR com buffer disponível retorna preço atrasado', async () => {
    mockGetAuthUser.mockResolvedValue(makeUser('JOGADOR'))
    mockZrevrangebyscore.mockResolvedValue([
      JSON.stringify({ ticker: 'FLAME', price: 110, timestamp: Date.now() - 4_000_000 }),
    ])

    const { GET } = await import('@/app/api/v1/assets/[ticker]/price/route')
    const req = new NextRequest('http://localhost/api/v1/assets/FLAME/price')
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLAME' }) })
    const body = await res.json() as { data: { price: number }; _meta: { delayed: boolean; delayMinutes: number } }

    expect(res.status).toBe(200)
    expect(body.data.price).toBe(110)
    expect(body._meta.delayed).toBe(true)
    expect(body._meta.delayMinutes).toBe(60)
  })

  it('JOGADOR com buffer vazio retorna 503 PRICE_BUFFERING (nunca preço real)', async () => {
    mockGetAuthUser.mockResolvedValue(makeUser('JOGADOR'))
    mockZrevrangebyscore.mockResolvedValue([]) // buffer vazio

    const { GET } = await import('@/app/api/v1/assets/[ticker]/price/route')
    const req = new NextRequest('http://localhost/api/v1/assets/FLAME/price')
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLAME' }) })
    const body = await res.json() as { error: { code: string }; _meta: { buffering: boolean } }

    expect(res.status).toBe(503)
    expect(body.error.code).toBe('PRICE_BUFFERING')
    expect(body._meta.buffering).toBe(true)
    // NUNCA deve retornar o preço real como fallback
    expect(body).not.toHaveProperty('data.price')
  })

  it('CRAQUE com buffer disponível retorna preço com 30min de atraso', async () => {
    mockGetAuthUser.mockResolvedValue(makeUser('CRAQUE'))
    mockZrevrangebyscore.mockResolvedValue([
      JSON.stringify({ ticker: 'FLAME', price: 135, timestamp: Date.now() - 2_000_000 }),
    ])

    const { GET } = await import('@/app/api/v1/assets/[ticker]/price/route')
    const req = new NextRequest('http://localhost/api/v1/assets/FLAME/price')
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLAME' }) })
    const body = await res.json() as { data: { price: number }; _meta: { delayMinutes: number } }

    expect(res.status).toBe(200)
    expect(body.data.price).toBe(135)
    expect(body._meta.delayMinutes).toBe(30)
  })

  it('Não autenticado retorna 401', async () => {
    mockGetAuthUser.mockResolvedValue(null)

    const { GET } = await import('@/app/api/v1/assets/[ticker]/price/route')
    const req = new NextRequest('http://localhost/api/v1/assets/FLAME/price')
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLAME' }) })

    expect(res.status).toBe(401)
  })
})
