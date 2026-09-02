/**
 * @jest-environment node
 */
// ============================================================================
// OrderExecutor — Testes Unitários
// Cobre: batch-50, isolamento Promise.allSettled, ticker sem preço,
//        publish Redis pós-execução, saldo insuficiente BUY,
//        validateTransition, cálculo de taxa por plano.
// ============================================================================

import { Prisma } from '@prisma/client'
import { OrderExecutor } from '../OrderExecutor'
import { calculateFee } from '../fee-constants'
import { logger } from '../../utils/logger'

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
      // CAS de _cancelHaltedMarketOrder (OPEN/PARTIAL -> CANCELLED). Este updateMany
      // e o do NIVEL RAIZ do client, distinto do txMock.order.updateMany do settlement.
      // Sem ele o caminho ASSET_HALTED estourava TypeError dentro do proprio try/catch
      // e o teste passava verde sem ter cancelado nada.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    // Persistencia in-app dos eventos de ordem (ORDER_EXECUTED / ORDER_CANCELLED).
    // Sem este mock o create estoura TypeError, _persistOrderNotification engole no
    // catch e o teste passaria verde sem exercitar a notificacao.
    notification: {
      create: jest.fn().mockResolvedValue({}),
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

  describe('observabilidade — log de falha em uma unica linha', () => {
    function errorLines(): string[] {
      return (logger.error as unknown as jest.Mock).mock.calls.map(([message]: [string]) => String(message))
    }

    // Reproduz a FORMA real da mensagem do Prisma: cabecalho + code frame longo e,
    // so no FIM, a causa. Foi por isso que truncar pela cabeca era inutil — a parte
    // que identifica a constraint violada e a ultima do texto.
    function prismaLongMessage(): string {
      const codeFrame = Array.from(
        { length: 12 },
        (_, i) => `  ${140 + i} const created = await tx.position.create({ data: { userId, assetId } })`
      ).join('\n')
      return (
        'Invalid `prisma.position.create()` invocation:\n\n' +
        codeFrame +
        '\n\nUnique constraint failed on the fields: (`user_id`,`asset_id`)'
      )
    }

    test('erro Prisma conhecido: uma linha com errCode, errMeta, ticker e userId', async () => {
      const order = makeOrder({ id: 'order-p2002' })
      prisma = makePrisma([order])
      redis = makeRedis()

      const longPrismaMessage = prismaLongMessage()
      expect(longPrismaMessage.length).toBeGreaterThan(300) // garante que o corte acontece
      prisma.$transaction.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError(longPrismaMessage, {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['user_id', 'asset_id'], modelName: 'Position' },
        })
      )

      executor = new OrderExecutor(prisma, redis)
      await executor.processPendingMarketOrders({ CRAQUE10: 50 })

      const fail = errorLines().find((line) => line.includes('FAIL orderId=order-p2002'))
      expect(fail).toBeDefined()
      expect(fail).not.toContain('\n')
      expect(fail).toContain('ticker=CRAQUE10')
      expect(fail).toContain('userId=user-001')
      expect(fail).toContain('errCode=P2002')
      expect(fail).toContain('"target":["user_id","asset_id"]')
      expect(fail).toContain('[...]')
      // O ponto do truncamento por cauda: a causa sobrevive ao corte.
      expect(fail).toContain('Unique constraint failed on the fields')
    })

    test('erro generico: uma linha com errKind e sem codigo Prisma', async () => {
      const order = makeOrder({ id: 'order-generico' })
      prisma = makePrisma([order])
      redis = makeRedis()
      prisma.$transaction.mockRejectedValueOnce(new Error('falha simulada'))

      executor = new OrderExecutor(prisma, redis)
      await executor.processPendingMarketOrders({ CRAQUE10: 50 })

      const fail = errorLines().find((line) => line.includes('FAIL orderId=order-generico'))
      expect(fail).toBeDefined()
      expect(fail).not.toContain('\n')
      expect(fail).toContain('errKind=Error')
      expect(fail).toContain('errCode=none')
      expect(fail).not.toContain('[...]')
    })

    test('throw de valor nao-Error nao quebra o log', async () => {
      const order = makeOrder({ id: 'order-string-throw' })
      prisma = makePrisma([order])
      redis = makeRedis()
      prisma.$transaction.mockRejectedValueOnce('boom')

      executor = new OrderExecutor(prisma, redis)
      await executor.processPendingMarketOrders({ CRAQUE10: 50 })

      const fail = errorLines().find((line) => line.includes('FAIL orderId=order-string-throw'))
      expect(fail).toBeDefined()
      expect(fail).toContain('errKind=unknown')
    })

    test('log agregado do batch lista os ids das ordens que falharam', async () => {
      const orders = [
        makeOrder({ id: 'order-ok' }),
        makeOrder({ id: 'order-fail-1' }),
        makeOrder({ id: 'order-fail-2' }),
      ]
      prisma = makePrisma(orders)
      redis = makeRedis()
      prisma.$transaction
        .mockImplementationOnce((fn: (tx: any) => Promise<unknown>) => fn(prisma._tx))
        .mockRejectedValueOnce(new Error('falha 1'))
        .mockRejectedValueOnce(new Error('falha 2'))

      executor = new OrderExecutor(prisma, redis)
      await executor.processPendingMarketOrders({ CRAQUE10: 50 })

      const batch = errorLines().find((line) => line.includes('BATCH_FAIL'))
      expect(batch).toBeDefined()
      expect(batch).toContain('failed=2')
      expect(batch).toContain('total=3')
      expect(batch).toContain('orderIds=order-fail-1,order-fail-2')
    })

    test('skip por ticker sem preco identifica a ordem presa', async () => {
      const order = makeOrder({ id: 'order-sem-preco' })
      prisma = makePrisma([order])
      redis = makeRedis()

      executor = new OrderExecutor(prisma, redis)
      await executor.processPendingMarketOrders({}) // ticker ausente do tick

      const warns = (logger.warn as unknown as jest.Mock).mock.calls.map(([m]: [string]) => String(m))
      const skip = warns.find((line) => line.includes('ticker sem preço'))
      expect(skip).toBeDefined()
      expect(skip).toContain('orderId=order-sem-preco')
      expect(skip).toContain('userId=user-001')
      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('Zero Silencio — notificacao persistida no banco', () => {
    test('execucao bem-sucedida grava ORDER_EXECUTED com chave idempotente', async () => {
      const order = makeOrder({ id: 'order-exec' })
      prisma = makePrisma([order])
      redis = makeRedis()

      executor = new OrderExecutor(prisma, redis)
      await executor.processPendingMarketOrders({ CRAQUE10: 50 })

      expect(prisma.notification.create).toHaveBeenCalledTimes(1)
      const { data } = prisma.notification.create.mock.calls[0][0]
      expect(data.type).toBe('ORDER_EXECUTED')
      expect(data.userId).toBe('user-001')
      expect(data.idempotencyKey).toBe('motor:order_executed:order-exec')
      expect(data.body).toContain('CRAQUE10')
      expect(data.data.orderId).toBe('order-exec')
    })

    test('saldo insuficiente grava ORDER_CANCELLED sem prometer recarga', async () => {
      const order = makeOrder({ id: 'order-sem-saldo' })
      prisma = makePrisma([order], makeUser({ fsBalance: 0 }))
      redis = makeRedis()

      executor = new OrderExecutor(prisma, redis)
      await executor.processPendingMarketOrders({ CRAQUE10: 50 })

      expect(prisma.notification.create).toHaveBeenCalledTimes(1)
      const { data } = prisma.notification.create.mock.calls[0][0]
      expect(data.type).toBe('ORDER_CANCELLED')
      expect(data.idempotencyKey).toBe('motor:order_cancelled:insufficient_balance:order-sem-saldo')
      expect(data.data.motivo).toBe('INSUFFICIENT_BALANCE')
      // Nao existe recarga self-service no produto: a copy nao pode mandar o usuario
      // "adicionar saldo" (so admin e webhook creditam FS).
      expect(String(data.body).toLowerCase()).not.toContain('adicione saldo')
    })

    test('ativo suspenso cancela a ordem e grava ORDER_CANCELLED com motivo ASSET_HALTED', async () => {
      const order = makeOrder({
        id: 'order-halted',
        asset: { ticker: 'CRAQUE10', currentPrice: { toNumber: () => 50 }, isHalted: true },
      })
      prisma = makePrisma([order])
      redis = makeRedis()

      executor = new OrderExecutor(prisma, redis)
      await executor.processPendingMarketOrders({ CRAQUE10: 50 })

      expect(prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } })
      )
      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(prisma.notification.create).toHaveBeenCalledTimes(1)
      const { data } = prisma.notification.create.mock.calls[0][0]
      expect(data.type).toBe('ORDER_CANCELLED')
      expect(data.idempotencyKey).toBe('motor:order_cancelled:asset_halted:order-halted')
      expect(data.data.motivo).toBe('ASSET_HALTED')
    })

    test('CAS perdido (ordem ja nao esta OPEN) nao notifica', async () => {
      const order = makeOrder({
        id: 'order-halted-corrida',
        asset: { ticker: 'CRAQUE10', currentPrice: { toNumber: () => 50 }, isHalted: true },
      })
      prisma = makePrisma([order])
      prisma.order.updateMany.mockResolvedValueOnce({ count: 0 })
      redis = makeRedis()

      executor = new OrderExecutor(prisma, redis)
      await executor.processPendingMarketOrders({ CRAQUE10: 50 })

      expect(prisma.notification.create).not.toHaveBeenCalled()
    })

    test('P2002 na chave idempotente e no-op: nao lanca e nao falha a ordem', async () => {
      const order = makeOrder({ id: 'order-reentrante' })
      prisma = makePrisma([order])
      redis = makeRedis()
      prisma.notification.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '6.19.3',
          meta: { target: ['idempotency_key'] },
        })
      )

      executor = new OrderExecutor(prisma, redis)
      await expect(executor.processPendingMarketOrders({ CRAQUE10: 50 })).resolves.toBeUndefined()

      const errors = (logger.error as unknown as jest.Mock).mock.calls.map(([m]: [string]) => String(m))
      expect(errors.find((line) => line.includes('BATCH_FAIL'))).toBeUndefined()
    })

    test('falha generica ao notificar nao derruba a liquidacao ja commitada', async () => {
      const order = makeOrder({ id: 'order-notif-quebrada' })
      prisma = makePrisma([order])
      redis = makeRedis()
      prisma.notification.create.mockRejectedValueOnce(new Error('banco fora do ar'))

      executor = new OrderExecutor(prisma, redis)
      await expect(executor.processPendingMarketOrders({ CRAQUE10: 50 })).resolves.toBeUndefined()

      const errors = (logger.error as unknown as jest.Mock).mock.calls.map(([m]: [string]) => String(m))
      expect(errors.find((line) => line.includes('Falha ao persistir notificacao'))).toBeDefined()
      expect(errors.find((line) => line.includes('BATCH_FAIL'))).toBeUndefined()
    })
  })

  // O canal Redis de ordens nao tem assinante em nenhum ponto do repositorio; a
  // linha em `notifications` e a entrega real. Um `Connection is closed.` no publish
  // nao pode custar a notificacao de uma ordem que ja moveu dinheiro.
  describe('Zero Silencio — publish morto nao derruba a notificacao', () => {
    test('publish rejeitado no caminho de sucesso: notifica, avisa e nao vira BATCH_FAIL', async () => {
      prisma = makePrisma([makeOrder({ id: 'order-pub-fail' })])
      redis = makeRedis()
      redis.publish.mockRejectedValue(new Error('Connection is closed.'))

      executor = new OrderExecutor(prisma, redis)
      await executor.processPendingMarketOrders({ CRAQUE10: 50 })

      expect(prisma.notification.create).toHaveBeenCalledTimes(1)
      expect(prisma.notification.create.mock.calls[0][0].data.idempotencyKey).toBe(
        'motor:order_executed:order-pub-fail'
      )

      const warns = (logger.warn as unknown as jest.Mock).mock.calls.map(([m]: [string]) => String(m))
      const pubFail = warns.find((line) => line.includes('PUBLISH_FAIL'))
      expect(pubFail).toBeDefined()
      expect(pubFail).toContain('canal=orders:executed')
      expect(pubFail).toContain('orderId=order-pub-fail')

      const errors = (logger.error as unknown as jest.Mock).mock.calls.map(([m]: [string]) => String(m))
      expect(errors.find((line) => line.includes('BATCH_FAIL'))).toBeUndefined()
      expect(errors.find((line) => line.includes('FAIL orderId='))).toBeUndefined()
      expect(errors).toHaveLength(0)
    })

    test('publish rejeitado no caminho ASSET_HALTED: cancela e ainda notifica', async () => {
      const halted = makeOrder({ id: 'order-halt-pub' })
      halted.asset.isHalted = true
      prisma = makePrisma([halted])
      redis = makeRedis()
      redis.publish.mockRejectedValue(new Error('Connection is closed.'))

      executor = new OrderExecutor(prisma, redis)
      await executor.processPendingMarketOrders({ CRAQUE10: 50 })

      // CAS de cancelamento continua rodando
      expect(prisma.order.updateMany).toHaveBeenCalledTimes(1)
      expect(prisma.notification.create).toHaveBeenCalledTimes(1)
      const { data } = prisma.notification.create.mock.calls[0][0]
      expect(data.type).toBe('ORDER_CANCELLED')
      expect(data.idempotencyKey).toBe('motor:order_cancelled:asset_halted:order-halt-pub')

      const warns = (logger.warn as unknown as jest.Mock).mock.calls.map(([m]: [string]) => String(m))
      expect(warns.find((line) => line.includes('canal=orders:cancelled'))).toBeDefined()
      const errors = (logger.error as unknown as jest.Mock).mock.calls.map(([m]: [string]) => String(m))
      expect(errors.find((line) => line.includes('Falha ao cancelar ordem'))).toBeUndefined()
    })
  })
})
