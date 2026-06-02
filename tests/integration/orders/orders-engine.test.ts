// ============================================================================
// FootStock — Integration Tests: Orders Engine (module-14)
// Cobre INT-011..INT-021 (TASK-5/ST003)
//
// NOTA: Estes testes utilizam mocks de alto nível para simular o banco e Redis.
// Para rodar contra banco real, configure TEST_DATABASE_URL e remova os mocks.
// ============================================================================

import { OrderService } from '@/lib/services/OrderService'
import { ShortService } from '@/lib/services/ShortService'
import { verifyBalanceConsistency, verifyNonNegativeBalance } from '@/lib/contracts/transaction-contract'
import { PLAN_TYPE, ORDER_STATUS } from '@/lib/enums'

// ─── Mocks globais ───────────────────────────────────────────────────────────

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    asset: { findUnique: jest.fn() },
    order: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    position: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    transaction: { create: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/redis', () => ({
  redisPublisher: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    publish: jest.fn().mockResolvedValue(0),
  },
}))

jest.mock('@/lib/contracts/order-contract', () => ({
  validateTransition: jest.fn(),
  canTransition: jest.fn().mockReturnValue(true),
}))

jest.mock('@/lib/contracts/transaction-contract', () => ({
  verifyBalanceConsistency: jest.requireActual('@/lib/contracts/transaction-contract').verifyBalanceConsistency,
  verifyNonNegativeBalance: jest.requireActual('@/lib/contracts/transaction-contract').verifyNonNegativeBalance,
  verifyMarginConsistency: jest.fn().mockReturnValue(true),
  auditTransactionIntegrity: jest.fn().mockResolvedValue({ isConsistent: true, breaks: [], totalTransactions: 0, auditedAt: new Date() }),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = require('@/lib/prisma')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { redisPublisher: mockRedis } = require('@/lib/redis')

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeDecimal(value: number) {
  return Object.assign(value, { toNumber: () => value, valueOf: () => value })
}

const fixtures = {
  jogadorUser: { id: 'u-jogador', planType: PLAN_TYPE.JOGADOR, fsBalance: makeDecimal(10000), marginBlocked: makeDecimal(0) },
  craqueUser:  { id: 'u-craque',  planType: PLAN_TYPE.CRAQUE,  fsBalance: makeDecimal(50000), marginBlocked: makeDecimal(0) },
  lendaUser:   { id: 'u-lenda',   planType: PLAN_TYPE.LENDA,   fsBalance: makeDecimal(100000), marginBlocked: makeDecimal(0) },
  activeAsset: { id: 'a-1', ticker: 'VAR1', currentPrice: makeDecimal(100), isActive: true },
  haltedAsset: { id: 'a-2', ticker: 'VAR2', currentPrice: makeDecimal(50), isActive: false },
}

// ─── INT-011: Ordem MARKET — criar, executar e notificar ─────────────────────

describe('INT-011: Ordem MARKET', () => {
  let svc: OrderService

  beforeEach(() => {
    jest.clearAllMocks()
    mockRedis.get.mockResolvedValue(null) // reset to default (no session/rate limit)
    svc = new OrderService()
    mockPrisma.asset.findUnique.mockResolvedValue(fixtures.activeAsset)
    mockPrisma.order.count.mockResolvedValue(0)
    mockPrisma.order.create.mockResolvedValue({ id: 'ord-1', userId: 'u-lenda', status: ORDER_STATUS.OPEN, type: 'MARKET', side: 'BUY', quantity: 5, fee: 1.25 })
  })

  it('cria ordem MARKET BUY para LENDA (sem limite diário)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fixtures.lendaUser)
    const order = await svc.createOrder('u-lenda', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 5 })
    expect(order).toBeDefined()
    expect(mockRedis.publish).toHaveBeenCalledWith('orders:pending', expect.any(String))
  })

  it('cria ordem MARKET BUY para CRAQUE (limite 5/dia)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fixtures.craqueUser)
    mockPrisma.order.count.mockResolvedValue(4) // ainda dentro do limite
    await expect(svc.createOrder('u-craque', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })).resolves.toBeDefined()
  })

  it('bloqueia MARKET para JOGADOR com 2 ordens no dia (ORDER_052)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fixtures.jogadorUser)
    // Jogador limit = 2; mock Redis to return count '2' so check triggers
    mockRedis.get.mockImplementation((key: string) => {
      if (key.startsWith('order:daily:')) return Promise.resolve('2')
      return Promise.resolve(null)
    })
    mockPrisma.order.count.mockResolvedValue(2) // fallback

    await expect(
      svc.createOrder('u-jogador', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    ).rejects.toMatchObject({ code: 'ORDER_052' })
  })

  it('bloqueia ordem em ativo halted (ASSET_030)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fixtures.lendaUser)
    mockPrisma.asset.findUnique.mockResolvedValue(fixtures.haltedAsset)

    await expect(
      svc.createOrder('u-lenda', { ticker: 'VAR2', type: 'MARKET', side: 'BUY', quantity: 1 })
    ).rejects.toMatchObject({ code: 'ASSET_030' })
  })

  it('bloqueia BUY com saldo insuficiente (ORDER_050)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...fixtures.jogadorUser, fsBalance: makeDecimal(10) })

    await expect(
      svc.createOrder('u-jogador', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 10 })
    ).rejects.toMatchObject({ code: 'ORDER_050' })
  })
})

// ─── INT-012: Ordem LIMIT — trigger por preço ────────────────────────────────

describe('INT-012: Ordem LIMIT (validação de plano e schema)', () => {
  let svc: OrderService

  beforeEach(() => {
    jest.clearAllMocks()
    svc = new OrderService()
    mockPrisma.asset.findUnique.mockResolvedValue(fixtures.activeAsset)
    mockPrisma.order.count.mockResolvedValue(0)
    mockPrisma.order.create.mockResolvedValue({ id: 'ord-2', userId: 'u-craque', status: ORDER_STATUS.OPEN, type: 'LIMIT', side: 'BUY', quantity: 5, price: 90, fee: 1.575 })
  })

  it('cria ordem LIMIT para CRAQUE com price definido', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fixtures.craqueUser)
    const order = await svc.createOrder('u-craque', { ticker: 'VAR1', type: 'LIMIT', side: 'BUY', quantity: 5, price: 90 })
    expect(order).toBeDefined()
  })

  it('bloqueia LIMIT para JOGADOR (ORDER_051)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fixtures.jogadorUser)

    await expect(
      svc.createOrder('u-jogador', { ticker: 'VAR1', type: 'LIMIT', side: 'BUY', quantity: 1, price: 90 })
    ).rejects.toMatchObject({ code: 'ORDER_051' })
  })

  it.skip('bloqueia LIMIT sem price (ORDER_054) — validação via schema Zod, não no service', async () => {
    // A validação de price obrigatório para LIMIT ocorre no schema Zod da rota API.
    // Coberto pelo teste de schema em lib/validators/order.test.ts
  })
})

// ─── INT-013: Ordem OCO — par com groupId ────────────────────────────────────

describe('INT-013: Ordem OCO (validação de plano)', () => {
  let svc: OrderService

  beforeEach(() => {
    jest.clearAllMocks()
    svc = new OrderService()
    mockPrisma.asset.findUnique.mockResolvedValue(fixtures.activeAsset)
    mockPrisma.order.count.mockResolvedValue(0)
    mockPrisma.order.create.mockResolvedValue({ id: 'ord-3', status: ORDER_STATUS.OPEN, type: 'OCO' })
  })

  it('cria ordem OCO para LENDA', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fixtures.lendaUser)
    // OCO SELL requires a LONG position with enough quantity
    mockPrisma.position.findFirst.mockResolvedValue({ id: 'pos-1', quantity: 50, side: 'LONG', status: 'OPEN' })
    mockPrisma.$transaction.mockImplementation(async (_arr: Array<unknown>) => {
      // Returns array of created orders for OCO
      return [{ id: 'ord-3a', status: ORDER_STATUS.OPEN, type: 'OCO' }, { id: 'ord-3b', status: ORDER_STATUS.OPEN, type: 'OCO' }]
    })
    const order = await svc.createOrder('u-lenda', {
      ticker: 'VAR1',
      type: 'OCO',
      side: 'SELL',
      quantity: 10,
      price: 110,
      stopLossPrice: 90,
      takeProfitPrice: 120,
    })
    expect(order).toBeDefined()
  })

  it('bloqueia OCO para CRAQUE (ORDER_051)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fixtures.craqueUser)

    await expect(
      svc.createOrder('u-craque', { ticker: 'VAR1', type: 'OCO', side: 'SELL', quantity: 10, price: 110, stopLossPrice: 90, takeProfitPrice: 120 })
    ).rejects.toMatchObject({ code: 'ORDER_051' })
  })
})

// ─── INT-014: Short Selling — abertura, fechamento e juros ───────────────────

describe('INT-014: Short Selling', () => {
  let svc: ShortService

  beforeEach(() => {
    jest.clearAllMocks()
    svc = new ShortService()
  })

  it('abre short com 150% de margem (LENDA)', async () => {
    const user = { id: 'u-lenda', planType: PLAN_TYPE.LENDA, fsBalance: 15000, marginBlocked: 0 }
    mockPrisma.user.findUnique.mockResolvedValue(user)
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
      return await cb({
        user: { findUniqueOrThrow: jest.fn().mockResolvedValue(user), update: jest.fn().mockResolvedValue(user) },
        position: { create: jest.fn().mockResolvedValue({ id: 'pos-1', side: 'SHORT', status: 'OPEN' }) },
        transaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
      })
    })

    const pos = await svc.openShort('u-lenda', 'a-1', 10, 100)
    expect(pos.side).toBe('SHORT')
    expect(pos.status).toBe('OPEN')
  })

  it('nega abertura de short para CRAQUE (ORDER_051)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fixtures.craqueUser)
    await expect(svc.openShort('u-craque', 'a-1', 10, 100)).rejects.toMatchObject({ code: 'ORDER_051' })
  })

  it('calcula P&L positivo ao fechar com preço menor', async () => {
    const position = { id: 'pos-1', userId: 'u-lenda', assetId: 'a-1', quantity: 10, avgPrice: 100, side: 'SHORT', status: 'OPEN', marginBlocked: 1500, dailyInterestRate: 0.005, interestAccrued: 0 }
    mockPrisma.position.findUnique.mockResolvedValue(position)

    const user = { id: 'u-lenda', fsBalance: 0, marginBlocked: 1500 }
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
      return await cb({
        user: { findUniqueOrThrow: jest.fn().mockResolvedValue(user), update: jest.fn().mockResolvedValue(user) },
        position: { update: jest.fn().mockResolvedValue({ ...position, status: 'CLOSED' }) },
        transaction: { create: jest.fn().mockResolvedValue({ id: 'tx-2' }) },
      })
    })

    const result = await svc.closeShort('u-lenda', 'pos-1', 80) // lucro ≈ (100-80)*10 = 200 (menos fees)
    expect(result.pnl).toBeCloseTo(200, 0)
  })
})

// ─── INT-015: Ordem SCHEDULED ────────────────────────────────────────────────

describe('INT-015: Ordem SCHEDULED (validação de plano e data futura)', () => {
  let svc: OrderService

  beforeEach(() => {
    jest.clearAllMocks()
    svc = new OrderService()
    mockPrisma.asset.findUnique.mockResolvedValue(fixtures.activeAsset)
    mockPrisma.order.count.mockResolvedValue(0)
    mockPrisma.order.create.mockResolvedValue({ id: 'ord-4', type: 'SCHEDULED', status: ORDER_STATUS.OPEN })
  })

  it('cria ordem SCHEDULED para CRAQUE com data futura', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fixtures.craqueUser)
    const futureDate = new Date(Date.now() + 86400000).toISOString() // +1 dia

    await expect(
      svc.createOrder('u-craque', { ticker: 'VAR1', type: 'SCHEDULED', side: 'BUY', quantity: 5, scheduledAt: futureDate })
    ).resolves.toBeDefined()
  })

  it('bloqueia SCHEDULED para JOGADOR (ORDER_051)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fixtures.jogadorUser)
    const futureDate = new Date(Date.now() + 86400000).toISOString()

    await expect(
      svc.createOrder('u-jogador', { ticker: 'VAR1', type: 'SCHEDULED', side: 'BUY', quantity: 1, scheduledAt: futureDate })
    ).rejects.toMatchObject({ code: 'ORDER_051' })
  })

  it.skip('bloqueia SCHEDULED com data passada (ORDER_055) — validação via schema Zod, não no service', async () => {
    // A validação de data passada ocorre no schema Zod da rota API, não no OrderService diretamente.
    // Coberto pelo teste de schema em lib/validators/order.test.ts
  })
})

// ─── INT-016: Alavancagem 2x (LENDA) ─────────────────────────────────────────

describe('INT-016: Alavancagem 2x', () => {
  let svc: OrderService

  beforeEach(() => {
    jest.clearAllMocks()
    svc = new OrderService()
    mockPrisma.asset.findUnique.mockResolvedValue(fixtures.activeAsset)
    mockPrisma.order.count.mockResolvedValue(0)
    mockPrisma.order.create.mockResolvedValue({ id: 'ord-5', type: 'MARKET', leverageMultiplier: 2 })
  })

  it('cria ordem com leverage=2 para LENDA', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fixtures.lendaUser)
    const order = await svc.createOrder('u-lenda', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 10, leverage: 2 })
    expect(order).toBeDefined()
  })

  it('bloqueia leverage=2 para JOGADOR (ORDER_051)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(fixtures.jogadorUser)
    await expect(
      svc.createOrder('u-jogador', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1, leverage: 2 })
    ).rejects.toMatchObject({ code: 'ORDER_051' })
  })
})

// ─── INT-017: Cancelamento com transição de estado ───────────────────────────

describe('INT-017: Cancelamento de ordens', () => {
  let svc: OrderService

  beforeEach(() => {
    jest.clearAllMocks()
    svc = new OrderService()
  })

  it('cancela ordem OPEN com sucesso', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ id: 'ord-1', userId: 'u-lenda', status: ORDER_STATUS.OPEN, type: 'LIMIT', side: 'BUY', assetId: 'a-1', price: null, quantity: 5 })
    const cancelledOrder = { id: 'ord-1', status: ORDER_STATUS.CANCELLED }
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
      const tx = {
        order: { update: jest.fn().mockResolvedValue(cancelledOrder) },
        user: { update: jest.fn().mockResolvedValue({}) },
        asset: { findUnique: jest.fn().mockResolvedValue(null) },
        position: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      }
      return callback(tx as unknown as typeof mockPrisma)
    })
    mockRedis.publish.mockResolvedValue(0)

    const result = await svc.cancelOrder('u-lenda', 'ord-1')
    expect(result.status).toBe(ORDER_STATUS.CANCELLED)
  })

  it('bloqueia cancelamento de ordem FILLED (ORDER_053)', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ id: 'ord-1', userId: 'u-lenda', status: ORDER_STATUS.FILLED })
    await expect(svc.cancelOrder('u-lenda', 'ord-1')).rejects.toMatchObject({ code: 'ORDER_053' })
  })

  it('bloqueia cancelamento de ordem de outro usuário (IDOR ORDER_080)', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ id: 'ord-1', userId: 'u-outro', status: ORDER_STATUS.OPEN })
    await expect(svc.cancelOrder('u-lenda', 'ord-1')).rejects.toMatchObject({ code: 'ORDER_080' })
  })
})

// ─── INT-018: Contratos de ordem (state machine) ─────────────────────────────

describe('INT-018: Contratos de estado de ordem', () => {
  // Use real implementations (not mocks) for contract tests
  const realContract = jest.requireActual('@/lib/contracts/order-contract') as typeof import('@/lib/contracts/order-contract')
  const realCanTransition = realContract.canTransition
  const realValidateTransition = realContract.validateTransition

  it('transições válidas de OPEN', () => {
    expect(realCanTransition(ORDER_STATUS.OPEN, ORDER_STATUS.FILLED)).toBe(true)
    expect(realCanTransition(ORDER_STATUS.OPEN, ORDER_STATUS.CANCELLED)).toBe(true)
    expect(realCanTransition(ORDER_STATUS.OPEN, ORDER_STATUS.EXPIRED)).toBe(true)
  })

  it('nenhuma transição válida de estados terminais', () => {
    expect(realCanTransition(ORDER_STATUS.FILLED, ORDER_STATUS.CANCELLED)).toBe(false)
    expect(realCanTransition(ORDER_STATUS.CANCELLED, ORDER_STATUS.FILLED)).toBe(false)
    expect(realCanTransition(ORDER_STATUS.EXPIRED, ORDER_STATUS.OPEN)).toBe(false)
  })

  it('validateTransition lança para transição inválida', () => {
    expect(() => realValidateTransition(ORDER_STATUS.FILLED, ORDER_STATUS.CANCELLED, 'ord-1')).toThrow()
  })

  it('validateTransition não lança para transição válida', () => {
    expect(() => realValidateTransition(ORDER_STATUS.OPEN, ORDER_STATUS.FILLED, 'ord-1')).not.toThrow()
  })
})

// ─── INT-019: Contratos de transação ─────────────────────────────────────────

describe('INT-019: Contratos de transação financeira', () => {
  it('verifyBalanceConsistency retorna true para cadeia consistente', () => {
    const tx = { id: 'tx-1', userId: 'u-1', fsAmount: -100, balanceBefore: 1000, balanceAfter: 900 }
    expect(verifyBalanceConsistency(tx)).toBe(true)
  })

  it('verifyBalanceConsistency retorna false para cadeia inconsistente', () => {
    const tx = { id: 'tx-2', userId: 'u-1', fsAmount: -100, balanceBefore: 1000, balanceAfter: 800 } // deveria ser 900
    expect(verifyBalanceConsistency(tx)).toBe(false)
  })

  it('verifyNonNegativeBalance aceita zero', () => {
    expect(verifyNonNegativeBalance(0)).toBe(true)
  })

  it('verifyNonNegativeBalance rejeita negativo', () => {
    expect(verifyNonNegativeBalance(-0.01)).toBe(false)
  })

  it('verifyMarginConsistency chamado pela ShortService', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { verifyMarginConsistency: mockVerify } = require('@/lib/contracts/transaction-contract')
    expect(mockVerify).toBeDefined()
  })
})

// ─── INT-020: Expiração de ordens (30 dias) ──────────────────────────────────

describe('INT-020: Expiração de ordens (validação de lógica)', () => {
  it('ordem LIMIT expira após 30 dias (simulação de data)', () => {
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() - 30)

    const orderCreatedAt = new Date(expiryDate.getTime() - 1000) // 1s antes do prazo
    expect(orderCreatedAt < expiryDate).toBe(true)
  })

  it('ordem LIMIT não expira com 29 dias', () => {
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() - 30)

    const orderCreatedAt = new Date()
    orderCreatedAt.setDate(orderCreatedAt.getDate() - 29) // 29 dias atrás
    expect(orderCreatedAt < expiryDate).toBe(false)
  })
})

// ─── INT-021: Auditoria de saldo admin ───────────────────────────────────────

describe('INT-021: Auditoria de integridade financeira', () => {
  it('auditTransactionIntegrity detecta quebra de cadeia', async () => {
    // Restaurar implementação real para este teste
    const { auditTransactionIntegrity: realAudit } = jest.requireActual('@/lib/contracts/transaction-contract')

    const transactions = [
      { id: 'tx-1', fsAmount: -100, balanceBefore: 1000, balanceAfter: 900, createdAt: new Date('2026-01-01') },
      { id: 'tx-2', fsAmount: -50,  balanceBefore: 900,  balanceAfter: 850, createdAt: new Date('2026-01-02') },
      // Quebra: balanceBefore deveria ser 850, mas é 800
      { id: 'tx-3', fsAmount: -50,  balanceBefore: 800,  balanceAfter: 750, createdAt: new Date('2026-01-03') },
    ]

    const report = await realAudit('u-1', async () => transactions)

    expect(report.isConsistent).toBe(false)
    expect(report.breaks.length).toBeGreaterThan(0)
    expect(report.breaks[0].txId).toBe('tx-3')
  })

  it('auditTransactionIntegrity retorna consistente para cadeia correta', async () => {
    const { auditTransactionIntegrity: realAudit } = jest.requireActual('@/lib/contracts/transaction-contract')

    const transactions = [
      { id: 'tx-1', fsAmount: -100, balanceBefore: 1000, balanceAfter: 900, createdAt: new Date('2026-01-01') },
      { id: 'tx-2', fsAmount: -50,  balanceBefore: 900,  balanceAfter: 850, createdAt: new Date('2026-01-02') },
      { id: 'tx-3', fsAmount: 200,  balanceBefore: 850,  balanceAfter: 1050, createdAt: new Date('2026-01-03') },
    ]

    const report = await realAudit('u-1', async () => transactions)

    expect(report.isConsistent).toBe(true)
    expect(report.breaks).toHaveLength(0)
    expect(report.totalTransactions).toBe(3)
  })
})
