/**
 * @jest-environment node
 */
// ============================================================================
// Zero Silencio no ciclo de vida da ordem (2026-09-02)
//
// A linha na tabela `notifications` e a entrega REAL: o front faz polling da tabela
// (footstock-next useNotifications, 30s). Os canais Redis `orders:*` e `notifications:*`
// que o motor publica NAO tem assinante em nenhum ponto do repositorio.
//
// Enquanto so o OrderExecutor (MARKET) gravava a linha, LIMIT, OCO e SCHEDULED
// executavam e cancelavam em silencio absoluto. Evidencia de producao (02/09): a
// tabela `notifications` nao tem UMA UNICA linha de ORDER_EXECUTED ou ORDER_CANCELLED
// desde a sua primeira linha, em 20/04 — os dois tipos existem no enum e nunca foram
// escritos. Estes testes travam os caminhos que faltavam.
//
// ATENCAO ao mock de prisma: `persistOrderNotification` engole QUALQUER erro de propria
// vontade (nunca pode derrubar liquidacao ja commitada). Um mock sem `notification.create`
// nao falha o teste — passa em silencio, exatamente o defeito sob teste. Por isso aqui o
// create e sempre um jest.fn() explicito e as asserts sao sobre ele.
// ============================================================================

import { Prisma } from '@prisma/client'
import { OrderMatcher } from '../OrderMatcher'
import { ScheduledOrderRunner } from '../ScheduledOrderRunner'
import { settleOrderFill } from '../settlement'
import { logger } from '../../utils/logger'

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  motorMetrics: { observe: jest.fn(), increment: jest.fn() },
}))

jest.mock('../settlement', () => ({
  settleOrderFill: jest.fn(),
}))

const settleMock = settleOrderFill as jest.MockedFunction<typeof settleOrderFill>

type AnyRec = Record<string, any>

function makeOrder(over: AnyRec = {}): AnyRec {
  return {
    id: 'order-1',
    userId: 'user-1',
    assetId: 'asset-1',
    type: 'LIMIT',
    status: 'OPEN',
    side: 'BUY',
    quantity: 5,
    price: 100,
    groupId: null,
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
    scheduledAt: new Date('2026-08-01T12:00:00.000Z'),
    asset: { ticker: 'URU3' },
    ...over,
  }
}

function makePrisma(orders: AnyRec[], pair: AnyRec[] = []) {
  const notificationCreate = jest.fn().mockResolvedValue({})
  let findManyCalls = 0
  const tx: AnyRec = {
    user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'user-1', fsBalance: 5000 }), update: jest.fn() },
    order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn() },
    position: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
    transaction: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
  }
  return {
    order: {
      findMany: jest.fn().mockImplementation(() => {
        findManyCalls++
        return Promise.resolve(findManyCalls === 1 ? orders : pair)
      }),
    },
    notification: { create: notificationCreate },
    $transaction: jest.fn().mockImplementation((fn: (t: AnyRec) => Promise<any>) => fn(tx)),
    _notificationCreate: notificationCreate,
    _tx: tx,
  } as AnyRec
}

function makeRedis(): AnyRec {
  return {
    publish: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  }
}

/** Linhas gravadas, achatadas para `data` direto — o formato que os testes conferem. */
function rows(prisma: AnyRec): AnyRec[] {
  return prisma._notificationCreate.mock.calls.map((c: AnyRec[]) => c[0].data)
}

beforeEach(() => {
  jest.clearAllMocks()
  settleMock.mockReset()
})

describe('OrderMatcher — LIMIT', () => {
  test('execucao grava ORDER_EXECUTED duravel, nao so o publish', async () => {
    settleMock.mockResolvedValue({ settled: true, newBalance: 4000, feeAmount: 1.5, fsDelta: -501.5 } as any)
    const prisma = makePrisma([makeOrder()])
    const redis = makeRedis()

    await new OrderMatcher(prisma as any, redis as any).checkLimitOrders({ URU3: 95 })

    const [row] = rows(prisma)
    expect(row).toBeDefined()
    expect(row.type).toBe('ORDER_EXECUTED')
    expect(row.userId).toBe('user-1')
    expect(row.idempotencyKey).toBe('motor:order_executed:order-1')
    expect(row.body).toContain('URU3')
    expect(row.body).toContain('compra')
    expect(row.data).toEqual(expect.objectContaining({ orderType: 'LIMIT', fee: 1.5, executedPrice: 95 }))
  })

  test('cancelamento por saldo insuficiente grava ORDER_CANCELLED duravel', async () => {
    settleMock.mockResolvedValue({ settled: false, reason: 'INSUFFICIENT_BALANCE' } as any)
    const prisma = makePrisma([makeOrder()])
    const redis = makeRedis()

    await new OrderMatcher(prisma as any, redis as any).checkLimitOrders({ URU3: 95 })

    const [row] = rows(prisma)
    expect(row.type).toBe('ORDER_CANCELLED')
    expect(row.idempotencyKey).toBe('motor:order_cancelled:limit_insufficient_balance:order-1')
    expect(row.body).toContain('Nenhum valor foi debitado')
    expect(row.data).toEqual(expect.objectContaining({ motivo: 'INSUFFICIENT_BALANCE' }))
  })

  test('Redis morto nao custa a linha duravel', async () => {
    settleMock.mockResolvedValue({ settled: true, newBalance: 4000, feeAmount: 1, fsDelta: -1 } as any)
    const prisma = makePrisma([makeOrder()])
    const redis = makeRedis()
    redis.publish.mockRejectedValue(new Error('Connection is closed.'))

    await new OrderMatcher(prisma as any, redis as any).checkLimitOrders({ URU3: 95 })

    expect(rows(prisma).map((r) => r.type)).toEqual(['ORDER_EXECUTED'])
  })

  test('a linha duravel e gravada ANTES do publish', async () => {
    settleMock.mockResolvedValue({ settled: true, newBalance: 4000, feeAmount: 1, fsDelta: -1 } as any)
    const seq: string[] = []
    const prisma = makePrisma([makeOrder()])
    prisma._notificationCreate.mockImplementation(async () => {
      seq.push('notification')
      return {}
    })
    const redis = makeRedis()
    redis.publish.mockImplementation(async () => {
      seq.push('publish')
      return 1
    })

    await new OrderMatcher(prisma as any, redis as any).checkLimitOrders({ URU3: 95 })

    expect(seq[0]).toBe('notification')
  })

  /**
   * O erro tem que ser um PrismaClientKnownRequestError DE VERDADE.
   *
   * A primeira versao deste teste usava `Object.assign(new Error(...), { code: 'P2002' })`
   * e passava — mas passava pelo motivo errado: `persistOrderNotification` discrimina o
   * ramo idempotente com `err instanceof Prisma.PrismaClientKnownRequestError`, e um Error
   * comum com `.code` colado nunca satisfaz o instanceof. O caso caia no catch generico,
   * logava ERROR e seguia sem lancar — o que faz o `resolves.toBeUndefined()` passar
   * igual. O teste afirmava idempotencia e media apenas "nao lanca".
   *
   * Por isso as duas asserts de log abaixo: elas sao a unica diferenca observavel entre
   * "reconheceu a chave duplicada" e "engoliu um erro que nao entendeu".
   */
  test('P2002 na chave idempotente e no-op silencioso, nao erro engolido', async () => {
    settleMock.mockResolvedValue({ settled: true, newBalance: 4000, feeAmount: 1, fsDelta: -1 } as any)
    const prisma = makePrisma([makeOrder()])
    const dup = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['idempotency_key'] },
    })
    prisma._notificationCreate.mockRejectedValue(dup)
    const redis = makeRedis()

    await expect(
      new OrderMatcher(prisma as any, redis as any).checkLimitOrders({ URU3: 95 })
    ).resolves.toBeUndefined()
    expect(redis.publish).toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('ja entregue (idempotente): motor:order_executed:order-1')
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  /**
   * O contraponto: um erro que NAO e a chave duplicada tem que ser logado como erro.
   * Sem este teste, trocar o instanceof por um `catch {}` mudo passaria despercebido —
   * e a unica forma de descobrir uma notificacao perdida em producao e o log.
   */
  test('erro que nao e P2002 e logado como erro, sem derrubar a liquidacao', async () => {
    settleMock.mockResolvedValue({ settled: true, newBalance: 4000, feeAmount: 1, fsDelta: -1 } as any)
    const prisma = makePrisma([makeOrder()])
    prisma._notificationCreate.mockRejectedValue(new Error('connection terminated'))
    const redis = makeRedis()

    await expect(
      new OrderMatcher(prisma as any, redis as any).checkLimitOrders({ URU3: 95 })
    ).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Falha ao persistir notificacao motor:order_executed:order-1')
    )
  })
})

describe('OrderMatcher — OCO', () => {
  test('a perna executada e a perna cancelada geram UMA linha cada', async () => {
    settleMock.mockResolvedValue({ settled: true, newBalance: 4000, feeAmount: 2, fsDelta: 500 } as any)
    const takeProfit = makeOrder({ id: 'leg-tp', type: 'OCO', side: 'SELL', price: 120, groupId: 'grp-1' })
    const stopLoss = makeOrder({ id: 'leg-sl', type: 'OCO', side: 'SELL', price: 80, groupId: 'grp-1' })
    const prisma = makePrisma([takeProfit], [takeProfit, stopLoss])
    const redis = makeRedis()

    await new OrderMatcher(prisma as any, redis as any).checkLimitOrders({ URU3: 130 })

    const written = rows(prisma)
    expect(written).toHaveLength(2)
    expect(written[0].type).toBe('ORDER_EXECUTED')
    expect(written[0].idempotencyKey).toBe('motor:order_executed:leg-tp')
    // A perna irma foi cancelada sem o usuario pedir — e o aviso que mais importa.
    expect(written[1].type).toBe('ORDER_CANCELLED')
    expect(written[1].idempotencyKey).toBe('motor:order_cancelled:oco_pair:leg-sl')
    expect(written[1].data).toEqual(expect.objectContaining({ orderId: 'leg-sl', triggeredBy: 'leg-tp' }))
  })

  /**
   * O aviso duravel afirma ao usuario, em texto, que "a outra perna do par foi cancelada
   * automaticamente". Nada testava o `updateMany` que faz esse cancelamento — a linha
   * podia estar certa e a ordem irma continuar OPEN na tela, que e literalmente o defeito
   * de 31/08 ("uma permanece em aberto") com um aviso mentindo por cima. Este teste trava
   * as tres partes do where: o grupo, a exclusao da perna que executou e o filtro de
   * status que impede sobrescrever uma perna ja terminal.
   */
  test('a perna irma e de fato cancelada, e nao so anunciada como cancelada', async () => {
    settleMock.mockResolvedValue({ settled: true, newBalance: 4000, feeAmount: 2, fsDelta: 500 } as any)
    const takeProfit = makeOrder({ id: 'leg-tp', type: 'OCO', side: 'SELL', price: 120, groupId: 'grp-1' })
    const stopLoss = makeOrder({ id: 'leg-sl', type: 'OCO', side: 'SELL', price: 80, groupId: 'grp-1' })
    const prisma = makePrisma([takeProfit], [takeProfit, stopLoss])

    await new OrderMatcher(prisma as any, makeRedis() as any).checkLimitOrders({ URU3: 130 })

    expect(prisma._tx.order.updateMany).toHaveBeenCalledWith({
      where: { groupId: 'grp-1', id: { not: 'leg-tp' }, status: { in: ['OPEN', 'PARTIAL'] } },
      data: { status: 'CANCELLED' },
    })
    // O preco e o unico campo que distingue as pernas (side/quantity/ticker sao iguais).
    expect(rows(prisma)[1].body).toContain('80.00 FS')
  })

  test('saldo insuficiente ao disparar OCO grava ORDER_CANCELLED', async () => {
    settleMock.mockResolvedValue({ settled: false, reason: 'INSUFFICIENT_BALANCE' } as any)
    const takeProfit = makeOrder({ id: 'leg-tp', type: 'OCO', side: 'SELL', price: 120, groupId: 'grp-1' })
    const stopLoss = makeOrder({ id: 'leg-sl', type: 'OCO', side: 'SELL', price: 80, groupId: 'grp-1' })
    const prisma = makePrisma([takeProfit], [takeProfit, stopLoss])
    const redis = makeRedis()

    await new OrderMatcher(prisma as any, redis as any).checkLimitOrders({ URU3: 130 })

    const written = rows(prisma)
    expect(written).toHaveLength(1)
    expect(written[0].idempotencyKey).toBe('motor:order_cancelled:oco_insufficient_balance:leg-tp')
  })
})

describe('ScheduledOrderRunner', () => {
  const sessionManager = { getCurrentSession: () => 'TRADING' } as any
  test('execucao agendada grava ORDER_EXECUTED duravel', async () => {
    settleMock.mockResolvedValue({ settled: true, newBalance: 4000, feeAmount: 3, fsDelta: -503 } as any)
    const prisma = makePrisma([makeOrder({ id: 'sch-1', type: 'SCHEDULED' })])
    const redis = makeRedis()

    await new ScheduledOrderRunner(prisma as any, redis as any, sessionManager).checkScheduledOrders(
      { URU3: 100 }
    )

    const [row] = rows(prisma)
    expect(row.type).toBe('ORDER_EXECUTED')
    expect(row.idempotencyKey).toBe('motor:order_executed:sch-1')
    expect(row.data).toEqual(expect.objectContaining({ orderType: 'SCHEDULED' }))
  })

  test('saldo insuficiente no horario programado grava ORDER_CANCELLED', async () => {
    settleMock.mockResolvedValue({ settled: false, reason: 'INSUFFICIENT_BALANCE' } as any)
    const prisma = makePrisma([makeOrder({ id: 'sch-1', type: 'SCHEDULED' })])
    const redis = makeRedis()

    await new ScheduledOrderRunner(prisma as any, redis as any, sessionManager).checkScheduledOrders(
      { URU3: 100 }
    )

    const [row] = rows(prisma)
    expect(row.type).toBe('ORDER_CANCELLED')
    expect(row.idempotencyKey).toBe('motor:order_cancelled:scheduled_insufficient_balance:sch-1')
    // O usuario agendou e nao estava olhando a tela: o corpo tem que explicar sozinho.
    expect(row.body).toContain('agendada')
    expect(row.body).toContain('Nenhum valor foi debitado')
  })
})
