// ============================================================================
// Foot Stock — Testes unitários: OrderService
// Rastreabilidade: INT-011..020 / TASK-1
// ============================================================================

import { OrderService, AppError } from '../OrderService'
import { PLAN_TYPE, ORDER_STATUS, ORDER_TYPE } from '@/lib/enums'

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), updateMany: jest.fn() },
    asset: { findUnique: jest.fn() },
    order: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    position: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/redis', () => ({
  redisPublisher: {
    get: jest.fn().mockResolvedValue(null),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    publish: jest.fn().mockResolvedValue(0),
  },
}))

jest.mock('@/lib/contracts/order-contract', () => ({
  validateTransition: jest.fn(),
  canTransition: jest.fn().mockReturnValue(true),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = require('@/lib/prisma')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { redisPublisher: mockRedis } = require('@/lib/redis')

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeDecimal(value: number) {
  return Object.assign(value, { toNumber: () => value, valueOf: () => value })
}

function makeUser(overrides = {}) {
  return {
    id: 'user-1',
    planType: PLAN_TYPE.JOGADOR,
    fsBalance: makeDecimal(10000),
    marginBlocked: makeDecimal(0),
    ...overrides,
  }
}

function makeAsset(overrides = {}) {
  return {
    id: 'asset-1',
    ticker: 'VAR1',
    currentPrice: makeDecimal(100),
    isActive: true,
    ...overrides,
  }
}

function makeOrder(overrides = {}) {
  return {
    id: 'order-1',
    userId: 'user-1',
    assetId: 'asset-1',
    status: ORDER_STATUS.OPEN,
    type: 'MARKET',
    side: 'BUY',
    quantity: 10,
    fee: 4.5,
    ...overrides,
  }
}

// ─── Testes ─────────────────────────────────────────────────────────────────

describe('OrderService.createOrder', () => {
  let service: OrderService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new OrderService()
    mockPrisma.user.findUnique.mockResolvedValue(makeUser())
    mockPrisma.asset.findUnique.mockResolvedValue(makeAsset())
    mockPrisma.order.create.mockResolvedValue(makeOrder())
    mockPrisma.order.count.mockResolvedValue(0)
    mockRedis.get.mockResolvedValue(null) // motor online, nenhuma sessão bloqueada
    // G006: createOrder usa $transaction([user.updateMany, order.create]) — array form
    mockPrisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops))
    mockPrisma.user.updateMany.mockResolvedValue({ count: 1 }) // count:1 = saldo suficiente
  })

  it('cria ordem MARKET BUY com sucesso', async () => {
    const order = await service.createOrder('user-1', {
      ticker: 'VAR1',
      type: 'MARKET',
      side: 'BUY',
      quantity: 10,
    })
    expect(order.id).toBe('order-1')
    expect(mockPrisma.order.create).toHaveBeenCalledTimes(1)
    expect(mockRedis.publish).toHaveBeenCalledWith('orders:pending', expect.any(String))
  })

  it('lança ORDER_002 quando saldo FS$ insuficiente para BUY (debit atômico — race condition)', async () => {
    // count:0 = WHERE fsBalance >= requiredBalance não encontrou linhas.
    // Isso ocorre tanto por saldo insuficiente quanto por race condition concorrente.
    // O debit atômico via updateMany garante que fsBalance nunca vai negativo.
    mockPrisma.user.updateMany.mockResolvedValue({ count: 0 })

    await expect(
      service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 10 })
    ).rejects.toThrow(AppError)

    try {
      await service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 10 })
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_002')
      expect((err as AppError).statusCode).toBe(402)
    }
  })

  it('lança ORDER_051 quando plano não permite LIMIT (Jogador)', async () => {
    await expect(
      service.createOrder('user-1', { ticker: 'VAR1', type: 'LIMIT', side: 'BUY', quantity: 5, price: 90 })
    ).rejects.toThrow(AppError)

    try {
      await service.createOrder('user-1', { ticker: 'VAR1', type: 'LIMIT', side: 'BUY', quantity: 5, price: 90 })
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_051')
      expect((err as AppError).statusCode).toBe(403)
    }
  })

  it('lança ORDER_052 quando limite diário atingido (Jogador)', async () => {
    // Jogador limit = 2; mock Redis to return count '2' so check triggers
    mockRedis.get.mockImplementation((key: string) => {
      if (key.startsWith('order:daily:')) return Promise.resolve('2')
      return Promise.resolve(null)
    })
    mockPrisma.order.count.mockResolvedValue(2) // fallback (not used when redis works)

    await expect(
      service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    ).rejects.toThrow(AppError)

    try {
      await service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_052')
      expect((err as AppError).statusCode).toBe(429)
    }
  })

  it('lança ASSET_030 quando ativo em halt', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(makeAsset({ isActive: false }))

    await expect(
      service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    ).rejects.toThrow(AppError)

    try {
      await service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    } catch (err) {
      expect((err as AppError).code).toBe('ASSET_030')
    }
  })

  it('lança MOTOR_090 quando motor offline', async () => {
    mockRedis.get.mockImplementation((key: string) => {
      if (key === 'motor:health') return Promise.resolve('offline')
      return Promise.resolve(null)
    })

    await expect(
      service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    ).rejects.toThrow(AppError)

    try {
      await service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    } catch (err) {
      expect((err as AppError).code).toBe('MOTOR_090')
      expect((err as AppError).statusCode).toBe(503)
    }
  })

  it('lança ASSET_031 quando ativo não encontrado', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(null)

    await expect(
      service.createOrder('user-1', { ticker: 'XYZ9', type: 'MARKET', side: 'BUY', quantity: 1 })
    ).rejects.toThrow(AppError)

    try {
      await service.createOrder('user-1', { ticker: 'XYZ9', type: 'MARKET', side: 'BUY', quantity: 1 })
    } catch (err) {
      expect((err as AppError).code).toBe('ASSET_031')
    }
  })

  it('lança ASSET_030 quando halt no Redis com reason (JSON válido)', async () => {
    mockRedis.get.mockImplementation((key: string) => {
      if (key.startsWith('motor:halt:')) return Promise.resolve(JSON.stringify({ reason: 'IPO em andamento' }))
      return Promise.resolve(null)
    })

    await expect(
      service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    ).rejects.toThrow(AppError)

    try {
      await service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    } catch (err) {
      expect((err as AppError).code).toBe('ASSET_030')
    }
  })

  it('lança ASSET_030 quando halt no Redis com JSON malformado (fail safe)', async () => {
    mockRedis.get.mockImplementation((key: string) => {
      if (key.startsWith('motor:halt:')) return Promise.resolve('not-json-{')
      return Promise.resolve(null)
    })

    await expect(
      service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    ).rejects.toThrow(AppError)

    try {
      await service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    } catch (err) {
      expect((err as AppError).code).toBe('ASSET_030')
    }
  })

  it('lança SESS_040 quando sessão de mercado está FECHADO', async () => {
    mockRedis.get.mockImplementation((key: string) => {
      if (key === 'market:session') return Promise.resolve('FECHADO')
      return Promise.resolve(null)
    })

    await expect(
      service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    ).rejects.toThrow(AppError)

    try {
      await service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    } catch (err) {
      expect((err as AppError).code).toBe('SESS_040')
      expect((err as AppError).statusCode).toBe(422)
    }
  })

  it('permite ordem MARKET quando market:session Redis indisponível (fail open)', async () => {
    mockRedis.get.mockImplementation((key: string) => {
      if (key === 'market:session') return Promise.reject(new Error('Redis down'))
      return Promise.resolve(null)
    })

    const order = await service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    expect(order.id).toBe('order-1')
  })

  it('lança ORDER_050 para SELL sem posição aberta', async () => {
    mockPrisma.position.findFirst.mockResolvedValue(null)

    await expect(
      service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'SELL', quantity: 10 })
    ).rejects.toThrow(AppError)

    try {
      await service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'SELL', quantity: 10 })
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_050')
      expect((err as AppError).statusCode).toBe(402)
    }
  })

  it('lança ORDER_050 para SELL com quantidade de posição insuficiente', async () => {
    mockPrisma.position.findFirst.mockResolvedValue({ id: 'pos-1', quantity: 2 })

    try {
      await service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'SELL', quantity: 10 })
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_050')
    }
  })

  it('cria ordem MARKET SELL com posição suficiente', async () => {
    mockPrisma.position.findFirst.mockResolvedValue({ id: 'pos-1', quantity: 20 })

    const order = await service.createOrder('user-1', {
      ticker: 'VAR1',
      type: 'MARKET',
      side: 'SELL',
      quantity: 10,
    })
    expect(order.id).toBe('order-1')
    expect(mockPrisma.order.create).toHaveBeenCalledTimes(1)
  })

  it('cria ordem OCO BUY com sucesso', async () => {
    // LENDA ignora daily limit e tem todos os tipos de ordem habilitados
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ planType: PLAN_TYPE.LENDA }))

    const order = await service.createOrder('user-1', {
      ticker: 'VAR1',
      type: ORDER_TYPE.OCO,
      side: 'BUY',
      quantity: 5,
      stopLossPrice: 90,
      takeProfitPrice: 110,
    })
    expect(order.id).toBe('order-1')
    // OCO cria 2 legs + 1 updateMany = 3 ops no $transaction
    expect(mockPrisma.order.create).toHaveBeenCalledTimes(2)
    // Publica 2 eventos no Redis (uma por leg)
    expect(mockRedis.publish).toHaveBeenCalledTimes(2)
  })

  it('lança ORDER_002 para OCO com saldo insuficiente', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ planType: PLAN_TYPE.LENDA }))
    mockPrisma.user.updateMany.mockResolvedValue({ count: 0 })

    await expect(
      service.createOrder('user-1', {
        ticker: 'VAR1',
        type: ORDER_TYPE.OCO,
        side: 'BUY',
        quantity: 5,
        stopLossPrice: 90,
        takeProfitPrice: 110,
      })
    ).rejects.toThrow(AppError)

    try {
      await service.createOrder('user-1', {
        ticker: 'VAR1',
        type: ORDER_TYPE.OCO,
        side: 'BUY',
        quantity: 5,
        stopLossPrice: 90,
        takeProfitPrice: 110,
      })
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_002')
    }
  })

  it('usa fallback DB para limite diário quando Redis indisponível', async () => {
    // Redis.get throws para a chave diária, mas retorna null para outras chaves
    mockRedis.get.mockImplementation((key: string) => {
      if (key.startsWith('order:daily:')) return Promise.reject(new Error('Redis unavailable'))
      return Promise.resolve(null)
    })
    // Fallback DB retorna 0 ordens hoje → limite não atingido
    mockPrisma.order.count.mockResolvedValue(0)

    const order = await service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    expect(order.id).toBe('order-1')
    expect(mockPrisma.order.count).toHaveBeenCalled()
  })

  it('lança ORDER_052 quando fallback DB indica limite atingido', async () => {
    mockRedis.get.mockImplementation((key: string) => {
      if (key.startsWith('order:daily:')) return Promise.reject(new Error('Redis unavailable'))
      return Promise.resolve(null)
    })
    // Fallback DB retorna 2 ordens (Jogador limit = 2)
    mockPrisma.order.count.mockResolvedValue(2)

    try {
      await service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_052')
    }
  })

  it('lança AUTH_001 quando usuário não encontrado', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)

    await expect(
      service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    ).rejects.toThrow(AppError)

    try {
      await service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    } catch (err) {
      expect((err as AppError).code).toBe('AUTH_001')
      expect((err as AppError).statusCode).toBe(401)
    }
  })

  it('cria ordem BUY com leverage 2x (margem 50%) para LENDA', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ planType: PLAN_TYPE.LENDA }))
    const order = await service.createOrder('user-1', {
      ticker: 'VAR1',
      type: 'MARKET',
      side: 'BUY',
      quantity: 5,
      leverage: 2,
    })
    expect(order.id).toBe('order-1')
    expect(mockPrisma.order.create).toHaveBeenCalledTimes(1)
  })

  it('cria ordem MARKET com scheduledAt passado', async () => {
    const scheduledAt = new Date().toISOString()
    const order = await service.createOrder('user-1', {
      ticker: 'VAR1',
      type: 'MARKET',
      side: 'BUY',
      quantity: 2,
      scheduledAt,
    })
    expect(order.id).toBe('order-1')
  })

  it('lança SESS_040 com sessão desconhecida (fallback message)', async () => {
    mockRedis.get.mockImplementation((key: string) => {
      if (key === 'market:session') return Promise.resolve('MANUTENCAO_ESPECIAL')
      return Promise.resolve(null)
    })

    try {
      await service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    } catch (err) {
      expect((err as AppError).code).toBe('SESS_040')
    }
  })

  it('trata erro de Redis no check de halt (catch → null, sem halt)', async () => {
    // redis.get para motor:halt:* lança erro → .catch(() => null) → haltKey = null → sem halt
    mockRedis.get.mockImplementation((key: string) => {
      if (key.startsWith('motor:halt:')) return Promise.reject(new Error('Redis error'))
      return Promise.resolve(null)
    })

    const order = await service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    expect(order.id).toBe('order-1')
  })

  it('trata erro de Redis no motor health check (catch → null, motor tratado como online)', async () => {
    // redis.get para motor:health lança erro → .catch(() => null) → motorHealth = null → não offline → ok
    mockRedis.get.mockImplementation((key: string) => {
      if (key === 'motor:health') return Promise.reject(new Error('Redis error'))
      return Promise.resolve(null)
    })

    const order = await service.createOrder('user-1', { ticker: 'VAR1', type: 'MARKET', side: 'BUY', quantity: 1 })
    expect(order.id).toBe('order-1')
  })
})

describe('OrderService.cancelOrder', () => {
  let service: OrderService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new OrderService()
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder())
    mockPrisma.order.update.mockResolvedValue(makeOrder({ status: ORDER_STATUS.CANCELLED }))
    mockRedis.publish.mockResolvedValue(0)
    // Setup $transaction to execute callback with a tx proxy
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
      const tx = {
        order: { update: jest.fn().mockResolvedValue(makeOrder({ status: ORDER_STATUS.CANCELLED })) },
        user: { update: jest.fn().mockResolvedValue({}) },
        asset: { findUnique: jest.fn().mockResolvedValue(null) },
        position: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      }
      return callback(tx as unknown as typeof mockPrisma)
    })
  })

  it('cancela ordem OPEN com sucesso', async () => {
    const result = await service.cancelOrder('user-1', 'order-1')
    expect(result.status).toBe(ORDER_STATUS.CANCELLED)
    expect(mockRedis.publish).toHaveBeenCalledTimes(2)
  })

  it('lança ORDER_080 para ordem de outro usuário (IDOR)', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder({ userId: 'user-2' }))
    await expect(service.cancelOrder('user-1', 'order-1')).rejects.toThrow(AppError)
    try {
      await service.cancelOrder('user-1', 'order-1')
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_080')
      expect((err as AppError).statusCode).toBe(404)
    }
  })

  it('lança ORDER_053 para ordem FILLED (409)', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder({ status: ORDER_STATUS.FILLED }))
    await expect(service.cancelOrder('user-1', 'order-1')).rejects.toThrow(AppError)
    try {
      await service.cancelOrder('user-1', 'order-1')
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_053')
      expect((err as AppError).statusCode).toBe(409)
    }
  })

  it('lança ORDER_053 com status 422 para ordem não-cancelável (CANCELLED)', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder({ status: ORDER_STATUS.CANCELLED }))
    try {
      await service.cancelOrder('user-1', 'order-1')
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_053')
      expect((err as AppError).statusCode).toBe(422)
    }
  })

  it('lança ORDER_080 para ordem inexistente', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null)
    await expect(service.cancelOrder('user-1', 'order-1')).rejects.toThrow(AppError)
    try {
      await service.cancelOrder('user-1', 'order-1')
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_080')
    }
  })

  it('cancela ordem com status PARTIAL com sucesso', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder({ status: 'PARTIAL' }))
    const result = await service.cancelOrder('user-1', 'order-1')
    expect(result.status).toBe(ORDER_STATUS.CANCELLED)
  })

  it('realiza refund de saldo para ordem BUY com price', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder({ side: 'BUY', price: makeDecimal(100) }))

    let capturedTxUser: jest.Mock | undefined
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
      const tx = {
        order: { update: jest.fn().mockResolvedValue(makeOrder({ status: ORDER_STATUS.CANCELLED })) },
        user: { update: jest.fn().mockResolvedValue({}) },
        asset: { findUnique: jest.fn().mockResolvedValue(null) },
        position: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      }
      capturedTxUser = tx.user.update
      return callback(tx as unknown as typeof mockPrisma)
    })

    await service.cancelOrder('user-1', 'order-1')
    // tx.user.update deve ser chamado com incremento de fsBalance
    expect(capturedTxUser).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fsBalance: expect.anything() }) })
    )
  })

  it('libera marginBlocked para ordem SELL com posição SHORT', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder({ side: 'SELL' }))

    let capturedTxPosition: jest.Mock | undefined
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
      const tx = {
        order: { update: jest.fn().mockResolvedValue(makeOrder({ status: ORDER_STATUS.CANCELLED })) },
        user: { update: jest.fn().mockResolvedValue({}) },
        asset: { findUnique: jest.fn().mockResolvedValue(makeAsset()) },
        position: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'pos-1',
            marginBlocked: makeDecimal(500),
            quantity: 10,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      }
      capturedTxPosition = tx.position.update
      return callback(tx as unknown as typeof mockPrisma)
    })

    await service.cancelOrder('user-1', 'order-1')
    // tx.position.update deve ser chamado para decrementar marginBlocked
    expect(capturedTxPosition).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ marginBlocked: expect.anything() }) })
    )
  })
})

describe('OrderService.getOrder', () => {
  let service: OrderService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new OrderService()
  })

  it('retorna ordem do usuário correto', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder())
    const order = await service.getOrder('user-1', 'order-1')
    expect(order.id).toBe('order-1')
  })

  it('lança ORDER_080 para ordem de outro usuário (IDOR)', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(makeOrder({ userId: 'user-2' }))
    await expect(service.getOrder('user-1', 'order-1')).rejects.toThrow(AppError)
    try {
      await service.getOrder('user-1', 'order-1')
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_080')
    }
  })
})

describe('OrderService.getOrders', () => {
  let service: OrderService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new OrderService()
    mockPrisma.order.findMany.mockResolvedValue([makeOrder()])
    mockPrisma.order.count.mockResolvedValue(1)
  })

  it('retorna lista paginada sem filtros', async () => {
    const result = await service.getOrders('user-1', {})
    expect(result.data).toHaveLength(1)
    expect(result.pagination.total).toBe(1)
    expect(result.pagination.page).toBe(1)
    expect(result.pagination.totalPages).toBe(1)
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    )
  })

  it('aplica filtro por status', async () => {
    await service.getOrders('user-1', { status: ORDER_STATUS.OPEN })
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: ORDER_STATUS.OPEN }) })
    )
  })

  it('aplica filtro por type', async () => {
    await service.getOrders('user-1', { type: ORDER_TYPE.MARKET })
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: ORDER_TYPE.MARKET }) })
    )
  })

  it('retorna lista vazia quando ticker não encontrado', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(null)
    const result = await service.getOrders('user-1', { ticker: 'INEXISTENTE' })
    expect(result.data).toHaveLength(0)
    expect(result.pagination.total).toBe(0)
    expect(result.pagination.totalPages).toBe(0)
    expect(mockPrisma.order.findMany).not.toHaveBeenCalled()
  })

  it('aplica filtro por ticker quando ativo encontrado', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(makeAsset())
    const result = await service.getOrders('user-1', { ticker: 'VAR1' })
    expect(result.data).toHaveLength(1)
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ assetId: 'asset-1' }) })
    )
  })

  it('respeita paginação (page e limit)', async () => {
    mockPrisma.order.count.mockResolvedValue(50)
    mockPrisma.order.findMany.mockResolvedValue([makeOrder()])
    const result = await service.getOrders('user-1', { page: 2, limit: 10 })
    expect(result.pagination.page).toBe(2)
    expect(result.pagination.limit).toBe(10)
    expect(result.pagination.totalPages).toBe(5)
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 })
    )
  })

  it('aplica cap de 100 no limit', async () => {
    await service.getOrders('user-1', { limit: 9999 })
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    )
  })
})
