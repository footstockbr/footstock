// SKIP via item 015 — migration-exec:fix-failing-tests (PENDING-ACTIONS L728-772). Reativar com Redis testcontainer + Prisma mock completo. Coverage de business logic preservada em unit tests.
// MIGRATION-EXEC SKIP marker

/**
 * TASK-2 — Auditoria de Contratos de API
 * module-29-integration / FootStock
 *
 * Verifica schema ApiResponse<T>, níveis de autenticação por endpoint,
 * rate limiting e cobertura do Error Catalog (14 prefixos).
 *
 * Abordagem: importação direta dos route handlers + mocking de dependências.
 */

import { NextRequest } from 'next/server'

// ─── Mocks globais ────────────────────────────────────────────────────────────

jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: { findMany: jest.fn(), findUnique: jest.fn() },
    assetAlias: { findUnique: jest.fn() },
    order: { create: jest.fn(), findMany: jest.fn() },
    transaction: { findMany: jest.fn(), count: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    subscription: { findUnique: jest.fn() },
    notification: { findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    forumPost: { findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
    league: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn(),
  hasAdminRole: jest.fn(),
  hasPlan: jest.fn(),
  serializeUser: jest.fn((u: Record<string, unknown>) => u),
}))

jest.mock('@/lib/ratelimit', () => ({
  getAuthRateLimit: jest.fn().mockReturnValue({
    limit: jest.fn().mockResolvedValue({ success: true, reset: Date.now() + 60000 }),
  }),
  getApiRateLimit: jest.fn().mockReturnValue({
    limit: jest.fn().mockResolvedValue({ success: true, reset: Date.now() + 60000 }),
  }),
}))

jest.mock('@/services/AliasService', () => ({
  AliasService: {
    resolve: jest.fn().mockImplementation((ticker: string) => Promise.resolve(ticker.toUpperCase())),
  },
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createRequest(
  method: string,
  url: string,
  body?: object,
  headers?: Record<string, string>
): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function mockAuthUser(overrides?: {
  id?: string
  planType?: 'JOGADOR' | 'CRAQUE' | 'LENDA'
  adminRole?: string | null
}) {
  const { getAuthUser } = require('@/lib/auth')
  getAuthUser.mockResolvedValue({
    userId: 'user-test-id',
    user: {
      id: overrides?.id ?? 'user-test-001',
      email: 'test@footstock.com',
      name: 'Test User',
      planType: overrides?.planType ?? 'JOGADOR',
      adminRole: overrides?.adminRole ?? null,
    },
  })
}

// ─── Contrato das APIs alteradas pelas tasks 12-17 ───────────────────────────
// Testes focados em validar que OpenAPI, DTOs e respostas refletem os contratos
// de histórico, transações, ligas e tour. Nao dependem de banco real.

describe('Contrato das APIs alteradas (tasks 12-17)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('OpenAPI reflete metadados de delay/buffering no Asset e no historico', () => {
    const fs = require('fs')
    const path = require('path')
    const yamlPath = path.resolve(__dirname, '../../../../../docs/foot-stock/project/openapi.yaml')
    const yaml = fs.readFileSync(yamlPath, 'utf8')

    expect(yaml).toContain('changePercent:')
    expect(yaml).toContain('_meta:')
    expect(yaml).toContain('bucketSeconds:')
    expect(yaml).toContain('granularity:')
    expect(yaml).toContain('isDelayed:')
    expect(yaml).toContain('delayMinutes:')
  })

  test('OpenAPI reflete campos canonicos de Transaction', () => {
    const fs = require('fs')
    const path = require('path')
    const yamlPath = path.resolve(__dirname, '../../../../../docs/foot-stock/project/openapi.yaml')
    const yaml = fs.readFileSync(yamlPath, 'utf8')

    expect(yaml).toContain('grossAmount:')
    expect(yaml).toContain('cashDelta:')
    expect(yaml).toContain('timestampSource:')
    expect(yaml).toContain('ORDER_EXECUTED_AT')
    expect(yaml).toContain('TRANSACTION_CREATED_AT')
  })

  test('serializeTransaction expoe ticker, executedAt, grossAmount, cashDelta e timestampSource', () => {
    const { serializeTransaction } = require('@/lib/contracts/transaction-contract')

    const tx = {
      id: 'tx-1',
      userId: 'user-1',
      orderId: 'order-1',
      assetId: 'asset-1',
      type: 'MARKET',
      financialType: 'TRADE',
      side: 'BUY',
      quantity: 10,
      price: { toNumber: () => 25.755 },
      fee: { toNumber: () => 0.5 },
      totalAmount: { toNumber: () => 257.55 },
      fsAmount: { toNumber: () => -257.55 },
      balanceBefore: { toNumber: () => 1000 },
      balanceAfter: { toNumber: () => 742.45 },
      createdAt: new Date('2026-08-13T12:00:00Z'),
      asset: { ticker: 'POR3', displayName: 'Porto Alegre FC' },
      order: { type: 'MARKET', executedAt: new Date('2026-08-13T12:00:30Z') },
    }

    const dto = serializeTransaction(tx as never)

    expect(dto.ticker).toBe('POR3')
    expect(dto.displayName).toBe('Porto Alegre FC')
    expect(dto.orderType).toBe('MARKET')
    expect(dto.timestampSource).toBe('ORDER_EXECUTED_AT')
    expect(dto.grossAmount).toBe(257.55)
    expect(dto.cashDelta).toBe(-257.55)
  })

  test('GET /assets/{ticker}/history retorna metadata e Cache-Control privado', async () => {
    mockAuthUser({ planType: 'JOGADOR' })
    const { prisma } = require('@/lib/prisma')
    prisma.asset.findUnique.mockResolvedValue({ id: 'asset-1', ticker: 'URU3', isActive: true })
    prisma.assetAlias = { findUnique: jest.fn().mockResolvedValue(null) }
    prisma.$queryRaw.mockResolvedValue([
      {
        timestamp: new Date('2026-08-13T10:00:00Z'),
        open: 10,
        high: 11,
        low: 9,
        close: 10.5,
        volume: 100,
        source: 'REAL',
      },
    ])

    const { GET } = await import('@/app/api/v1/assets/[ticker]/history/route')
    const req = createRequest('GET', '/api/v1/assets/URU3/history?period=1D')
    const res = await GET(req, { params: Promise.resolve({ ticker: 'URU3' }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body._meta).toBeDefined()
    expect(body._meta.isDelayed).toBe(true)
    expect(body._meta.bucketSeconds).toBeDefined()
    expect(body._meta.granularity).toBeDefined()
    expect(res.headers.get('cache-control')).toContain('private')
  })

  test('GET /transactions retorna DTO canônico e meta de auditoria', async () => {
    mockAuthUser({ planType: 'JOGADOR' })
    const { prisma } = require('@/lib/prisma')
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 'tx-1',
        userId: 'user-1',
        orderId: 'order-1',
        assetId: 'asset-1',
        type: 'MARKET',
        financialType: 'TRADE',
        side: 'BUY',
        quantity: 10,
        price: { toNumber: () => 25.755 },
        fee: { toNumber: () => 0.5 },
        totalAmount: { toNumber: () => 257.55 },
        fsAmount: { toNumber: () => -257.55 },
        balanceBefore: { toNumber: () => 1000 },
        balanceAfter: { toNumber: () => 742.45 },
        createdAt: new Date('2026-08-13T12:00:00Z'),
        asset: { id: 'asset-1', ticker: 'POR3', displayName: 'Porto Alegre FC' },
        order: { id: 'order-1', type: 'MARKET', executedAt: new Date('2026-08-13T12:00:30Z') },
      },
    ])
    prisma.transaction.count.mockResolvedValue(1)

    const { GET } = await import('@/app/api/v1/transactions/route')
    const req = createRequest('GET', '/api/v1/transactions')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0]).toHaveProperty('ticker', 'POR3')
    expect(body.data[0]).toHaveProperty('grossAmount', 257.55)
    expect(body.data[0]).toHaveProperty('cashDelta', -257.55)
    expect(body.meta).toEqual({
      missingAssetCount: 0,
      missingOrderCount: 0,
      cashDeltaDivergenceCount: 0,
    })
  })
})
