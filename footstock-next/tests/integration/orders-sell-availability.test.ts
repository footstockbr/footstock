/**
 * Task 04 — `getSellAvailability` como fonte UNICA de disponibilidade de venda.
 *
 * Antes desta extracao, o calculo de quanto o usuario podia vender existia so
 * dentro de `_assertSellAvailable`, invisivel para qualquer rota HTTP. A UI
 * inventava o proprio numero e divergia do servidor. Aqui a suite trava as tres
 * propriedades que a extracao nao pode perder: reserva por SELL OPEN/PARTIAL,
 * OCO contado uma unica vez por grupo, e o mesmo `AppError('ORDER_050', 402)`
 * com `required`, `available` e `reserved` de antes da refatoracao.
 *
 * Segue o padrao das demais suites de `tests/integration/`: `@/lib/prisma`
 * mockado, sem banco real.
 */

const mockPositionFindFirst = jest.fn()
const mockOrderFindMany = jest.fn()

jest.mock('@/lib/prisma', () => {
  const client = {
    position: { findFirst: (...args: unknown[]) => mockPositionFindFirst(...args) },
    order: { findMany: (...args: unknown[]) => mockOrderFindMany(...args) },
  }
  return {
    prisma: {
      ...client,
      // `getSellAvailability` abre a propria transacao; o mock entrega o mesmo
      // client como TransactionClient.
      $transaction: (cb: (tx: unknown) => unknown) => cb(client),
    },
  }
})

jest.mock('@/lib/redis', () => ({
  redisPublisher: { get: jest.fn(), set: jest.fn(), publish: jest.fn() },
}))

import { orderService, AppError, type SellAvailability } from '@/lib/services/OrderService'

/** Decimal do Prisma chega como objeto; Number() e o que o service usa. */
function decimal(value: number) {
  return { toNumber: () => value, toString: () => String(value) }
}

interface PositionRow {
  id: string
  quantity: number
  avgPrice: number
  status: 'OPEN' | 'CLOSED'
}

interface SellOrderRow {
  quantity: number
  type: string
  groupId: string | null
}

/**
 * Programa o mock com uma posicao (ou nenhuma) e a carteira de ordens SELL.
 * `_getSellAvailability` consulta a posicao ABERTA e, so quando nao acha, faz a
 * busca de fallback sem filtro de status.
 */
function seed(position: PositionRow | null, sellOrders: SellOrderRow[]) {
  mockPositionFindFirst.mockImplementation((args: { where?: Record<string, unknown> }) => {
    const querStatusAberto = args?.where?.status === 'OPEN'
    if (querStatusAberto) {
      return Promise.resolve(
        position && position.status === 'OPEN'
          ? {
              id: position.id,
              quantity: position.quantity,
              avgPrice: decimal(position.avgPrice),
              status: position.status,
            }
          : null,
      )
    }
    return Promise.resolve(position ? { id: position.id, status: position.status } : null)
  })
  mockOrderFindMany.mockResolvedValue(sellOrders)
}

/** Acesso ao metodo privado preservado pela refatoracao. */
function assertSellAvailable(
  userId: string,
  assetId: string,
  ticker: string,
  requestedQuantity: number,
): Promise<void> {
  const svc = orderService as unknown as {
    _assertSellAvailable: (
      tx: unknown,
      userId: string,
      assetId: string,
      ticker: string,
      requestedQuantity: number,
    ) => Promise<void>
  }
  const tx = {
    position: { findFirst: (...args: unknown[]) => mockPositionFindFirst(...args) },
    order: { findMany: (...args: unknown[]) => mockOrderFindMany(...args) },
  }
  return svc._assertSellAvailable(tx, userId, assetId, ticker, requestedQuantity)
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getSellAvailability', () => {
  test('e chamavel sem passar client Prisma e abre a propria transacao', async () => {
    seed({ id: 'pos-1', quantity: 100, avgPrice: 25.5, status: 'OPEN' }, [])

    const disponibilidade: SellAvailability = await orderService.getSellAvailability(
      'user-1',
      'asset-1',
    )

    expect(disponibilidade).toEqual({
      ownedQty: 100,
      reservedQty: 0,
      availableQty: 100,
      avgPrice: 25.5,
      positionId: 'pos-1',
      positionStatus: 'OPEN',
    })
  })

  test('ordens SELL OPEN e PARTIAL reservam quantidade', async () => {
    seed({ id: 'pos-1', quantity: 100, avgPrice: 10, status: 'OPEN' }, [
      { quantity: 30, type: 'LIMIT', groupId: null },
      { quantity: 20, type: 'MARKET', groupId: null },
    ])

    const r = await orderService.getSellAvailability('user-1', 'asset-1')

    expect(r.reservedQty).toBe(50)
    expect(r.availableQty).toBe(50)
    // A consulta de ordens cobre exatamente OPEN e PARTIAL, no lado SELL.
    const where = mockOrderFindMany.mock.calls[0][0].where
    expect(where.side).toBe('SELL')
    expect(where.status).toEqual({ in: ['OPEN', 'PARTIAL'] })
  })

  test('OCO do mesmo groupId reserva a quantidade uma unica vez', async () => {
    seed({ id: 'pos-1', quantity: 100, avgPrice: 10, status: 'OPEN' }, [
      { quantity: 100, type: 'OCO', groupId: 'grp-1' },
      { quantity: 100, type: 'OCO', groupId: 'grp-1' },
    ])

    const r = await orderService.getSellAvailability('user-1', 'asset-1')

    // As duas pernas vendem a MESMA cota; so uma executa.
    expect(r.reservedQty).toBe(100)
    expect(r.availableQty).toBe(0)
  })

  test('OCOs de grupos distintos reservam separadamente', async () => {
    seed({ id: 'pos-1', quantity: 100, avgPrice: 10, status: 'OPEN' }, [
      { quantity: 40, type: 'OCO', groupId: 'grp-1' },
      { quantity: 40, type: 'OCO', groupId: 'grp-1' },
      { quantity: 30, type: 'OCO', groupId: 'grp-2' },
      { quantity: 30, type: 'OCO', groupId: 'grp-2' },
    ])

    const r = await orderService.getSellAvailability('user-1', 'asset-1')

    expect(r.reservedQty).toBe(70)
    expect(r.availableQty).toBe(30)
  })

  test('posicao totalmente reservada devolve availableQty zero sem negativo', async () => {
    seed({ id: 'pos-1', quantity: 50, avgPrice: 10, status: 'OPEN' }, [
      { quantity: 80, type: 'LIMIT', groupId: null },
    ])

    const r = await orderService.getSellAvailability('user-1', 'asset-1')

    // availableQty e sempre max(0, ownedQty - reservedQty).
    expect(r.ownedQty).toBe(50)
    expect(r.reservedQty).toBe(80)
    expect(r.availableQty).toBe(0)
    expect(r.availableQty).toBe(Math.max(0, r.ownedQty - r.reservedQty))
  })

  test('sem posicao alguma devolve zeros e metadados nulos', async () => {
    seed(null, [])

    const r = await orderService.getSellAvailability('user-1', 'asset-1')

    expect(r).toEqual({
      ownedQty: 0,
      reservedQty: 0,
      availableQty: 0,
      avgPrice: 0,
      positionId: null,
      positionStatus: null,
    })
  })

  test('posicao fechada e reportada como CLOSED com ownedQty zero', async () => {
    seed({ id: 'pos-9', quantity: 0, avgPrice: 0, status: 'CLOSED' }, [])

    const r = await orderService.getSellAvailability('user-1', 'asset-1')

    // Distinguir "nunca teve" de "teve e fechou" e o que permite a UI escrever a
    // mensagem certa no estado vazio.
    expect(r.ownedQty).toBe(0)
    expect(r.positionId).toBe('pos-9')
    expect(r.positionStatus).toBe('CLOSED')
  })
})

describe('_assertSellAvailable apos a refatoracao', () => {
  test('passa quando a quantidade pedida cabe na disponibilidade', async () => {
    seed({ id: 'pos-1', quantity: 100, avgPrice: 10, status: 'OPEN' }, [
      { quantity: 40, type: 'LIMIT', groupId: null },
    ])

    await expect(assertSellAvailable('user-1', 'asset-1', 'POR3', 60)).resolves.toBeUndefined()
  })

  test('lanca ORDER_050 402 com required, available e reserved', async () => {
    seed({ id: 'pos-1', quantity: 100, avgPrice: 10, status: 'OPEN' }, [
      { quantity: 70, type: 'LIMIT', groupId: null },
    ])

    const erro = await assertSellAvailable('user-1', 'asset-1', 'POR3', 50).catch(
      (e: unknown) => e,
    )

    expect(erro).toBeInstanceOf(AppError)
    const app = erro as AppError
    expect(app.code).toBe('ORDER_050')
    expect(app.statusCode).toBe(402)
    expect(app.details).toMatchObject({ required: 50, available: 30, reserved: 70 })
    expect(String(app.details?.message)).toContain('POR3')
  })

  test('os tres valores do erro sao os mesmos que getSellAvailability reporta', async () => {
    seed({ id: 'pos-1', quantity: 10, avgPrice: 10, status: 'OPEN' }, [
      { quantity: 10, type: 'OCO', groupId: 'grp-1' },
      { quantity: 10, type: 'OCO', groupId: 'grp-1' },
    ])

    const disponibilidade = await orderService.getSellAvailability('user-1', 'asset-1')
    const erro = (await assertSellAvailable('user-1', 'asset-1', 'POR3', 5).catch(
      (e: unknown) => e,
    )) as AppError

    expect(erro.details).toMatchObject({
      required: 5,
      available: disponibilidade.availableQty,
      reserved: disponibilidade.reservedQty,
    })
  })
})
