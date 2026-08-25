import { NextRequest } from 'next/server'
import { GET } from '@/app/api/v1/transactions/export/route'

const mockFindMany = jest.fn()
const mockGetAuthUser = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    transaction: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}))

jest.mock('@/lib/auth', () => ({
  getAuthUser: (...args: unknown[]) => mockGetAuthUser(...args),
}))

function decimal(value: number) {
  return { toNumber: () => value }
}

function makeRequest(search = '') {
  return new NextRequest(
    `http://localhost/api/v1/transactions/export${search ? `?${search}` : ''}`,
  )
}

function authWith(planType: string | null) {
  return {
    userId: 'user-1',
    user: {
      id: 'user-1',
      planType,
      userType: 'NORMAL',
      email: 'test@example.com',
      name: 'Test',
    },
  }
}

function tradeRow(overrides: Record<string, unknown> = {}) {
  return {
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
    realizedPnl: null,
    asset: { ticker: 'POR3' },
    order: { executedAt: new Date('2026-08-13T11:59:50.000Z') },
    ...overrides,
  }
}

function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.split('\n').filter((l) => l.length > 0)
  const header = lines[0].split(',')
  const rows = lines.slice(1).map((l) => l.split(','))
  return { header, rows }
}

describe('GET /api/v1/transactions/export', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('retorna 401 quando usuario nao autenticado', async () => {
    mockGetAuthUser.mockResolvedValue(null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  test('JOGADOR recebe 403 com codigo, feature e plano minimo', async () => {
    mockGetAuthUser.mockResolvedValue(authWith('JOGADOR'))
    const res = await GET(makeRequest())

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('PLAN-001')
    expect(body.error.feature).toBe('export_data')
    expect(body.error.minPlan).toBe('CRAQUE')
    expect(body.error.details).toBeUndefined()
    expect(body.error.requiredPlan).toBeUndefined()
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  test('JOGADOR com planType null tambem recebe 403', async () => {
    mockGetAuthUser.mockResolvedValue(authWith(null))
    const res = await GET(makeRequest())
    expect(res.status).toBe(403)
  })

  test('CRAQUE recebe 200 com CSV valido', async () => {
    mockGetAuthUser.mockResolvedValue(authWith('CRAQUE'))
    mockFindMany.mockResolvedValue([tradeRow()])

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('Content-Disposition')).toMatch(
      /attachment; filename="transactions_\d{4}-\d{2}-\d{2}\.csv"/,
    )

    const csv = await res.text()
    const { header, rows } = parseCsv(csv)
    expect(header).toEqual([
      'data_execucao',
      'ticker',
      'lado',
      'quantidade',
      'preco_executado',
      'valor_bruto',
      'taxa',
      'valor_liquido',
      'resultado_realizado',
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0][1]).toBe('POR3')
    expect(rows[0][2]).toBe('BUY')
    expect(rows[0][3]).toBe('10')
  })

  test('LENDA recebe 200 com CSV valido', async () => {
    mockGetAuthUser.mockResolvedValue(authWith('LENDA'))
    mockFindMany.mockResolvedValue([tradeRow()])

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)

    const csv = await res.text()
    const { rows } = parseCsv(csv)
    expect(rows).toHaveLength(1)
  })

  test('financialType=FEE na query nao produz linhas FEE (forcado para TRADE)', async () => {
    mockGetAuthUser.mockResolvedValue(authWith('CRAQUE'))
    mockFindMany.mockResolvedValue([tradeRow()])

    const res = await GET(makeRequest('financialType=FEE'))
    expect(res.status).toBe(200)

    // O where enviado ao Prisma deve ter financialType=TRADE, nao FEE.
    const where = mockFindMany.mock.calls[0][0].where
    expect(where.financialType).toBe('TRADE')

    const csv = await res.text()
    const { rows } = parseCsv(csv)
    // Uma linha TRADE retornada, nenhuma FEE.
    expect(rows).toHaveLength(1)
  })

  test('financialType=BONUS na query tambem e ignorado', async () => {
    mockGetAuthUser.mockResolvedValue(authWith('CRAQUE'))
    mockFindMany.mockResolvedValue([])

    await GET(makeRequest('financialType=BONUS'))
    const where = mockFindMany.mock.calls[0][0].where
    expect(where.financialType).toBe('TRADE')
  })

  test('financialType com valor desconhecido retorna 200 (ignorado, nunca 422)', async () => {
    mockGetAuthUser.mockResolvedValue(authWith('CRAQUE'))
    mockFindMany.mockResolvedValue([tradeRow()])

    const res = await GET(makeRequest('financialType=QUALQUER_LIXO'))
    expect(res.status).toBe(200)

    const where = mockFindMany.mock.calls[0][0].where
    expect(where.financialType).toBe('TRADE')

    const csv = await res.text()
    const { rows } = parseCsv(csv)
    expect(rows).toHaveLength(1)
  })

  test('CSV tem uma linha por TRADE sem reagregar FEE', async () => {
    mockGetAuthUser.mockResolvedValue(authWith('CRAQUE'))
    mockFindMany.mockResolvedValue([
      tradeRow({ id: 'tx-1', side: 'BUY' }),
      tradeRow({ id: 'tx-2', side: 'SELL', quantity: 5, price: decimal(30) }),
    ])

    const res = await GET(makeRequest())
    const csv = await res.text()
    const { rows } = parseCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0][2]).toBe('BUY')
    expect(rows[1][2]).toBe('SELL')
  })

  test('resultado_realizado aparece quando persistido', async () => {
    mockGetAuthUser.mockResolvedValue(authWith('CRAQUE'))
    mockFindMany.mockResolvedValue([
      tradeRow({ realizedPnl: decimal(150.75) }),
    ])

    const res = await GET(makeRequest())
    const csv = await res.text()
    const { rows } = parseCsv(csv)
    expect(rows[0][8]).toBe('150.75')
  })

  test('resultado_realizado vazio quando null', async () => {
    mockGetAuthUser.mockResolvedValue(authWith('CRAQUE'))
    mockFindMany.mockResolvedValue([tradeRow({ realizedPnl: null })])

    const res = await GET(makeRequest())
    const csv = await res.text()
    const { rows } = parseCsv(csv)
    expect(rows[0][8]).toBe('')
  })

  test('rejeita janela superior a 366 dias com 422', async () => {
    mockGetAuthUser.mockResolvedValue(authWith('CRAQUE'))

    const res = await GET(
      makeRequest('from=2025-01-01T00:00:00.000Z&to=2026-08-01T00:00:00.000Z'),
    )
    expect(res.status).toBe(422)
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  test('aceita janela de exatamente 366 dias', async () => {
    mockGetAuthUser.mockResolvedValue(authWith('CRAQUE'))
    mockFindMany.mockResolvedValue([])

    const res = await GET(
      makeRequest('from=2025-08-01T00:00:00.000Z&to=2026-08-02T00:00:00.000Z'),
    )
    // 366 dias = 2025-08-01 a 2026-08-02 (366 * 86400000 ms)
    expect(res.status).toBe(200)
  })

  test('sem from/to clampa janela para ultimos 366 dias', async () => {
    mockGetAuthUser.mockResolvedValue(authWith('CRAQUE'))
    mockFindMany.mockResolvedValue([])

    await GET(makeRequest())
    const where = mockFindMany.mock.calls[0][0].where

    expect(where.createdAt).toBeDefined()
    expect(where.createdAt.gte).toBeInstanceOf(Date)
    expect(where.createdAt.lt).toBeInstanceOf(Date)

    const spanMs = where.createdAt.lt.getTime() - where.createdAt.gte.getTime()
    const spanDays = spanMs / (24 * 60 * 60 * 1000)
    expect(spanDays).toBe(366)
  })

  test('so com from antigo clampa a janela para 366 dias a partir de agora', async () => {
    mockGetAuthUser.mockResolvedValue(authWith('CRAQUE'))
    mockFindMany.mockResolvedValue([])

    await GET(makeRequest('from=2020-01-01T00:00:00.000Z'))
    const where = mockFindMany.mock.calls[0][0].where

    expect(where.createdAt).toBeDefined()
    expect(where.createdAt.gte).toBeInstanceOf(Date)
    expect(where.createdAt.lt).toBeInstanceOf(Date)

    const spanMs = where.createdAt.lt.getTime() - where.createdAt.gte.getTime()
    const spanDays = spanMs / (24 * 60 * 60 * 1000)
    expect(spanDays).toBe(366)
  })

  test('limita a 10000 linhas no findMany', async () => {
    mockGetAuthUser.mockResolvedValue(authWith('CRAQUE'))
    mockFindMany.mockResolvedValue([])

    await GET(makeRequest())
    const opts = mockFindMany.mock.calls[0][0]
    expect(opts.take).toBe(10000)
  })

  test('rejeita filtro de data invalido com 422', async () => {
    mockGetAuthUser.mockResolvedValue(authWith('CRAQUE'))

    const res = await GET(makeRequest('from=31-08-2026'))
    expect(res.status).toBe(422)
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  test('escapa campos CSV com virgulas e aspas', async () => {
    mockGetAuthUser.mockResolvedValue(authWith('CRAQUE'))
    mockFindMany.mockResolvedValue([
      tradeRow({
        asset: { ticker: 'A"B,C' },
      }),
    ])

    const res = await GET(makeRequest())
    const csv = await res.text()
    // Ticker com aspas e virgula deve ser escapado: "A""B,C"
    expect(csv).toContain('"A""B,C"')
  })

  test('filtra por userId do usuario autenticado', async () => {
    mockGetAuthUser.mockResolvedValue({
      userId: 'user-42',
      user: { id: 'user-42', planType: 'CRAQUE', userType: 'NORMAL' },
    })
    mockFindMany.mockResolvedValue([])

    await GET(makeRequest())
    const where = mockFindMany.mock.calls[0][0].where
    expect(where.userId).toBe('user-42')
  })

  test('reutiliza filtros type e assetId da query', async () => {
    mockGetAuthUser.mockResolvedValue(authWith('CRAQUE'))
    mockFindMany.mockResolvedValue([])

    await GET(makeRequest('type=LIMIT&assetId=asset-9'))
    const where = mockFindMany.mock.calls[0][0].where
    expect(where.type).toBe('LIMIT')
    expect(where.assetId).toBe('asset-9')
    expect(where.financialType).toBe('TRADE')
  })
})
