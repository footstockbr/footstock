/**
 * @jest-environment node
 */
// ============================================================================
// OrderMatcher — Testes Unitários
// Cobre: LIMIT BUY dispara quando currentPrice <= limitPrice,
//        LIMIT SELL dispara quando currentPrice >= limitPrice,
//        cálculo de price improvement, OCO take-profit cancela stop-loss,
//        OCO stop-loss cancela take-profit, batch-100, par OCO incompleto.
// ============================================================================

import { OrderMatcher } from '../OrderMatcher'

// ─── Mocks de módulos ────────────────────────────────────────────────────────
jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

// ─── Factories ───────────────────────────────────────────────────────────────
function makeLimitOrder(overrides: Partial<any> = {}): any {
  return {
    id: 'order-limit-001',
    userId: 'user-001',
    assetId: 'asset-001',
    type: 'LIMIT',
    status: 'OPEN',
    side: 'BUY',
    quantity: 5,
    price: 100, // limitPrice
    groupId: null,
    createdAt: new Date(),
    asset: { ticker: 'CRAQUE10' },
    ...overrides,
  }
}

function makeOcoOrder(overrides: Partial<any> = {}): any {
  return {
    id: 'oco-001',
    userId: 'user-001',
    assetId: 'asset-001',
    type: 'OCO',
    status: 'OPEN',
    side: 'SELL',
    quantity: 5,
    price: 120, // take-profit (maior)
    groupId: 'group-001',
    createdAt: new Date(),
    asset: { ticker: 'CRAQUE10' },
    ...overrides,
  }
}

function makeUser(overrides: Partial<any> = {}): any {
  return {
    id: 'user-001',
    fsBalance: 5000,
    planType: 'CRAQUE',
    ...overrides,
  }
}

// ─── Mock Prisma ─────────────────────────────────────────────────────────────
function makePrisma(orders: any[] = [], user: any = makeUser(), pairOrders: any[] = []): any {
  let findManyCallCount = 0

  const txMock = {
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue({}),
    },
    order: {
      // CAS claim do settlement + cancelamento de grupo OCO
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    position: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    transaction: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  }

  return {
    order: {
      findMany: jest.fn().mockImplementation(() => {
        // Primeira chamada retorna ordens principais; chamadas subsequentes retornam par OCO
        findManyCallCount++
        return findManyCallCount === 1 ? Promise.resolve(orders) : Promise.resolve(pairOrders)
      }),
    },
    $transaction: jest.fn().mockImplementation((fn: (tx: any) => Promise<any>) => fn(txMock)),
    _tx: txMock,
  }
}

// ─── Mock Redis ───────────────────────────────────────────────────────────────
function makeRedis(): any {
  return {
    publish: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  }
}

// ─── Testes ──────────────────────────────────────────────────────────────────
describe('OrderMatcher', () => {
  let prisma: ReturnType<typeof makePrisma>
  let redis: ReturnType<typeof makeRedis>
  let matcher: OrderMatcher

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('checkLimitOrders — limite de batch', () => {
    test('busca no máximo 100 ordens por execução (take=100)', async () => {
      prisma = makePrisma([])
      redis = makeRedis()
      matcher = new OrderMatcher(prisma, redis)

      await matcher.checkLimitOrders({})

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      )
    })
  })

  describe('checkLimitOrders — sem ordens', () => {
    test('retorna sem executar transações quando não há ordens', async () => {
      prisma = makePrisma([])
      redis = makeRedis()
      matcher = new OrderMatcher(prisma, redis)

      await matcher.checkLimitOrders({ CRAQUE10: 90 })

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('LIMIT BUY — condição de disparo', () => {
    test('executa quando currentPrice <= limitPrice (exatamente no preço)', async () => {
      const order = makeLimitOrder({ side: 'BUY', price: 100 })
      prisma = makePrisma([order])
      redis = makeRedis()
      matcher = new OrderMatcher(prisma, redis)

      await matcher.checkLimitOrders({ CRAQUE10: 100 })

      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })

    test('executa quando currentPrice < limitPrice (price improvement)', async () => {
      const order = makeLimitOrder({ side: 'BUY', price: 100 })
      prisma = makePrisma([order])
      redis = makeRedis()
      matcher = new OrderMatcher(prisma, redis)

      await matcher.checkLimitOrders({ CRAQUE10: 95 })

      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })

    test('NÃO executa quando currentPrice > limitPrice', async () => {
      const order = makeLimitOrder({ side: 'BUY', price: 100 })
      prisma = makePrisma([order])
      redis = makeRedis()
      matcher = new OrderMatcher(prisma, redis)

      await matcher.checkLimitOrders({ CRAQUE10: 105 })

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('LIMIT SELL — condição de disparo', () => {
    test('executa quando currentPrice >= limitPrice (exatamente no preço)', async () => {
      const order = makeLimitOrder({ side: 'SELL', price: 80 })
      prisma = makePrisma([order])
      redis = makeRedis()
      matcher = new OrderMatcher(prisma, redis)

      await matcher.checkLimitOrders({ CRAQUE10: 80 })

      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })

    test('executa quando currentPrice > limitPrice (price improvement para SELL)', async () => {
      const order = makeLimitOrder({ side: 'SELL', price: 80 })
      prisma = makePrisma([order])
      redis = makeRedis()
      matcher = new OrderMatcher(prisma, redis)

      await matcher.checkLimitOrders({ CRAQUE10: 85 })

      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })

    test('NÃO executa quando currentPrice < limitPrice', async () => {
      const order = makeLimitOrder({ side: 'SELL', price: 80 })
      prisma = makePrisma([order])
      redis = makeRedis()
      matcher = new OrderMatcher(prisma, redis)

      await matcher.checkLimitOrders({ CRAQUE10: 75 })

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('LIMIT — price improvement', () => {
    test('BUY: melhoria = limitPrice - currentPrice (paga menos que o limite)', async () => {
      // limitPrice=100, currentPrice=90 → improvement=10
      const order = makeLimitOrder({ side: 'BUY', price: 100 })
      prisma = makePrisma([order])
      redis = makeRedis()

      let capturedExecutionPrice: number | undefined
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          user: { findUniqueOrThrow: jest.fn().mockResolvedValue(makeUser()), update: jest.fn() },
          order: {
            // O preço de execução é gravado no CAS claim (updateMany)
            updateMany: jest.fn().mockImplementation(({ data }: any) => {
              if (data && typeof data.executedPrice === 'number') capturedExecutionPrice = data.executedPrice
              return { count: 1 }
            }),
            update: jest.fn().mockResolvedValue({}),
          },
          position: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
          transaction: { create: jest.fn() },
        }
        return fn(tx)
      })

      matcher = new OrderMatcher(prisma, redis)
      await matcher.checkLimitOrders({ CRAQUE10: 90 })

      // Executa ao preço atual (90), melhor que o limite (100)
      expect(capturedExecutionPrice).toBe(90)
    })

    test('SELL: melhoria = currentPrice - limitPrice (recebe mais que o limite)', async () => {
      const order = makeLimitOrder({ side: 'SELL', price: 80 })
      prisma = makePrisma([order])
      redis = makeRedis()

      let capturedExecutionPrice: number | undefined
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          user: { findUniqueOrThrow: jest.fn().mockResolvedValue(makeUser()), update: jest.fn() },
          order: {
            updateMany: jest.fn().mockImplementation(({ data }: any) => {
              if (data && typeof data.executedPrice === 'number') capturedExecutionPrice = data.executedPrice
              return { count: 1 }
            }),
            update: jest.fn().mockResolvedValue({}),
          },
          position: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
          transaction: { create: jest.fn() },
        }
        return fn(tx)
      })

      matcher = new OrderMatcher(prisma, redis)
      await matcher.checkLimitOrders({ CRAQUE10: 88 })

      // Executa ao preço atual (88), melhor que o limite (80)
      expect(capturedExecutionPrice).toBe(88)
    })
  })

  describe('LIMIT — ticker sem preço', () => {
    test('pula ordem quando ticker não está em currentPrices', async () => {
      const order = makeLimitOrder({ asset: { ticker: 'SEM_PRECO' } })
      prisma = makePrisma([order])
      redis = makeRedis()
      matcher = new OrderMatcher(prisma, redis)

      await matcher.checkLimitOrders({ OUTRO: 50 })

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('OCO — take-profit dispara e cancela stop-loss', () => {
    test('quando currentPrice >= takeProfitPrice, executa take-profit e cancela stop-loss', async () => {
      const takeProfitOrder = makeOcoOrder({ id: 'oco-tp', price: 120, groupId: 'grp-001' })
      const stopLossOrder = makeOcoOrder({ id: 'oco-sl', price: 80, groupId: 'grp-001' })

      // findMany: primeira chamada retorna a ordem OCO principal, segunda retorna o par
      prisma = makePrisma([takeProfitOrder], makeUser(), [takeProfitOrder, stopLossOrder])
      redis = makeRedis()
      matcher = new OrderMatcher(prisma, redis)

      await matcher.checkLimitOrders({ CRAQUE10: 125 }) // acima do take-profit

      // Deve executar transação (take-profit executado)
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)

      // Deve cancelar o stop-loss via Redis
      expect(redis.publish).toHaveBeenCalledWith(
        expect.stringContaining('orders:cancelled:'),
        expect.stringContaining(`"orderId":"${stopLossOrder.id}"`)
      )
    })
  })

  describe('OCO — stop-loss dispara e cancela take-profit', () => {
    test('quando currentPrice <= stopLossPrice, executa stop-loss e cancela take-profit', async () => {
      const takeProfitOrder = makeOcoOrder({ id: 'oco-tp', price: 120, groupId: 'grp-002' })
      const stopLossOrder = makeOcoOrder({ id: 'oco-sl', price: 80, groupId: 'grp-002' })

      prisma = makePrisma([stopLossOrder], makeUser(), [takeProfitOrder, stopLossOrder])
      redis = makeRedis()
      matcher = new OrderMatcher(prisma, redis)

      await matcher.checkLimitOrders({ CRAQUE10: 75 }) // abaixo do stop-loss

      expect(prisma.$transaction).toHaveBeenCalledTimes(1)

      // Deve cancelar o take-profit
      expect(redis.publish).toHaveBeenCalledWith(
        expect.stringContaining('orders:cancelled:'),
        expect.stringContaining(`"orderId":"${takeProfitOrder.id}"`)
      )
    })
  })

  describe('OCO — par com menos de 2 pernas', () => {
    test('pula execução quando par OCO tem menos de 2 ordens abertas', async () => {
      const singleOcoOrder = makeOcoOrder({ id: 'oco-solo', groupId: 'grp-solo' })

      // Par retornado tem apenas 1 perna (outra já foi processada)
      prisma = makePrisma([singleOcoOrder], makeUser(), [singleOcoOrder])
      redis = makeRedis()
      matcher = new OrderMatcher(prisma, redis)

      await matcher.checkLimitOrders({ CRAQUE10: 130 })

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('OCO — notificações publicadas', () => {
    test('publica em orders:executed, orders:cancelled e notifications após OCO', async () => {
      const takeProfitOrder = makeOcoOrder({ id: 'oco-tp', price: 120, groupId: 'grp-003' })
      const stopLossOrder = makeOcoOrder({ id: 'oco-sl', price: 80, groupId: 'grp-003' })

      prisma = makePrisma([takeProfitOrder], makeUser(), [takeProfitOrder, stopLossOrder])
      redis = makeRedis()
      matcher = new OrderMatcher(prisma, redis)

      await matcher.checkLimitOrders({ CRAQUE10: 125 })

      const publishedChannels = redis.publish.mock.calls.map(([channel]: [string]) => channel)
      expect(publishedChannels).toContain(`orders:executed:${takeProfitOrder.userId}`)
      expect(publishedChannels).toContain(`orders:cancelled:${takeProfitOrder.userId}`)
      expect(publishedChannels).toContain(`notifications:${takeProfitOrder.userId}`)
    })
  })

  describe('LIMIT — CAS de status (anti double-fill)', () => {
    test('reivindica a ordem via updateMany com guarda status OPEN/PARTIAL ao executar LIMIT', async () => {
      const order = makeLimitOrder({ status: 'OPEN' })
      prisma = makePrisma([order])
      redis = makeRedis()
      matcher = new OrderMatcher(prisma, redis)

      await matcher.checkLimitOrders({ CRAQUE10: 100 })

      expect(prisma._tx.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: order.id, status: { in: ['OPEN', 'PARTIAL'] } }),
          data: expect.objectContaining({ status: 'FILLED' }),
        })
      )
    })
  })
})
