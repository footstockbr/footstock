/**
 * @jest-environment node
 */
// ============================================================================
// Fiacao do ciclo de retentativa nos TRES executores (Fase 3, 2026-09-02)
//
// `orderRetry` tem testes de unidade proprios (orderRetry.test.ts). O que este
// arquivo trava e a FIACAO — que e onde o defeito realmente morava:
//
//   - o filtro de elegibilidade tem de estar no WHERE da varredura, nao em
//     memoria depois do findMany: com `take` fixo, filtrar depois gasta o slot
//     do lote com ordem em backoff, que e a starvation original;
//   - os tres catches tem de contabilizar a tentativa. OrderExecutor relanca
//     (alimenta o agregado BATCH_FAIL) e os outros dois nao — a assimetria e
//     pre-existente, e por isso mesmo cada um precisa do seu proprio teste;
//   - falha de PRECONDICAO (ticker sem preco no tick) NAO pode contar como
//     tentativa. Contar cancelaria ordem sa por EXECUTION_RETRY_EXHAUSTED — o
//     risco numero um desta fase, e o unico que a base historica dispararia em
//     massa (causa raiz: MarketEngine.loadAssets() so roda no boot).
// ============================================================================

import { OrderExecutor } from '../OrderExecutor'
import { OrderMatcher } from '../OrderMatcher'
import { ScheduledOrderRunner } from '../ScheduledOrderRunner'
import { settleOrderFill } from '../settlement'
import { MAX_ATTEMPTS } from '../orderRetry'

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  motorMetrics: { observe: jest.fn(), increment: jest.fn() },
}))

jest.mock('../settlement', () => ({
  settleOrderFill: jest.fn(),
}))

const settleMock = settleOrderFill as jest.MockedFunction<typeof settleOrderFill>

type AnyRec = Record<string, any>

function makeRedis(): AnyRec {
  return {
    incr: jest.fn().mockResolvedValue(1),
    publish: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  }
}

function makeOrder(over: AnyRec = {}): AnyRec {
  return {
    id: 'order-1',
    userId: 'user-1',
    assetId: 'asset-1',
    type: 'MARKET',
    status: 'OPEN',
    side: 'BUY',
    quantity: 5,
    price: 100,
    groupId: null,
    attemptCount: 0,
    nextAttemptAt: null,
    createdAt: new Date('2026-09-01T12:00:00.000Z'),
    scheduledAt: new Date('2026-09-01T12:00:00.000Z'),
    asset: { ticker: 'URU3', currentPrice: 100, isHalted: false },
    ...over,
  }
}

function makePrisma(orders: AnyRec[]): AnyRec {
  const tx: AnyRec = {
    order: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  }
  return {
    order: {
      findMany: jest.fn().mockResolvedValue(orders),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    notification: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockImplementation((fn: (t: AnyRec) => Promise<any>) => fn(tx)),
    _tx: tx,
  }
}

/** Escritas de contador de tentativa (as unicas que carregam attemptCount). */
function attemptWrites(prisma: AnyRec): AnyRec[] {
  return prisma.order.updateMany.mock.calls
    .map((c: AnyRec[]) => c[0])
    .filter((arg: AnyRec) => arg?.data?.attemptCount !== undefined)
}

const ELIGIBLE_OR = [{ nextAttemptAt: null }, { nextAttemptAt: { lte: expect.any(Date) } }]

beforeEach(() => {
  jest.clearAllMocks()
  settleMock.mockReset()
})

// ─── varredura: elegibilidade no WHERE ──────────────────────────────────────

describe('varredura filtra ordem em backoff na propria query', () => {
  it('OrderExecutor (MARKET)', async () => {
    const prisma = makePrisma([])
    await new OrderExecutor(prisma as any, makeRedis() as any).processPendingMarketOrders({})

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'MARKET', status: 'OPEN', OR: ELIGIBLE_OR }),
        orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      })
    )
  })

  it('OrderMatcher (LIMIT/OCO)', async () => {
    const prisma = makePrisma([])
    await new OrderMatcher(prisma as any, makeRedis() as any).checkLimitOrders({})

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'OPEN', OR: ELIGIBLE_OR }),
        orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      })
    )
  })

  it('ScheduledOrderRunner mantem scheduledAt governando a ordem', async () => {
    const prisma = makePrisma([])
    const sessions = { getCurrentSession: jest.fn().mockReturnValue('TRADING') }
    await new ScheduledOrderRunner(prisma as any, makeRedis() as any, sessions as any).checkScheduledOrders({})

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'SCHEDULED', status: 'OPEN', OR: ELIGIBLE_OR }),
        // O horario pedido pelo usuario continua sendo a chave natural; o
        // nextAttemptAt entra so como desempate de quem ja falhou.
        orderBy: [{ nextAttemptAt: 'asc' }, { scheduledAt: 'asc' }],
      })
    )
  })
})

// ─── contabilizacao da falha ────────────────────────────────────────────────

describe('falha real de liquidacao vira tentativa na linha da ordem', () => {
  it('OrderExecutor conta a tentativa E segue relancando (agregado BATCH_FAIL)', async () => {
    const prisma = makePrisma([makeOrder()])
    settleMock.mockRejectedValue(new Error('boom'))

    // Nao deve derrubar o lote: o allSettled do caller absorve o rethrow.
    await new OrderExecutor(prisma as any, makeRedis() as any).processPendingMarketOrders({ URU3: 100 })

    const writes = attemptWrites(prisma)
    expect(writes).toHaveLength(1)
    expect(writes[0].where).toEqual({ id: 'order-1', status: { in: ['OPEN', 'PARTIAL'] } })
    expect(writes[0].data.attemptCount).toBe(1)
    expect(writes[0].data.nextAttemptAt).toBeInstanceOf(Date)
  })

  it('OrderMatcher conta a tentativa mesmo sem relancar', async () => {
    const prisma = makePrisma([makeOrder({ type: 'LIMIT', side: 'BUY', price: 100 })])
    settleMock.mockRejectedValue(new Error('boom'))

    await new OrderMatcher(prisma as any, makeRedis() as any).checkLimitOrders({ URU3: 90 })

    const writes = attemptWrites(prisma)
    expect(writes).toHaveLength(1)
    expect(writes[0].data.attemptCount).toBe(1)
  })

  it('ScheduledOrderRunner conta a tentativa mesmo sem relancar', async () => {
    const prisma = makePrisma([makeOrder({ type: 'SCHEDULED' })])
    settleMock.mockRejectedValue(new Error('boom'))
    const sessions = { getCurrentSession: jest.fn().mockReturnValue('TRADING') }

    await new ScheduledOrderRunner(prisma as any, makeRedis() as any, sessions as any).checkScheduledOrders({
      URU3: 100,
    })

    const writes = attemptWrites(prisma)
    expect(writes).toHaveLength(1)
    expect(writes[0].data.attemptCount).toBe(1)
  })
})

// ─── precondicao NAO conta ──────────────────────────────────────────────────

describe('precondicao nao consome orcamento de tentativa', () => {
  it('ticker ausente do tick nao escreve contador (MARKET)', async () => {
    const prisma = makePrisma([makeOrder()])

    // Preco do tick vazio: e o caminho "ticker sem preço" (loadAssets so roda no
    // boot). A ordem esta sa; contar isso a cancelaria em ~5 ticks.
    await new OrderExecutor(prisma as any, makeRedis() as any).processPendingMarketOrders({})

    expect(attemptWrites(prisma)).toHaveLength(0)
    expect(settleMock).not.toHaveBeenCalled()
  })

  it('ativo em halt cancela com motivo proprio, sem contador', async () => {
    const prisma = makePrisma([makeOrder({ asset: { ticker: 'URU3', currentPrice: 100, isHalted: true } })])

    await new OrderExecutor(prisma as any, makeRedis() as any).processPendingMarketOrders({ URU3: 100 })

    expect(attemptWrites(prisma)).toHaveLength(0)
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'CANCELLED', cancelReason: 'ASSET_HALTED', nextAttemptAt: null },
      })
    )
  })

  it('ticker ausente do tick nao escreve contador (LIMIT)', async () => {
    const prisma = makePrisma([makeOrder({ type: 'LIMIT' })])
    await new OrderMatcher(prisma as any, makeRedis() as any).checkLimitOrders({})
    expect(attemptWrites(prisma)).toHaveLength(0)
  })
})

// ─── esgotamento ────────────────────────────────────────────────────────────

describe('esgotamento do orcamento cancela terminalmente', () => {
  it('a MAX_ATTEMPTS-esima falha cancela com EXECUTION_RETRY_EXHAUSTED e avisa o dono', async () => {
    const prisma = makePrisma([makeOrder({ attemptCount: MAX_ATTEMPTS - 1 })])
    settleMock.mockRejectedValue(new Error('boom'))

    await new OrderExecutor(prisma as any, makeRedis() as any).processPendingMarketOrders({ URU3: 100 })

    expect(prisma._tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: { in: ['OPEN', 'PARTIAL'] } },
      data: { status: 'CANCELLED', cancelReason: 'EXECUTION_RETRY_EXHAUSTED', nextAttemptAt: null },
    })
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'ORDER_CANCELLED',
          idempotencyKey: 'motor:order_cancelled:retry_exhausted:order-1',
        }),
      })
    )
  })

  it('antes do limite nao cancela nada', async () => {
    const prisma = makePrisma([makeOrder({ attemptCount: 0 })])
    settleMock.mockRejectedValue(new Error('boom'))

    await new OrderExecutor(prisma as any, makeRedis() as any).processPendingMarketOrders({ URU3: 100 })

    expect(prisma._tx.order.updateMany).not.toHaveBeenCalled()
    expect(prisma.notification.create).not.toHaveBeenCalled()
  })
})
