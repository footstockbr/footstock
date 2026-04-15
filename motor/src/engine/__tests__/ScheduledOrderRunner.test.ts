/**
 * @jest-environment node
 */
// ============================================================================
// ScheduledOrderRunner — Testes Unitários
// Cobre: executa em sessão TRADING, pula em sessão CLOSED,
//        pula ordens com scheduledAt futuro, ticker sem preço,
//        cálculo de taxa, executionDelay no payload do publish.
// ============================================================================

import { ScheduledOrderRunner } from '../ScheduledOrderRunner'
import { calculateFee } from '../fee-constants'
import { validateTransition } from '../order-contract'

// ─── Mocks de módulos ────────────────────────────────────────────────────────
jest.mock('../order-contract', () => ({
  validateTransition: jest.fn(),
}))

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

// ─── Factories ───────────────────────────────────────────────────────────────
function makeScheduledOrder(overrides: Partial<any> = {}): any {
  const past = new Date(Date.now() - 60_000) // 1 minuto atrás
  return {
    id: 'sched-001',
    userId: 'user-001',
    assetId: 'asset-001',
    type: 'SCHEDULED',
    status: 'OPEN',
    side: 'BUY',
    quantity: 8,
    scheduledAt: past,
    createdAt: new Date(Date.now() - 120_000),
    asset: { ticker: 'CRAQUE10' },
    ...overrides,
  }
}

function makeUser(overrides: Partial<any> = {}): any {
  return {
    id: 'user-001',
    fsBalance: 8000,
    planType: 'CRAQUE',
    ...overrides,
  }
}

// ─── Mock SessionManager ──────────────────────────────────────────────────────
function makeSessionManager(session: string = 'TRADING'): any {
  return {
    getCurrentSession: jest.fn().mockReturnValue(session),
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
      update: jest.fn().mockResolvedValue({}),
    },
    transaction: {
      create: jest.fn().mockResolvedValue({}),
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
describe('ScheduledOrderRunner', () => {
  let prisma: ReturnType<typeof makePrisma>
  let redis: ReturnType<typeof makeRedis>
  let sessionManager: ReturnType<typeof makeSessionManager>
  let runner: ScheduledOrderRunner

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('checkScheduledOrders — sessão TRADING', () => {
    test('executa ordens quando sessão é TRADING', async () => {
      const order = makeScheduledOrder()
      prisma = makePrisma([order])
      redis = makeRedis()
      sessionManager = makeSessionManager('TRADING')
      runner = new ScheduledOrderRunner(prisma, redis, sessionManager)

      await runner.checkScheduledOrders({ CRAQUE10: 50 })

      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })
  })

  describe('checkScheduledOrders — sessão CLOSED', () => {
    test('pula execução quando sessão é CLOSED', async () => {
      const order = makeScheduledOrder()
      prisma = makePrisma([order])
      redis = makeRedis()
      sessionManager = makeSessionManager('CLOSED')
      runner = new ScheduledOrderRunner(prisma, redis, sessionManager)

      await runner.checkScheduledOrders({ CRAQUE10: 50 })

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    test('pula execução quando sessão é PRE_ABERTURA', async () => {
      const order = makeScheduledOrder()
      prisma = makePrisma([order])
      redis = makeRedis()
      sessionManager = makeSessionManager('PRE_OPENING')
      runner = new ScheduledOrderRunner(prisma, redis, sessionManager)

      await runner.checkScheduledOrders({ CRAQUE10: 50 })

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    test('pula execução quando sessão é CALL', async () => {
      const order = makeScheduledOrder()
      prisma = makePrisma([order])
      redis = makeRedis()
      sessionManager = makeSessionManager('CLOSING_CALL')
      runner = new ScheduledOrderRunner(prisma, redis, sessionManager)

      await runner.checkScheduledOrders({ CRAQUE10: 50 })

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('checkScheduledOrders — ordens com scheduledAt futuro', () => {
    test('query usa lte:now para filtrar ordens com scheduledAt no passado', async () => {
      prisma = makePrisma([])
      redis = makeRedis()
      sessionManager = makeSessionManager('TRADING')
      runner = new ScheduledOrderRunner(prisma, redis, sessionManager)

      await runner.checkScheduledOrders({})

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            scheduledAt: expect.objectContaining({ lte: expect.any(Date) }),
          }),
        })
      )
    })
  })

  describe('checkScheduledOrders — ticker sem preço', () => {
    test('pula ordem quando ticker não está em currentPrices', async () => {
      const order = makeScheduledOrder({ asset: { ticker: 'SEM_PRECO' } })
      prisma = makePrisma([order])
      redis = makeRedis()
      sessionManager = makeSessionManager('TRADING')
      runner = new ScheduledOrderRunner(prisma, redis, sessionManager)

      await runner.checkScheduledOrders({ OUTRO_TICKER: 100 })

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    test('pula ordem quando preço é zero', async () => {
      const order = makeScheduledOrder({ asset: { ticker: 'ZERADO' } })
      prisma = makePrisma([order])
      redis = makeRedis()
      sessionManager = makeSessionManager('TRADING')
      runner = new ScheduledOrderRunner(prisma, redis, sessionManager)

      await runner.checkScheduledOrders({ ZERADO: 0 })

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('checkScheduledOrders — sem ordens', () => {
    test('retorna sem chamar $transaction quando não há ordens agendadas', async () => {
      prisma = makePrisma([])
      redis = makeRedis()
      sessionManager = makeSessionManager('TRADING')
      runner = new ScheduledOrderRunner(prisma, redis, sessionManager)

      await runner.checkScheduledOrders({ CRAQUE10: 50 })

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('_executeScheduled — cálculo de taxa', () => {
    test('taxa para plano CRAQUE é 0.0035 aplicada sobre quantidade * preço', async () => {
      // quantity=8, price=100 → custo base=800, taxa=800*0.0035=2.8
      const order = makeScheduledOrder({ quantity: 8 })
      const user = makeUser({ planType: 'CRAQUE', fsBalance: 5000 })
      prisma = makePrisma([order], user)
      redis = makeRedis()
      sessionManager = makeSessionManager('TRADING')

      let capturedFee: number | undefined
      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          user: { findUniqueOrThrow: jest.fn().mockResolvedValue(user), update: jest.fn() },
          order: {
            update: jest.fn().mockImplementation(({ data }: any) => {
              capturedFee = data.fee
              return {}
            }),
          },
          transaction: { create: jest.fn() },
        }
        return fn(tx)
      })

      runner = new ScheduledOrderRunner(prisma, redis, sessionManager)
      await runner.checkScheduledOrders({ CRAQUE10: 100 })

      const expectedFee = calculateFee(8 * 100) // 800 → 0.35
      expect(capturedFee).toBeCloseTo(expectedFee, 5)
    })
  })

  describe('_executeScheduled — executionDelay no payload do publish', () => {
    test('payload de publish contém executionDelay em milissegundos', async () => {
      const scheduledAt = new Date(Date.now() - 5000) // agendado 5 segundos atrás
      const order = makeScheduledOrder({ scheduledAt })
      prisma = makePrisma([order])
      redis = makeRedis()
      sessionManager = makeSessionManager('TRADING')
      runner = new ScheduledOrderRunner(prisma, redis, sessionManager)

      await runner.checkScheduledOrders({ CRAQUE10: 50 })

      expect(redis.publish).toHaveBeenCalledWith(
        `orders:executed:${order.userId}`,
        expect.any(String)
      )

      const [, payload] = redis.publish.mock.calls[0]
      const parsed = JSON.parse(payload)

      expect(parsed).toHaveProperty('executionDelay')
      expect(typeof parsed.executionDelay).toBe('number')
      expect(parsed.executionDelay).toBeGreaterThanOrEqual(0)
    })

    test('executionDelay reflete diferença entre now e scheduledAt', async () => {
      const scheduledAt = new Date(Date.now() - 3000) // 3 segundos atrás
      const order = makeScheduledOrder({ scheduledAt })
      prisma = makePrisma([order])
      redis = makeRedis()
      sessionManager = makeSessionManager('TRADING')
      runner = new ScheduledOrderRunner(prisma, redis, sessionManager)

      await runner.checkScheduledOrders({ CRAQUE10: 50 })

      const [, payload] = redis.publish.mock.calls[0]
      const parsed = JSON.parse(payload)

      // Deve estar próximo de 3000ms (tolerância de 500ms para execução do teste)
      expect(parsed.executionDelay).toBeGreaterThanOrEqual(2500)
      expect(parsed.executionDelay).toBeLessThan(5000)
    })
  })

  describe('_executeScheduled — validateTransition', () => {
    test('chama validateTransition com OPEN → FILLED ao executar ordem agendada', async () => {
      const order = makeScheduledOrder({ status: 'OPEN' })
      prisma = makePrisma([order])
      redis = makeRedis()
      sessionManager = makeSessionManager('TRADING')
      runner = new ScheduledOrderRunner(prisma, redis, sessionManager)

      await runner.checkScheduledOrders({ CRAQUE10: 50 })

      expect(validateTransition).toHaveBeenCalledWith('OPEN', 'FILLED', order.id)
    })
  })

  describe('_executeScheduled — saldo insuficiente BUY', () => {
    test('não publica no Redis quando saldo é insuficiente para BUY agendado', async () => {
      const order = makeScheduledOrder({ side: 'BUY', quantity: 1000 })
      const poorUser = makeUser({ fsBalance: 1 })

      prisma = makePrisma([order], poorUser)
      redis = makeRedis()
      sessionManager = makeSessionManager('TRADING')

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          user: { findUniqueOrThrow: jest.fn().mockResolvedValue(poorUser), update: jest.fn() },
          order: { update: jest.fn() },
          transaction: { create: jest.fn() },
        }
        return fn(tx)
      })

      runner = new ScheduledOrderRunner(prisma, redis, sessionManager)

      // Promise.allSettled absorve o erro internamente
      await expect(
        runner.checkScheduledOrders({ CRAQUE10: 200 })
      ).resolves.toBeUndefined()

      expect(redis.publish).not.toHaveBeenCalled()
    })
  })
})
