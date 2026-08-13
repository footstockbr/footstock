import { NextRequest } from 'next/server'
import { GET } from '@/app/api/v1/transactions/route'

const mockFindMany = jest.fn()
const mockCount = jest.fn()
const mockGetAuthUser = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    transaction: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
  },
}))

jest.mock('@/lib/auth', () => ({
  getAuthUser: (...args: unknown[]) => mockGetAuthUser(...args),
}))

function makeRequest(search = '') {
  return new NextRequest(`http://localhost/api/v1/transactions${search ? `?${search}` : ''}`)
}

function decimal(value: number) {
  return { toNumber: () => value }
}

describe('GET /api/v1/transactions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('retorna 401 quando usuario nao autenticado', async () => {
    mockGetAuthUser.mockResolvedValue(null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  test('retorna transacoes serializadas com relacoes e campos financeiros', async () => {
    mockGetAuthUser.mockResolvedValue({ user: { id: 'user-1' } })
    mockFindMany.mockResolvedValue([
      {
        id: 'tx-1',
        userId: 'user-1',
        orderId: 'order-1',
        assetId: 'asset-1',
        type: 'MARKET',
        financialType: 'TRADE',
        side: 'BUY',
        quantity: 10,
        price: decimal(25.5),
        fee: decimal(2.55),
        totalAmount: decimal(257.55),
        fsAmount: decimal(-257.55),
        balanceBefore: decimal(1000),
        balanceAfter: decimal(742.45),
        createdAt: new Date('2026-08-13T12:00:00.000Z'),
        asset: { id: 'asset-1', ticker: 'POR3', displayName: 'Porto Alegre FC' },
        order: { id: 'order-1', type: 'MARKET', executedAt: new Date('2026-08-13T11:59:50.000Z') },
      },
      {
        id: 'tx-2',
        userId: 'user-1',
        orderId: null,
        assetId: null,
        type: null,
        financialType: 'BONUS',
        side: null,
        quantity: null,
        price: null,
        fee: null,
        totalAmount: decimal(50),
        fsAmount: decimal(50),
        balanceBefore: decimal(742.45),
        balanceAfter: decimal(792.45),
        createdAt: new Date('2026-08-13T13:00:00.000Z'),
        asset: null,
        order: null,
      },
    ])
    mockCount.mockResolvedValue(2)

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data).toHaveLength(2)

    const trade = body.data[0]
    expect(trade.ticker).toBe('POR3')
    expect(trade.displayName).toBe('Porto Alegre FC')
    expect(trade.executedAt).toBe('2026-08-13T11:59:50.000Z')
    expect(trade.orderType).toBe('MARKET')
    expect(trade.timestampSource).toBe('ORDER_EXECUTED_AT')
    expect(trade.grossAmount).toBe(255)
    expect(trade.cashDelta).toBe(-257.55)
    expect(trade.price).toBe(25.5)
    expect(trade.fee).toBe(2.55)

    const bonus = body.data[1]
    expect(bonus.ticker).toBeNull()
    expect(bonus.displayName).toBeNull()
    expect(bonus.orderType).toBeNull()
    expect(bonus.timestampSource).toBe('TRANSACTION_CREATED_AT')
    expect(bonus.grossAmount).toBeNull()
    expect(bonus.cashDelta).toBe(50)

    expect(body.meta).toEqual({
      missingAssetCount: 0,
      missingOrderCount: 0,
      cashDeltaDivergenceCount: 0,
    })
  })

  test('isola transacoes por userId', async () => {
    mockGetAuthUser.mockResolvedValue({ user: { id: 'user-A' } })
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)

    await GET(makeRequest())

    const where = mockFindMany.mock.calls[0][0].where
    expect(where.userId).toBe('user-A')
  })

  test('rejeita tipo financeiro invalido', async () => {
    mockGetAuthUser.mockResolvedValue({ user: { id: 'user-1' } })

    const res = await GET(makeRequest('financialType=INVALID'))
    expect(res.status).toBe(422)
  })

  test('detecta divergencia entre saldo e fsAmount na meta', async () => {
    mockGetAuthUser.mockResolvedValue({ user: { id: 'user-1' } })
    mockFindMany.mockResolvedValue([
      {
        id: 'tx-divergente',
        userId: 'user-1',
        orderId: null,
        assetId: null,
        type: null,
        financialType: 'TRADE',
        side: null,
        quantity: null,
        price: null,
        fee: null,
        totalAmount: decimal(100),
        fsAmount: decimal(-100),
        balanceBefore: decimal(200),
        balanceAfter: decimal(50), // deveria ser 100; divergencia de 50
        createdAt: new Date(),
        asset: null,
        order: null,
      },
    ])
    mockCount.mockResolvedValue(1)

    const res = await GET(makeRequest())
    const body = await res.json()
    expect(body.meta.cashDeltaDivergenceCount).toBe(1)
  })
})
