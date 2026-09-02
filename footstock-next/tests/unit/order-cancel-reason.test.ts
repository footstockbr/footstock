/**
 * Fase 3 (M072) — motivo do encerramento gravado na propria ordem.
 *
 * Antes desta fase os cinco caminhos que encerram uma ordem sem execucao
 * escreviam todos o MESMO `status: 'CANCELLED'` e nada mais. No historico eles
 * ficavam indistinguiveis: escolha do usuario, plano cancelado, ativo suspenso,
 * expiracao e desistencia do motor apareciam como a mesma palavra. Estes testes
 * travam o motivo em cada caminho do lado web.
 *
 * O caminho do motor (`EXECUTION_RETRY_EXHAUSTED`, `ASSET_HALTED`,
 * `INSUFFICIENT_BALANCE`) tem cobertura propria em
 * `motor/src/engine/__tests__/orderRetry.test.ts` e
 * `order-retry-wiring.test.ts`.
 */

const findUniqueOrder = jest.fn()
const findManyOrder = jest.fn()
const updateManyOrder = jest.fn()
const transaction = jest.fn()
const findUniqueAsset = jest.fn()
const createNotification = jest.fn()
const publish = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      findUnique: (...a: unknown[]) => findUniqueOrder(...a),
      findMany: (...a: unknown[]) => findManyOrder(...a),
      updateMany: (...a: unknown[]) => updateManyOrder(...a),
    },
    asset: { findUnique: (...a: unknown[]) => findUniqueAsset(...a) },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}))

jest.mock('@/lib/redis', () => ({
  redis: { publish: (...a: unknown[]) => publish(...a) },
  redisPublisher: { publish: (...a: unknown[]) => publish(...a) },
}))

jest.mock('@/lib/repositories/NotificationRepository', () => ({
  notificationRepository: { create: (...a: unknown[]) => createNotification(...a) },
}))

jest.mock('@/lib/services/analytics/MixpanelServerService', () => ({
  mixpanelServer: { trackOrderCancelled: jest.fn(), trackOrderCreated: jest.fn() },
}))

import { orderService } from '@/lib/services/OrderService'

function order(over: Record<string, unknown> = {}) {
  return {
    id: 'ord-1',
    userId: 'user-1',
    assetId: 'asset-1',
    status: 'OPEN',
    type: 'LIMIT',
    side: 'BUY',
    quantity: 10,
    price: 12.5,
    version: 3,
    groupId: null,
    ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  publish.mockResolvedValue(1)
  createNotification.mockResolvedValue({})
  updateManyOrder.mockResolvedValue({ count: 1 })
  findUniqueAsset.mockResolvedValue({ ticker: 'URU3' })
  findManyOrder.mockResolvedValue([])
  transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      order: {
        findUnique: (...a: unknown[]) => findUniqueOrder(...a),
        findMany: (...a: unknown[]) => findManyOrder(...a),
        updateMany: (...a: unknown[]) => updateManyOrder(...a),
      },
    })
  )
})

describe('OrderService.cancelOrder — motivo e aviso duravel', () => {
  test('grava cancelReason USER_REQUEST e zera o backoff', async () => {
    const o = order()
    findUniqueOrder.mockResolvedValue({ ...o, status: 'CANCELLED' })
    findUniqueOrder.mockResolvedValueOnce(o)

    await orderService.cancelOrder('user-1', 'ord-1')

    const cas = updateManyOrder.mock.calls[0][0]
    expect(cas.where).toEqual(
      expect.objectContaining({ id: 'ord-1', version: 3, status: { in: ['OPEN', 'PARTIAL'] } })
    )
    expect(cas.data).toEqual(
      expect.objectContaining({
        status: 'CANCELLED',
        cancelReason: 'USER_REQUEST',
        // Ordem terminal nao pode continuar agendada para nova tentativa: o
        // varredor do motor filtra por `nextAttemptAt`, e deixar o carimbo la
        // e o mesmo bug de fila presa que a Fase 3 veio matar.
        nextAttemptAt: null,
      })
    )
  })

  test('perna irma do par OCO cai com cancelReason OCO_SIBLING, nao USER_REQUEST', async () => {
    const o = order({ type: 'OCO', groupId: 'grp-1' })
    findUniqueOrder.mockResolvedValue({ ...o, status: 'CANCELLED' })
    findUniqueOrder.mockResolvedValueOnce(o)
    findManyOrder.mockResolvedValue([
      { id: 'ord-1', userId: 'user-1', side: 'BUY', quantity: 10, cancelReason: 'USER_REQUEST' },
      { id: 'ord-2', userId: 'user-1', side: 'BUY', quantity: 10, cancelReason: 'OCO_SIBLING' },
    ])

    await orderService.cancelOrder('user-1', 'ord-1')

    const sibling = updateManyOrder.mock.calls[1][0]
    expect(sibling.where).toEqual(
      expect.objectContaining({ groupId: 'grp-1', id: { not: 'ord-1' } })
    )
    expect(sibling.data).toEqual(
      expect.objectContaining({ status: 'CANCELLED', cancelReason: 'OCO_SIBLING', nextAttemptAt: null })
    )
  })

  test('grava linha duravel em notifications com chave propria (nao so publish)', async () => {
    const o = order()
    findUniqueOrder.mockResolvedValue({ ...o, status: 'CANCELLED' })
    findUniqueOrder.mockResolvedValueOnce(o)

    await orderService.cancelOrder('user-1', 'ord-1')

    expect(createNotification).toHaveBeenCalledTimes(1)
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'ORDER_CANCELLED',
        // Chave disjunta das outras origens (§8.2 do design): colidir com
        // `expiry:order:{id}` engoliria o aviso do caminho que aconteceu.
        idempotencyKey: 'user_cancel:order:ord-1',
      })
    )
    const body = createNotification.mock.calls[0][0].body as string
    expect(body).toContain('URU3')
    expect(body).toContain('10')
  })

  test('avisa as DUAS pernas do par OCO, com corpo diferente por perna', async () => {
    const o = order({ type: 'OCO', groupId: 'grp-1' })
    findUniqueOrder.mockResolvedValue({ ...o, status: 'CANCELLED', groupId: 'grp-1' })
    findUniqueOrder.mockResolvedValueOnce(o)
    findManyOrder.mockResolvedValue([
      { id: 'ord-1', userId: 'user-1', side: 'BUY', quantity: 10, cancelReason: 'USER_REQUEST' },
      { id: 'ord-2', userId: 'user-1', side: 'BUY', quantity: 10, cancelReason: 'OCO_SIBLING' },
    ])

    await orderService.cancelOrder('user-1', 'ord-1')

    expect(createNotification).toHaveBeenCalledTimes(2)
    const keys = createNotification.mock.calls.map((c) => c[0].idempotencyKey)
    expect(keys).toEqual(['user_cancel:order:ord-1', 'user_cancel:order:ord-2'])

    const bodies = createNotification.mock.calls.map((c) => c[0].body as string)
    expect(bodies[0]).toContain('a seu pedido')
    expect(bodies[1]).toContain('junto com a ordem par')
    // Dois avisos byte-identicos por uma unica acao do usuario e ruido, nao aviso.
    expect(bodies[0]).not.toBe(bodies[1])
  })

  test('a releitura das pernas filtra por cancelReason: nao avisa perna ja FILLED', async () => {
    const o = order({ type: 'OCO', groupId: 'grp-1' })
    findUniqueOrder.mockResolvedValue({ ...o, status: 'CANCELLED', groupId: 'grp-1' })
    findUniqueOrder.mockResolvedValueOnce(o)

    await orderService.cancelOrder('user-1', 'ord-1')

    const legsQuery = findManyOrder.mock.calls.at(-1)![0]
    expect(legsQuery.where).toEqual(
      expect.objectContaining({
        groupId: 'grp-1',
        status: 'CANCELLED',
        cancelReason: { in: ['USER_REQUEST', 'OCO_SIBLING'] },
      })
    )
  })

  test('falha ao notificar NAO derruba o cancelamento ja commitado', async () => {
    const o = order()
    findUniqueOrder.mockResolvedValue({ ...o, status: 'CANCELLED' })
    findUniqueOrder.mockResolvedValueOnce(o)
    createNotification.mockRejectedValue(new Error('notifications fora do ar'))

    await expect(orderService.cancelOrder('user-1', 'ord-1')).resolves.toEqual(
      expect.objectContaining({ id: 'ord-1', status: 'CANCELLED' })
    )
  })

  test('P2002 no aviso e deduplicacao, nao erro', async () => {
    const o = order()
    findUniqueOrder.mockResolvedValue({ ...o, status: 'CANCELLED' })
    findUniqueOrder.mockResolvedValueOnce(o)
    const dup = Object.assign(new Error('unique'), { code: 'P2002' })
    createNotification.mockRejectedValue(dup)
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await orderService.cancelOrder('user-1', 'ord-1')

    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
