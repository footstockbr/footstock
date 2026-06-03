/**
 * @jest-environment node
 */
// ============================================================================
// OrderExecutor — Testes Unitários
// Cobre: batch-50, isolamento Promise.allSettled, ticker sem preço,
//        publish Redis pós-execução, saldo insuficiente BUY,
//        validateTransition, cálculo de taxa por plano.
// ============================================================================

import { OrderExecutor } from '../OrderExecutor'
import { calculateFee } from '../fee-constants'

// ─── Mocks de módulos ────────────────────────────────────────────────────────

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

// ─── Factories ───────────────────────────────────────────────────────────────
function makeOrder(overrides: Partial<any> = {}): any {
  return {
    id: 'order-001',
    userId: 'user-001',
    assetId: 'asset-001',
    type: 'MARKET',
    status: 'OPEN',
    side: 'BUY',
    quantity: 10,
    leverageMultiplier: 1,
    createdAt: new Date(),
    asset: { ticker: 'CRAQUE10', currentPrice: { toNumber: () => 50 } },
    ...overrides,
  }
}

function makeUser(overrides: Partial<any> = {}): any {
  return {
    id: 'user-001',
    fsBalance: 10000,
    planType: 'JOGADOR',
    ...overrides,
  }
}

// ─── Mock Prisma ─────────────────────────────────────────────────────────────
function makePrisma(orders: any[] = [], user: any = makeUser()): any {
  const txMock = {
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue({}),
    },
    order: {
      // CAS claim do settlement: reivindica a ordem (status OPEN/PARTIAL → FILLED)
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
      findMany: jest.fn().mockResolvedValue(orders),
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
describe('OrderExecutor', () => {
  let prisma: ReturnType<typeof makePrisma>
  let redis: ReturnType<typeof makeRedis>
  let executor: OrderExecutor

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('processPendingMarketOrders — sem ordens', () => {
    test('retorna sem chamar $transaction quando não há ordens OPEN', async () => {
      prisma = makePrisma([])
      redis = makeRedis()
      executor = new OrderExecutor(prisma, redis)

      await executor.processPendingMarketOrders({ CRAQUE10: 50 })

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('processPendingMarketOrders — limite de batch', () => {
    test('busca no máximo 50 ordens por execução (take=50)', async () => {
      prisma = makePrisma([])
      redis = makeRedis()
      executor = new OrderExecutor(prisma, redis)

      await executor.processPendingMarketOrders({})

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 })
      )
    })
  })

  describe('processPendingMarketOrders — isolamento com Promise.allSettled', () => {
    test('uma ordem falhando não impede execução das demais', async () => {
      const orders = [
        makeOrder({ id: 'order-ok', asset: { ticker: 'CRAQUE10' } }),
        makeOrder({ id: 'order-fail', asset: { ticker: 'LENDA20' } }),
      ]
      prisma = makePrisma(orders)
      redis = makeRedis()

      // Primeira chamada de $transaction falha, segunda succeed
      prisma.$transaction
        .mockRejectedValueOnce(new Error('Falha simulada na ordem order-fail'))
        .mockResolvedValueOnce(undefined)

      executor = new OrderExecutor(prisma, redis)

      // Não deve lançar exceção — Promise.allSettled absorve falhas
      await expect(
        executor.processPendingMarketOrders({ CRAQUE10: 50, LENDA20: 100 })
      ).resolves.toBeUndefined()
    })
  })

  describe('processPendingMarketOrders — ticker sem preço', () => {
    test('pula ordem quando ticker não está em currentPrices', async () => {
      const order = makeOrder({ asset: { ticker: 'SEM_PRECO' } })
      prisma = makePrisma([order])
      redis = makeRedis()
      executor = new OrderExecutor(prisma, redis)

      await executor.processPendingMarketOrders({ OUTRO_TICKER: 99 })

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    test('pula ordem quando preço é zero', async () => {
      const order = makeOrder({ asset: { ticker: 'ZERO' } })
      prisma = makePrisma([order])
      redis = makeRedis()
      executor = new OrderExecutor(prisma, redis)

      await executor.processPendingMarketOrders({ ZERO: 0 })

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('_executeOrder — publish Redis após execução', () => {
    test('publica no canal orders:executed:{userId} após ordem executada', async () => {
      const order = makeOrder()
      prisma = makePrisma([order])
      redis = makeRedis()
      executor = new OrderExecutor(prisma, redis)

      await executor.processPendingMarketOrders({ CRAQUE10: 50 })

      expect(redis.publish).toHaveBeenCalledWith(
        `orders:executed:${order.userId}`,
        expect.stringContaining(`"orderId":"${order.id}"`)
      )
    })

    test('payload do publish contém ticker, price, quantity e side', async () => {
      const order = makeOrder({ side: 'BUY', quantity: 10, asset: { ticker: 'CRAQUE10' } })
      prisma = makePrisma([order])
      redis = makeRedis()
      executor = new OrderExecutor(prisma, redis)

      await executor.processPendingMarketOrders({ CRAQUE10: 50 })

      const [, payload] = redis.publish.mock.calls[0]
      const parsed = JSON.parse(payload)
      expect(parsed).toMatchObject({
        orderId: order.id,
        ticker: 'CRAQUE10',
        price: 50,
        quantity: 10,
        side: 'BUY',
      })
    })
  })

  describe('_executeOrder — saldo insuficiente no fill (debit-on-execute)', () => {
    test('cancela a ordem (sem orders:executed) e notifica quando saldo não cobre o fill', async () => {
      const order = makeOrder({ side: 'BUY', quantity: 100 })
      const poorUser = makeUser({ fsBalance: 1 }) // saldo insuficiente p/ qty=100 × 50
      prisma = makePrisma([order], poorUser)
      redis = makeRedis()

      const orderUpdate = jest.fn().mockResolvedValue({})
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          user: {
            findUniqueOrThrow: jest.fn().mockResolvedValue(poorUser),
            update: jest.fn().mockResolvedValue({}),
          },
          order: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }), // CAS claim OK
            update: orderUpdate, // reverte para CANCELLED
          },
          position: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
          transaction: { create: jest.fn().mockResolvedValue({}) },
        }
        return fn(tx)
      })

      executor = new OrderExecutor(prisma, redis)

      await expect(
        executor.processPendingMarketOrders({ CRAQUE10: 50 })
      ).resolves.toBeUndefined()

      // A ordem é revertida para CANCELLED (debit-on-execute: nada a deixar OPEN)
      expect(orderUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELLED' }) })
      )
      // Não publica execução; publica cancelamento por saldo insuficiente
      const channels = redis.publish.mock.calls.map(([c]: [string]) => c)
      expect(channels).not.toContain(`orders:executed:${order.userId}`)
      expect(channels).toContain(`orders:cancelled:${order.userId}`)
    })
  })

  describe('_executeOrder — CAS de status (anti double-fill)', () => {
    test('reivindica a ordem via updateMany com guarda status OPEN/PARTIAL', async () => {
      const order = makeOrder({ status: 'OPEN' })
      prisma = makePrisma([order])
      redis = makeRedis()

      executor = new OrderExecutor(prisma, redis)
      await executor.processPendingMarketOrders({ CRAQUE10: 50 })

      expect(prisma._tx.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: order.id, status: { in: ['OPEN', 'PARTIAL'] } }),
          data: expect.objectContaining({ status: 'FILLED' }),
        })
      )
    })

    test('não liquida nem publica quando o CAS não reivindica (ordem já liquidada)', async () => {
      const order = makeOrder({ status: 'OPEN' })
      prisma = makePrisma([order])
      // CAS retorna count=0 → já liquidada por outro tick
      prisma._tx.order.updateMany.mockResolvedValueOnce({ count: 0 })
      redis = makeRedis()

      executor = new OrderExecutor(prisma, redis)
      await executor.processPendingMarketOrders({ CRAQUE10: 50 })

      expect(prisma._tx.user.update).not.toHaveBeenCalled()
      expect(redis.publish).not.toHaveBeenCalled()
    })
  })

  describe('_executeOrder — cálculo de taxa fixa por faixa (INTAKE canônico)', () => {
    test('taxa fixa FS$ 0.35 para operação de FS$ 1000 (qty=10, price=100)', async () => {
      // quantity=10, price=100 → operationValue=1000, taxa=0.35 (faixa FS$500-1000)
      const order = makeOrder({ quantity: 10 })
      const user = makeUser({ planType: 'JOGADOR', fsBalance: 2000 })
      prisma = makePrisma([order], user)
      redis = makeRedis()

      let capturedFee: number | undefined
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          user: { findUniqueOrThrow: jest.fn().mockResolvedValue(user), update: jest.fn() },
          order: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            update: jest.fn().mockImplementation(({ data }: any) => {
              if (data && typeof data.fee === 'number') capturedFee = data.fee
              return {}
            }),
          },
          position: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
          transaction: { create: jest.fn() },
        }
        return fn(tx)
      })

      executor = new OrderExecutor(prisma, redis)
      await executor.processPendingMarketOrders({ CRAQUE10: 100 })

      const expectedFee = calculateFee(10 * 100) // 1000 → 0.35
      expect(capturedFee).toBeCloseTo(expectedFee, 5)
    })

    test('calculateFee retorna taxa fixa por faixa de valor', () => {
      expect(calculateFee(400)).toBe(0.25)   // ≤ FS$ 500
      expect(calculateFee(800)).toBe(0.35)   // FS$ 500-1000
      expect(calculateFee(1500)).toBe(0.45)  // > FS$ 1000
    })
  })
})
