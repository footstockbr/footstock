// ============================================================================
// Foot Stock — Testes unitários: ShortService
// Rastreabilidade: INT-014 / TASK-4
// ============================================================================

import { ShortService } from '../ShortService'
import { AppError } from '../OrderService'
import { PLAN_TYPE } from '@/lib/enums'

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    position: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/redis', () => ({
  redisPublisher: {
    publish: jest.fn().mockResolvedValue(0),
    get: jest.fn().mockResolvedValue(null),
  },
  redis: {
    get: jest.fn().mockResolvedValue(null),
  },
}))

jest.mock('@/lib/contracts/transaction-contract', () => ({
  verifyMarginConsistency: jest.fn().mockReturnValue(true),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = require('@/lib/prisma')

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeUser(overrides = {}) {
  return {
    id: 'user-1',
    planType: PLAN_TYPE.LENDA,
    fsBalance: 15000,
    marginBlocked: 0,
    ...overrides,
  }
}

function makePosition(overrides = {}) {
  return {
    id: 'pos-1',
    userId: 'user-1',
    assetId: 'asset-1',
    quantity: 10,
    avgPrice: 100,
    side: 'SHORT',
    status: 'OPEN',
    marginBlocked: 1500,
    dailyInterestRate: 0.005,
    interestAccrued: 0,
    // asset included via prisma include — currentPrice=150 so notionalValue=10*150=1500, interest=7.5
    asset: { ticker: 'ASSET1', currentPrice: 150 },
    ...overrides,
  }
}

// Mock da Prisma transaction que executa o callback inline
function makeTxMock(user = makeUser(), position?: ReturnType<typeof makePosition>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jest.fn().mockImplementation(async (callback: (...args: any[]) => any) => {
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        findUniqueOrThrow: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue({ ...user }),
      },
      position: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        create: jest.fn().mockImplementation((args: any) => ({
          id: 'pos-new',
          ...args.data,
        })),
        update: jest.fn().mockResolvedValue({ ...(position ?? makePosition()), status: 'CLOSED' }),
      },
      transaction: {
        create: jest.fn().mockResolvedValue({ id: 'tx-1' }),
      },
    }
    return await callback(tx)
  })
}

// ─── openShort ───────────────────────────────────────────────────────────────

describe('ShortService.openShort', () => {
  let service: ShortService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new ShortService()
  })

  it('abre posição SHORT com sucesso (LENDA, margem suficiente)', async () => {
    const user = makeUser({ fsBalance: 15000 })
    mockPrisma.user.findUnique.mockResolvedValue(user)
    mockPrisma.$transaction.mockImplementation(makeTxMock(user))

    const position = await service.openShort('user-1', 'asset-1', 10, 100)

    expect(position).toBeDefined()
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('lança ORDER_051 para usuário sem plano LENDA', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ planType: PLAN_TYPE.JOGADOR }))

    await expect(service.openShort('user-1', 'asset-1', 10, 100)).rejects.toThrow(AppError)

    try {
      await service.openShort('user-1', 'asset-1', 10, 100)
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_051')
      expect((err as AppError).statusCode).toBe(403)
    }
  })

  it('lança ORDER_051 para plano CRAQUE', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ planType: PLAN_TYPE.CRAQUE }))

    try {
      await service.openShort('user-1', 'asset-1', 10, 100)
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_051')
    }
  })

  it('lança ORDER_056 quando margem insuficiente (150% de qty*price)', async () => {
    // marginRequired = 10 * 100 * 1.5 = 1500; fsBalance = 1000 < 1500
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ fsBalance: 1000 }))

    await expect(service.openShort('user-1', 'asset-1', 10, 100)).rejects.toThrow(AppError)

    try {
      await service.openShort('user-1', 'asset-1', 10, 100)
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_056')
      expect((err as AppError).statusCode).toBe(422)
    }
  })

  it('lança ORDER_056 quando margem exatamente no limite (fsBalance == marginRequired - 1)', async () => {
    // marginRequired = 10 * 100 * 1.5 = 1500; fsBalance = 1499
    mockPrisma.user.findUnique.mockResolvedValue(makeUser({ fsBalance: 1499 }))

    await expect(service.openShort('user-1', 'asset-1', 10, 100)).rejects.toThrow(AppError)
  })

  it('lança AUTH_001 quando usuário não encontrado', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)

    await expect(service.openShort('user-x', 'asset-1', 10, 100)).rejects.toThrow(AppError)

    try {
      await service.openShort('user-x', 'asset-1', 10, 100)
    } catch (err) {
      expect((err as AppError).code).toBe('AUTH_001')
      expect((err as AppError).statusCode).toBe(401)
    }
  })

  it('calcula marginRequired = quantity * price * 1.5', async () => {
    const user = makeUser({ fsBalance: 30000 })
    mockPrisma.user.findUnique.mockResolvedValue(user)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedData: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrisma.$transaction.mockImplementation(async (callback: (...args: any[]) => any) => {
      const tx = {
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue(user),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          update: jest.fn().mockImplementation((args: any) => {
            capturedData = args.data
            return user
          }),
        },
        position: { create: jest.fn().mockResolvedValue(makePosition()) },
        transaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
      }
      return await callback(tx)
    })

    await service.openShort('user-1', 'asset-1', 20, 50) // marginRequired = 20*50*1.5 = 1500

    // fsBalance deve ser 30000 - marginRequired(1500) - fee ≈ 28500
    expect(capturedData.fsBalance).toBeCloseTo(28500, 0)
    expect(capturedData.marginBlocked).toBe(1500)
  })
})

// ─── closeShort ──────────────────────────────────────────────────────────────

describe('ShortService.closeShort', () => {
  let service: ShortService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new ShortService()
  })

  it('fecha posição SHORT com lucro (preço caiu)', async () => {
    // Abriu em 100, fecha em 80: pnl = (100-80)*10 - 0 = 200
    const position = makePosition({ avgPrice: 100, quantity: 10, interestAccrued: 0, marginBlocked: 1500 })
    mockPrisma.position.findUnique.mockResolvedValue(position)

    const user = makeUser({ fsBalance: 0, marginBlocked: 1500 })
    mockPrisma.$transaction.mockImplementation(makeTxMock(user, position))

    const result = await service.closeShort('user-1', 'pos-1', 80)

    expect(result.pnl).toBeCloseTo(200, 0)
    expect(result.transaction).toBeDefined()
  })

  it('fecha posição SHORT com perda (preço subiu)', async () => {
    // Abriu em 100, fecha em 120: pnl = (100-120)*10 - 0 = -200
    const position = makePosition({ avgPrice: 100, quantity: 10, interestAccrued: 0, marginBlocked: 1500 })
    mockPrisma.position.findUnique.mockResolvedValue(position)

    const user = makeUser({ fsBalance: 0, marginBlocked: 1500 })
    mockPrisma.$transaction.mockImplementation(makeTxMock(user, position))

    const result = await service.closeShort('user-1', 'pos-1', 120)

    expect(result.pnl).toBeCloseTo(-200, 0)
  })

  it('desconta interestAccrued do pnl', async () => {
    // pnl = (100-80)*10 - 75 = 200 - 75 = 125
    const position = makePosition({ avgPrice: 100, quantity: 10, interestAccrued: 75, marginBlocked: 1500 })
    mockPrisma.position.findUnique.mockResolvedValue(position)

    const user = makeUser({ fsBalance: 0, marginBlocked: 1500 })
    mockPrisma.$transaction.mockImplementation(makeTxMock(user, position))

    const result = await service.closeShort('user-1', 'pos-1', 80)

    expect(result.pnl).toBeCloseTo(125, 0)
  })

  it('lança ORDER_080 para posição de outro usuário (IDOR)', async () => {
    mockPrisma.position.findUnique.mockResolvedValue(makePosition({ userId: 'user-2' }))

    await expect(service.closeShort('user-1', 'pos-1', 80)).rejects.toThrow(AppError)

    try {
      await service.closeShort('user-1', 'pos-1', 80)
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_080')
      expect((err as AppError).statusCode).toBe(404)
    }
  })

  it('lança ORDER_080 para posição inexistente', async () => {
    mockPrisma.position.findUnique.mockResolvedValue(null)

    await expect(service.closeShort('user-1', 'pos-1', 80)).rejects.toThrow(AppError)

    try {
      await service.closeShort('user-1', 'pos-1', 80)
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_080')
    }
  })

  it('lança ORDER_053 para posição que não é SHORT OPEN', async () => {
    mockPrisma.position.findUnique.mockResolvedValue(makePosition({ status: 'CLOSED' }))

    await expect(service.closeShort('user-1', 'pos-1', 80)).rejects.toThrow(AppError)

    try {
      await service.closeShort('user-1', 'pos-1', 80)
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_053')
    }
  })

  it('lança ORDER_053 para posição LONG', async () => {
    mockPrisma.position.findUnique.mockResolvedValue(makePosition({ side: 'LONG' }))

    try {
      await service.closeShort('user-1', 'pos-1', 80)
    } catch (err) {
      expect((err as AppError).code).toBe('ORDER_053')
    }
  })
})

// ─── accrueInterest ──────────────────────────────────────────────────────────

describe('ShortService.accrueInterest', () => {
  let service: ShortService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new ShortService()
  })

  it('retorna 0 para posição inexistente', async () => {
    mockPrisma.position.findUnique.mockResolvedValue(null)
    const result = await service.accrueInterest('pos-x')
    expect(result).toBe(0)
  })

  it('retorna 0 para posição LONG', async () => {
    mockPrisma.position.findUnique.mockResolvedValue(makePosition({ side: 'LONG' }))
    const result = await service.accrueInterest('pos-1')
    expect(result).toBe(0)
  })

  it('retorna 0 para posição CLOSED', async () => {
    mockPrisma.position.findUnique.mockResolvedValue(makePosition({ status: 'CLOSED' }))
    const result = await service.accrueInterest('pos-1')
    expect(result).toBe(0)
  })

  it('calcula juro diário = marginBlocked * dailyInterestRate', async () => {
    // marginBlocked=1500, dailyInterestRate=0.005 → dailyInterest=7.5
    const position = makePosition({ marginBlocked: 1500, dailyInterestRate: 0.005 })
    mockPrisma.position.findUnique.mockResolvedValue(position)

    const user = makeUser({ fsBalance: 1000 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrisma.$transaction.mockImplementation(async (callback: (...args: any[]) => any) => {
      const tx = {
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue(user),
          update: jest.fn().mockResolvedValue(user),
        },
        position: { update: jest.fn().mockResolvedValue(position) },
        transaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
      }
      return await callback(tx)
    })

    const dailyInterest = await service.accrueInterest('pos-1')
    expect(dailyInterest).toBe(7.5)
  })

  it('envia alerta MARGIN_CALL_ALERT quando saldo zera após cobrança', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { redisPublisher: mockRedis } = require('@/lib/redis')

    const position = makePosition({ marginBlocked: 1500, dailyInterestRate: 0.005 })
    mockPrisma.position.findUnique.mockResolvedValue(position)

    // fsBalance = 7 (quase zerado); após cobrar 7.5 → newBalance = -0.5 <= 0
    const user = makeUser({ fsBalance: 7 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrisma.$transaction.mockImplementation(async (callback: (...args: any[]) => any) => {
      const tx = {
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue(user),
          update: jest.fn().mockResolvedValue({ ...user, fsBalance: -0.5 }),
        },
        position: { update: jest.fn().mockResolvedValue(position) },
        transaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
      }
      return await callback(tx)
    })

    await service.accrueInterest('pos-1')

    expect(mockRedis.publish).toHaveBeenCalledWith(
      `notifications:${position.userId}`,
      expect.stringContaining('MARGIN_CALL_ALERT')
    )
  })

  it('não envia alerta quando saldo permanece positivo', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { redisPublisher: mockRedis } = require('@/lib/redis')

    const position = makePosition({ marginBlocked: 1500, dailyInterestRate: 0.005 })
    mockPrisma.position.findUnique.mockResolvedValue(position)

    const user = makeUser({ fsBalance: 10000 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockPrisma.$transaction.mockImplementation(async (callback: (...args: any[]) => any) => {
      const tx = {
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue(user),
          update: jest.fn().mockResolvedValue({ ...user, fsBalance: 9992.5 }),
        },
        position: { update: jest.fn().mockResolvedValue(position) },
        transaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
      }
      return await callback(tx)
    })

    await service.accrueInterest('pos-1')

    expect(mockRedis.publish).not.toHaveBeenCalled()
  })
})
