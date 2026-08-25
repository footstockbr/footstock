// ============================================================================
// FootStock — pnlToday: soma de realizedPnl de TRADEs do dia
// Criterios do detalhamento 08-24 (Task 15):
//   - Somente TRADE com realizedPnl persistido entra na soma.
//   - TRADE sem realizedPnl fica fora e conta em pnlTodayUnavailableCount.
//   - FEE/BONUS/outro tipo financeiro NAO entra em pnlToday.
//   - Venda com prejuizo (realizedPnl negativo) diminui o pnlToday.
// ============================================================================

import { GET } from '@/app/api/v1/portfolio/route'

const mockUserFindUnique = jest.fn()
const mockPositionFindMany = jest.fn()
const mockTransactionFindMany = jest.fn()
const mockGetAuthUser = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    position: { findMany: (...args: unknown[]) => mockPositionFindMany(...args) },
    transaction: { findMany: (...args: unknown[]) => mockTransactionFindMany(...args) },
  },
}))

jest.mock('@/lib/auth', () => ({
  getAuthUser: (...args: unknown[]) => mockGetAuthUser(...args),
}))

function decimal(value: number) {
  return { toNumber: () => value }
}

function baseTx(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-default',
    userId: 'user-1',
    orderId: null,
    assetId: null,
    type: 'MARKET',
    financialType: 'TRADE',
    side: 'SELL',
    quantity: 10,
    price: decimal(30),
    fee: decimal(1.5),
    totalAmount: decimal(298.5),
    fsAmount: decimal(298.5),
    balanceBefore: decimal(1000),
    balanceAfter: decimal(1298.5),
    createdAt: new Date(),
    realizedPnl: decimal(50),
    avgPriceAtExecution: decimal(25),
    costBasisAmount: decimal(250),
    positionId: 'pos-1',
    ...overrides,
  }
}

async function callPortfolio(transactions: ReturnType<typeof baseTx>[]) {
  mockGetAuthUser.mockResolvedValue({ user: { id: 'user-1' } })
  mockUserFindUnique.mockResolvedValue({ fsBalance: decimal(1000), marginBlocked: decimal(0) })
  mockPositionFindMany.mockResolvedValue([])
  mockTransactionFindMany.mockResolvedValue(transactions)

  const res = await GET()
  expect(res.status).toBe(200)
  const json = await res.json()
  return json.data
}

describe('GET /api/v1/portfolio — pnlToday', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('TRADE com realizedPnl positivo entra na soma', async () => {
    const data = await callPortfolio([
      baseTx({ id: 'tx-1', realizedPnl: decimal(42.5) }),
    ])
    expect(data.pnlToday).toBe(42.5)
    expect(data.pnlTodayUnavailableCount).toBe(0)
  })

  test('venda do dia com prejuizo faz pnlToday diminuir (criterio 8)', async () => {
    const data = await callPortfolio([
      baseTx({ id: 'tx-1', realizedPnl: decimal(100) }),
      baseTx({ id: 'tx-2', realizedPnl: decimal(-35.25) }),
    ])
    expect(data.pnlToday).toBe(64.75)
  })

  test('transacao FEE nao entra em pnlToday (criterio 9)', async () => {
    const data = await callPortfolio([
      baseTx({ id: 'tx-1', realizedPnl: decimal(50) }),
      baseTx({
        id: 'tx-fee',
        financialType: 'FEE',
        totalAmount: decimal(-5),
        realizedPnl: null,
        avgPriceAtExecution: null,
        costBasisAmount: null,
      }),
    ])
    expect(data.pnlToday).toBe(50)
  })

  test('transacao BONUS nao entra em pnlToday (criterio 9)', async () => {
    const data = await callPortfolio([
      baseTx({
        id: 'tx-bonus',
        financialType: 'BONUS',
        totalAmount: decimal(200),
        realizedPnl: null,
        avgPriceAtExecution: null,
        costBasisAmount: null,
      }),
    ])
    expect(data.pnlToday).toBe(0)
    expect(data.pnlTodayUnavailableCount).toBe(0)
  })

  test('TRADE do dia sem realizedPnl fica fora da soma e conta em unavailable (criterio 10)', async () => {
    const data = await callPortfolio([
      baseTx({ id: 'tx-1', realizedPnl: decimal(80) }),
      baseTx({
        id: 'tx-legacy',
        realizedPnl: null,
        avgPriceAtExecution: null,
        costBasisAmount: null,
      }),
    ])
    expect(data.pnlToday).toBe(80)
    expect(data.pnlTodayUnavailableCount).toBe(1)
  })

  test('cenario misto: TRADE com snapshot, TRADE sem snapshot, FEE e BONUS', async () => {
    const data = await callPortfolio([
      baseTx({ id: 'tx-1', realizedPnl: decimal(120) }),
      baseTx({
        id: 'tx-2',
        realizedPnl: null,
        avgPriceAtExecution: null,
        costBasisAmount: null,
      }),
      baseTx({
        id: 'tx-fee',
        financialType: 'FEE',
        totalAmount: decimal(-3),
        realizedPnl: null,
      }),
      baseTx({
        id: 'tx-bonus',
        financialType: 'BONUS',
        totalAmount: decimal(500),
        realizedPnl: null,
      }),
    ])
    expect(data.pnlToday).toBe(120)
    expect(data.pnlTodayUnavailableCount).toBe(1)
    expect(data.todayTransactionsCount).toBe(4)
  })

  test('nenhuma transacao no dia retorna pnlToday zero e unavailableCount zero', async () => {
    const data = await callPortfolio([])
    expect(data.pnlToday).toBe(0)
    expect(data.pnlTodayUnavailableCount).toBe(0)
  })
})
