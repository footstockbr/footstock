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

// Replica a semantica do filtro do Prisma (`gte` inclusivo, `lt` exclusivo)
// para provar o criterio de limite sem precisar de banco real.
function matchesWindow(createdAt: Date, window: { gte?: Date; lt?: Date } | undefined) {
  if (!window) return true
  if (window.gte && createdAt.getTime() < window.gte.getTime()) return false
  if (window.lt && createdAt.getTime() >= window.lt.getTime()) return false
  return true
}

async function whereOf(search: string) {
  mockGetAuthUser.mockResolvedValue({ user: { id: 'user-1' } })
  mockFindMany.mockResolvedValue([])
  mockCount.mockResolvedValue(0)
  const res = await GET(makeRequest(search))
  expect(res.status).toBe(200)
  return mockFindMany.mock.calls[0][0].where
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
      filters: {
        type: null,
        financialType: null,
        assetId: null,
        from: null,
        to: null,
      },
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

  test('aplica from inclusivo e to exclusivo sobre createdAt', async () => {
    const where = await whereOf(
      'from=2026-08-01T00:00:00.000Z&to=2026-08-31T00:00:00.000Z'
    )

    expect(where.createdAt.gte).toEqual(new Date('2026-08-01T00:00:00.000Z'))
    expect(where.createdAt.lt).toEqual(new Date('2026-08-31T00:00:00.000Z'))

    // Limite inicial entra, limite final fica de fora.
    expect(matchesWindow(new Date('2026-08-01T00:00:00.000Z'), where.createdAt)).toBe(true)
    expect(matchesWindow(new Date('2026-08-31T00:00:00.000Z'), where.createdAt)).toBe(false)
    // Um milissegundo antes do fim ainda entra.
    expect(matchesWindow(new Date('2026-08-30T23:59:59.999Z'), where.createdAt)).toBe(true)
    // Um milissegundo antes do inicio fica de fora.
    expect(matchesWindow(new Date('2026-07-31T23:59:59.999Z'), where.createdAt)).toBe(false)
  })

  test('data nua e lida no fuso do produto (America/Sao_Paulo)', async () => {
    const where = await whereOf('from=2026-08-01')

    // 2026-08-01 00:00 BRT = 2026-08-01 03:00 UTC.
    expect(where.createdAt.gte.toISOString()).toBe('2026-08-01T03:00:00.000Z')
    expect(where.createdAt.lt).toBeUndefined()
  })

  test('aplica apenas o limite informado', async () => {
    const somenteTo = await whereOf('to=2026-08-31T00:00:00.000Z')
    expect(somenteTo.createdAt.gte).toBeUndefined()
    expect(somenteTo.createdAt.lt).toEqual(new Date('2026-08-31T00:00:00.000Z'))

    jest.clearAllMocks()

    const semPeriodo = await whereOf('')
    expect(semPeriodo.createdAt).toBeUndefined()
  })

  test('rejeita data inicial invalida com 422 e VAL-001', async () => {
    mockGetAuthUser.mockResolvedValue({ user: { id: 'user-1' } })

    const res = await GET(makeRequest('from=31-08-2026'))
    expect(res.status).toBe(422)

    const body = await res.json()
    expect(body.error.code).toBe('VAL-001')
    expect(body.error.message).toBe('Data inicial inválida.')
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  test('rejeita data final invalida com 422 e VAL-001', async () => {
    mockGetAuthUser.mockResolvedValue({ user: { id: 'user-1' } })

    const res = await GET(makeRequest('to=nao-e-data'))
    expect(res.status).toBe(422)

    const body = await res.json()
    expect(body.error.code).toBe('VAL-001')
    expect(body.error.message).toBe('Data final inválida.')
  })

  test('rejeita intervalo invertido com 422 e VAL-001', async () => {
    mockGetAuthUser.mockResolvedValue({ user: { id: 'user-1' } })

    const res = await GET(
      makeRequest('from=2026-08-31T00:00:00.000Z&to=2026-08-01T00:00:00.000Z')
    )
    expect(res.status).toBe(422)

    const body = await res.json()
    expect(body.error.code).toBe('VAL-001')
    expect(body.error.message).toBe('A data inicial deve ser anterior à data final.')
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  test('rejeita intervalo degenerado (from igual a to) com 422', async () => {
    mockGetAuthUser.mockResolvedValue({ user: { id: 'user-1' } })

    const res = await GET(
      makeRequest('from=2026-08-01T00:00:00.000Z&to=2026-08-01T00:00:00.000Z')
    )
    expect(res.status).toBe(422)

    const body = await res.json()
    expect(body.error.code).toBe('VAL-001')
  })

  test('rejeita tipo de operacao invalido', async () => {
    mockGetAuthUser.mockResolvedValue({ user: { id: 'user-1' } })

    const res = await GET(makeRequest('type=INVALIDO'))
    expect(res.status).toBe(422)

    const body = await res.json()
    expect(body.error.code).toBe('VAL-001')
    expect(body.error.message).toBe('Tipo de transação inválido.')
  })

  test('combina operacao, tipo financeiro, ativo e periodo simultaneamente', async () => {
    const where = await whereOf(
      'type=LIMIT&financialType=TRADE&assetId=asset-9&from=2026-08-01&to=2026-08-15'
    )

    expect(where.userId).toBe('user-1')
    expect(where.type).toBe('LIMIT')
    expect(where.financialType).toBe('TRADE')
    expect(where.assetId).toBe('asset-9')
    expect(where.createdAt.gte.toISOString()).toBe('2026-08-01T03:00:00.000Z')
    expect(where.createdAt.lt.toISOString()).toBe('2026-08-15T03:00:00.000Z')

    // O count paginado usa exatamente o mesmo where do findMany.
    expect(mockCount.mock.calls[0][0].where).toEqual(where)
  })

  test('espelha os filtros ativos no meta da resposta', async () => {
    mockGetAuthUser.mockResolvedValue({ user: { id: 'user-1' } })
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)

    const res = await GET(
      makeRequest('type=LIMIT&financialType=TRADE&assetId=asset-9&from=2026-08-01&to=2026-08-15')
    )
    const body = await res.json()

    expect(body.meta.filters).toEqual({
      type: 'LIMIT',
      financialType: 'TRADE',
      assetId: 'asset-9',
      from: '2026-08-01T03:00:00.000Z',
      to: '2026-08-15T03:00:00.000Z',
    })
    // Contadores de auditoria seguem no mesmo meta, sem mudanca de assinatura.
    expect(body.meta.missingAssetCount).toBe(0)
    expect(body.meta.missingOrderCount).toBe(0)
    expect(body.meta.cashDeltaDivergenceCount).toBe(0)
  })

  test('honra limit=200 no take do prisma (teto do relatorio)', async () => {
    mockGetAuthUser.mockResolvedValue({ user: { id: 'user-1' } })
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(201)

    const res = await GET(makeRequest('limit=200'))
    expect(res.status).toBe(200)
    expect(mockFindMany.mock.calls[0][0].take).toBe(200)
    const body = await res.json()
    expect(body.pagination.limit).toBe(200)
    expect(body.pagination.total).toBe(201)
  })

  test('cap de paginacao desta rota e 200, nao o teto global de 100', async () => {
    mockGetAuthUser.mockResolvedValue({ user: { id: 'user-1' } })
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)

    await GET(makeRequest('limit=500'))
    expect(mockFindMany.mock.calls[0][0].take).toBe(200)
  })
})
