/**
 * Task 01 — Testes de caracterização: gates P0 da rota de histórico.
 *
 * Estes testes afirmam o comportamento SEGURO esperado. Eles DEVEM FALHAR
 * contra o código anterior (cache público, cutoff ignorado em ALL/requestedTo,
 * timestamp sem filtro <= effectiveTo) e passar após as correções.
 *
 * hipotese: H1 — a defasagem percebida como exatamente 24h varia por densidade
 * e ticker; o truncamento dos 5.000 pontos existe no código, mas a duração
 * observada deve ser medida em produção com requestedFrom, effectiveTo,
 * primeiro/último timestamp e contagem bruta.
 *
 * hipotese: H3 — a metadata com preço é cacheada ou indexada em um contexto
 * capaz de atravessar o entitlement do usuário. O vazamento lógico está
 * presente no código; seu alcance operacional deve ser medido sem adiar a
 * remoção do preço da metadata.
 */

import { NextRequest } from 'next/server'

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockFindUnique = jest.fn()
let mockHistoryRows: Array<{
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
  source: string
}> = []

jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
    $queryRaw: jest.fn(async (_strings: unknown, ...values: unknown[]) => {
      // Simula o filtro do PostgreSQL: o primeiro parâmetro Date é o resolvedTo (timestamp <=)
      const effectiveTo = values.find((v) => v instanceof Date) as Date | undefined
      if (!effectiveTo) return mockHistoryRows
      return mockHistoryRows.filter((r) => r.timestamp.getTime() <= effectiveTo.getTime())
    }),
  },
}))

const mockGetAuthUser = jest.fn()
jest.mock('@/lib/auth', () => ({
  getAuthUser: (...args: unknown[]) => mockGetAuthUser(...args),
}))

jest.mock('@/services/AliasService', () => ({
  AliasService: { resolve: jest.fn(async (ticker: string) => ticker) },
}))

jest.mock('@/lib/validators/tickerSchema', () => ({
  tickerSchema: { safeParse: (v: string) => ({ success: true, data: v.toUpperCase() }) },
}))

import { GET } from '@/app/api/v1/assets/[ticker]/history/route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date('2026-08-13T18:00:00.000Z')

function setupAuth(planType: string) {
  mockGetAuthUser.mockResolvedValue({
    user: { id: 'user-1', planType, name: 'Test', email: 'test@test.com' },
    userId: 'user-1',
  })
}

function setupAsset(ticker = 'FLA1') {
  mockFindUnique.mockResolvedValue({ id: 'asset-1', ticker })
}

function setupHistory(candles: Array<{ timestamp: Date; close: number }>) {
  mockHistoryRows = candles.map((c) => ({
    timestamp: c.timestamp,
    open: c.close - 0.1,
    high: c.close + 0.2,
    low: c.close - 0.2,
    close: c.close,
    volume: 100,
    source: 'REAL',
  }))
}

function makeRequest(ticker: string, params: Record<string, string>) {
  const url = new URL(`/api/v1/assets/${ticker}/history`, 'http://localhost')
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  return new NextRequest(url)
}

// ─── Fixar relógio ──────────────────────────────────────────────────────────

beforeAll(() => {
  jest.useFakeTimers({ now: FIXED_NOW.getTime() })
})

afterAll(() => {
  jest.useRealTimers()
})

beforeEach(() => {
  jest.clearAllMocks()
  mockHistoryRows = []
})

// ─── Gate P0: Cache-Control nunca público em resposta autentica ───────────

describe('Gate P0: cache privado por entitlement', () => {
  test('período 1M com plano JOGADOR NÃO deve usar Cache-Control public', async () => {
    setupAuth('JOGADOR')
    setupAsset()
    setupHistory([
      { timestamp: new Date('2026-08-13T16:00:00.000Z'), close: 50.0 },
      { timestamp: new Date('2026-08-13T17:00:00.000Z'), close: 51.0 },
    ])

    const req = makeRequest('FLA1', { period: '1M' })
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLA1' }) })

    const cacheControl = res.headers.get('Cache-Control') ?? ''
    expect(cacheControl).not.toContain('public')
  })

  test('período 1W com plano CRAQUE NÃO deve usar Cache-Control public', async () => {
    setupAuth('CRAQUE')
    setupAsset()
    setupHistory([
      { timestamp: new Date('2026-08-13T16:00:00.000Z'), close: 50.0 },
    ])

    const req = makeRequest('FLA1', { period: '1W' })
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLA1' }) })

    const cacheControl = res.headers.get('Cache-Control') ?? ''
    expect(cacheControl).not.toContain('public')
  })

  test('período ALL com plano JOGADOR NÃO deve usar Cache-Control public', async () => {
    setupAuth('JOGADOR')
    setupAsset()
    setupHistory([
      { timestamp: new Date('2026-01-01T00:00:00.000Z'), close: 40.0 },
      { timestamp: new Date('2026-08-13T16:00:00.000Z'), close: 50.0 },
    ])

    const req = makeRequest('FLA1', { period: 'ALL' })
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLA1' }) })

    const cacheControl = res.headers.get('Cache-Control') ?? ''
    expect(cacheControl).not.toContain('public')
  })
})

// ─── Gate P0: nenhum timestamp ultrapassa o cutoff do plano ─────────────────

describe('Gate P0: cutoff temporal respeitado', () => {
  test('JOGADOR (1h delay): nenhum candle retornado pode ter timestamp > now - 1h', async () => {
    setupAuth('JOGADOR')
    setupAsset()

    const cutoff = new Date(FIXED_NOW.getTime() - 3_600_000)
    const futureCandle = new Date(cutoff.getTime() + 60_000)

    setupHistory([
      { timestamp: new Date('2026-08-13T16:00:00.000Z'), close: 50.0 },
      { timestamp: futureCandle, close: 52.0 },
    ])

    const req = makeRequest('FLA1', { period: '1M' })
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLA1' }) })
    const body = await res.json()

    for (const candle of body.data) {
      const ts = new Date(candle.timestamp).getTime()
      expect(ts).toBeLessThanOrEqual(cutoff.getTime())
    }
  })

  test('ALL com JOGADOR: mesmo sem from, deve aplicar cutoff', async () => {
    setupAuth('JOGADOR')
    setupAsset()

    const cutoff = new Date(FIXED_NOW.getTime() - 3_600_000)
    const recentCandle = new Date(cutoff.getTime() + 120_000)

    setupHistory([
      { timestamp: new Date('2025-01-01T00:00:00.000Z'), close: 30.0 },
      { timestamp: recentCandle, close: 55.0 },
    ])

    const req = makeRequest('FLA1', { period: 'ALL' })
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLA1' }) })
    const body = await res.json()

    for (const candle of body.data) {
      const ts = new Date(candle.timestamp).getTime()
      expect(ts).toBeLessThanOrEqual(cutoff.getTime())
    }
  })

  test('requestedTo futuro com JOGADOR: effectiveTo deve ser min(requestedTo, cutoff)', async () => {
    setupAuth('JOGADOR')
    setupAsset()

    const cutoff = new Date(FIXED_NOW.getTime() - 3_600_000)
    const requestedTo = new Date(FIXED_NOW.getTime())

    setupHistory([
      { timestamp: cutoff, close: 50.0 },
      { timestamp: new Date(cutoff.getTime() + 30_000), close: 51.0 },
    ])

    const req = makeRequest('FLA1', {
      period: '1M',
      to: requestedTo.toISOString(),
    })
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLA1' }) })
    const body = await res.json()

    for (const candle of body.data) {
      const ts = new Date(candle.timestamp).getTime()
      expect(ts).toBeLessThanOrEqual(cutoff.getTime())
    }
  })
})

// ─── Gate P0: série com mais de 5.000 snapshots ─────────────────────────────

describe('Gate P0: janela com >5.000 snapshots', () => {
  test('retorna os buckets mais recentes e preserva o último close elegível', async () => {
    setupAuth('JOGADOR')
    setupAsset()

    const cutoff = new Date(FIXED_NOW.getTime() - 3_600_000)
    const candles: Array<{ timestamp: Date; close: number }> = []
    for (let i = 6000; i >= 0; i--) {
      candles.push({
        timestamp: new Date(cutoff.getTime() - i * 60_000),
        close: 50 + (i % 5),
      })
    }
    const lastEligible = candles[candles.length - 1]
    setupHistory(candles)

    const req = makeRequest('FLA1', { period: '1M' })
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLA1' }) })
    const body = await res.json()

    expect(body.data.length).toBeGreaterThan(0)
    const lastReturned = body.data[body.data.length - 1]
    const lastTs = new Date(lastReturned.timestamp).getTime()
    expect(lastTs).toBeLessThanOrEqual(cutoff.getTime())
    expect(lastReturned.close).toBe(lastEligible.close)
  })
})

// ─── Gate P0: metadata de resposta não contém cotação ───────────────────────

describe('Gate P0: metadata de resposta não contém cotação', () => {
  test('_meta da resposta não contém currentPrice ou campos de cotação', async () => {
    setupAuth('JOGADOR')
    setupAsset()
    setupHistory([
      { timestamp: new Date('2026-08-13T16:00:00.000Z'), close: 50.0 },
    ])

    const req = makeRequest('FLA1', { period: '1M' })
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLA1' }) })
    const body = await res.json()

    expect(body._meta).not.toHaveProperty('currentPrice')
    expect(body._meta).not.toHaveProperty('price')
  })
})

// ─── Contrato temporal ───────────────────────────────────────────────────────

describe('Contrato temporal da rota', () => {
  test('mistura de period e from retorna 400', async () => {
    setupAuth('JOGADOR')
    setupAsset()
    setupHistory([{ timestamp: new Date('2026-08-13T16:00:00.000Z'), close: 50.0 }])

    const req = makeRequest('FLA1', { period: '1M', from: '2026-08-01T00:00:00.000Z' })
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLA1' }) })

    expect(res.status).toBe(400)
  })

  test('from >= to retorna 400', async () => {
    setupAuth('JOGADOR')
    setupAsset()
    setupHistory([{ timestamp: new Date('2026-08-13T16:00:00.000Z'), close: 50.0 }])

    const req = makeRequest('FLA1', {
      period: 'ALL',
      from: '2026-08-13T17:00:00.000Z',
      to: '2026-08-13T16:00:00.000Z',
    })
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLA1' }) })

    expect(res.status).toBe(400)
  })

  test('janela válida sem pontos retorna 200 com data: []', async () => {
    setupAuth('JOGADOR')
    setupAsset()
    setupHistory([])

    const req = makeRequest('FLA1', { period: '1M' })
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLA1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual([])
    expect(body._meta.effectiveTo).toBeDefined()
  })

  test('metadata inclui campos de cobertura temporal', async () => {
    setupAuth('JOGADOR')
    setupAsset()
    setupHistory([{ timestamp: new Date('2026-08-13T16:00:00.000Z'), close: 50.0 }])

    const req = makeRequest('FLA1', { period: '1M' })
    const res = await GET(req, { params: Promise.resolve({ ticker: 'FLA1' }) })
    const body = await res.json()

    expect(body._meta).toMatchObject({
      period: '1M',
      isDelayed: true,
      delayMinutes: 60,
      firstTimestamp: expect.any(String),
      lastTimestamp: expect.any(String),
      effectiveTo: expect.any(String),
    })
  })
})
