/**
 * Zero Silêncio no job de expiração (2026-09-02).
 *
 * `processExpiredOrders` só publicava em `notifications:{userId}`, canal sem nenhum
 * assinante no repositório — o frontend lê a TABELA `notifications` por polling. A ordem
 * sumia da lista de abertas e o usuário não recebia nada.
 *
 * O defeito ficou latente enquanto o job ignorava ordens MARKET. Ao incluir MARKET (rede
 * de segurança para ordem a mercado que o motor não consegue liquidar — o cenário do
 * incidente de 31/08), o caminho silencioso passou a valer para o tipo de ordem que o
 * cliente reclamou. Estes testes travam a linha durável.
 */

const findManyOrder = jest.fn()
const updateOrder = jest.fn()
const updateManyOrder = jest.fn()
const transaction = jest.fn()
const createNotification = jest.fn()
const publish = jest.fn()
const incr = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      findMany: (...a: unknown[]) => findManyOrder(...a),
      update: (...a: unknown[]) => updateOrder(...a),
      updateMany: (...a: unknown[]) => updateManyOrder(...a),
    },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}))

jest.mock('@/lib/redis', () => ({
  redisPublisher: {
    publish: (...a: unknown[]) => publish(...a),
    incr: (...a: unknown[]) => incr(...a),
  },
}))

jest.mock('@/lib/repositories/NotificationRepository', () => ({
  notificationRepository: { create: (...a: unknown[]) => createNotification(...a) },
}))

import { processExpiredOrders } from '@/lib/jobs/order-expiry'

const OLD = new Date('2026-07-01T10:00:00.000Z')

function marketOrder(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'ord-1',
    userId: 'user-1',
    status: 'OPEN',
    type: 'MARKET',
    side: 'BUY',
    quantity: 201,
    groupId: null,
    createdAt: OLD,
    asset: { ticker: 'URU3' },
    ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  publish.mockResolvedValue(1)
  incr.mockResolvedValue(1)
  updateOrder.mockResolvedValue({})
  updateManyOrder.mockResolvedValue({ count: 2 })
  createNotification.mockResolvedValue({})
  transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      order: {
        findMany: (...a: unknown[]) => findManyOrder(...a),
        updateMany: (...a: unknown[]) => updateManyOrder(...a),
      },
    })
  )
})

describe('processExpiredOrders — aviso durável', () => {
  test('ordem MARKET expirada grava linha em notifications, não só publish', async () => {
    findManyOrder.mockResolvedValue([marketOrder()])

    const result = await processExpiredOrders()

    expect(result.expired).toBe(1)
    expect(createNotification).toHaveBeenCalledTimes(1)
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'ORDER_CANCELLED',
        metadata: expect.objectContaining({ orderId: 'ord-1', ticker: 'URU3', status: 'EXPIRED' }),
      })
    )
    const body = createNotification.mock.calls[0]![0].body as string
    expect(body).toContain('URU3')
    // Sem debito: o produto cobra no fill, e ordem expirada nunca executou.
    expect(body.toLowerCase()).toContain('nenhum valor foi debitado')
  })

  test('MARKET entra na varredura — sem isso a ordem travada fica OPEN para sempre', async () => {
    findManyOrder.mockResolvedValue([])
    await processExpiredOrders()

    const where = findManyOrder.mock.calls[0]![0].where as { type: { in: string[] } }
    expect(where.type.in).toEqual(expect.arrayContaining(['MARKET', 'LIMIT', 'OCO', 'SCHEDULED']))
  })

  test('o corpo identifica lado, quantidade e ticker da ordem', async () => {
    // Com duas ordens abertas no mesmo ticker, "sua ordem de URU3 expirou" não diz qual.
    findManyOrder.mockResolvedValue([marketOrder({ side: 'SELL', quantity: 50 })])

    await processExpiredOrders()

    const { body, metadata } = createNotification.mock.calls[0][0]
    expect(body).toContain('de venda de 50 URU3')
    expect(metadata).toEqual(expect.objectContaining({ side: 'SELL', quantity: 50 }))
  })

  test('falha do Redis não custa a notificação durável', async () => {
    findManyOrder.mockResolvedValue([marketOrder()])
    publish.mockRejectedValue(new Error('Connection is closed.'))

    const result = await processExpiredOrders()

    expect(result.expired).toBe(1)
    expect(createNotification).toHaveBeenCalledTimes(1)
  })

  test('falha ao notificar não reverte nem aborta o lote', async () => {
    findManyOrder.mockResolvedValue([
      marketOrder(),
      marketOrder({ id: 'ord-2', userId: 'user-2', asset: { ticker: 'CRZ3' } }),
    ])
    createNotification.mockRejectedValueOnce(new Error('db down'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const result = await processExpiredOrders()

    expect(result.expired).toBe(2)
    expect(updateManyOrder).toHaveBeenCalledTimes(2)
    expect(createNotification).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Falha ao notificar expiração da ordem ord-1'),
      expect.any(Error)
    )
    spy.mockRestore()
  })

  test('par OCO com as duas pernas vivas notifica as duas', async () => {
    findManyOrder
      .mockResolvedValueOnce([marketOrder({ id: 'leg-a', type: 'OCO', groupId: 'grp-1' })])
      .mockResolvedValueOnce([
        { id: 'leg-a', userId: 'user-1' },
        { id: 'leg-b', userId: 'user-1' },
      ])

    const result = await processExpiredOrders()

    expect(result.expired).toBe(2)
    expect(createNotification).toHaveBeenCalledTimes(2)
    expect(createNotification.mock.calls.map((c) => c[0].metadata.orderId)).toEqual(['leg-a', 'leg-b'])
  })

  /**
   * Regressão OCO (2026-09-02): a leitura das pernas era feita DEPOIS do updateMany e
   * SEM filtro de status, então uma perna já FILLED/CANCELLED — estado normal de um par
   * OCO cuja irmã executou — recebia "Ordem expirada". Antes da correção do Zero Silêncio
   * isso era um publish num canal sem assinante; com a linha durável viraria um aviso
   * falso na caixa do usuário. A perna terminal não pode aparecer nem na notificação nem
   * na contagem.
   */
  test('par OCO com uma perna terminal notifica só a perna que expirou', async () => {
    findManyOrder
      .mockResolvedValueOnce([marketOrder({ id: 'leg-a', type: 'OCO', groupId: 'grp-1' })])
      // A leitura acontece dentro da transaction, com o mesmo filtro do updateMany:
      // a perna FILLED não é devolvida.
      .mockResolvedValueOnce([{ id: 'leg-a', userId: 'user-1' }])
    updateManyOrder.mockResolvedValue({ count: 1 })

    const result = await processExpiredOrders()

    expect(result.expired).toBe(1)
    expect(createNotification).toHaveBeenCalledTimes(1)
    expect(createNotification.mock.calls[0][0].metadata.orderId).toBe('leg-a')
  })

  test('a notificação carrega chave idempotente amarrada à ordem, não à execução do cron', async () => {
    // O agendamento pode rodar duas vezes sobre o mesmo evento (duas instâncias do app,
    // retry após crash). Sem chave, cada rodada duplicaria o aviso na caixa do usuário.
    findManyOrder.mockResolvedValue([marketOrder()])

    await processExpiredOrders()

    expect(createNotification.mock.calls[0][0].idempotencyKey).toBe('expiry:order:ord-1')
  })

  /**
   * CAS (2026-09-02). Entre o findMany e a escrita do status existe uma janela em que o
   * motor pode liquidar a ordem. Sem guarda de status, o job sobrescrevia FILLED por
   * EXPIRED e — agora que o aviso é durável — ainda mandava "expirou sem execução, nenhum
   * valor foi debitado" para uma ordem que acabou de executar e debitar.
   */
  test('ordem que mudou de estado na janela não é expirada nem notificada', async () => {
    findManyOrder.mockResolvedValue([marketOrder()])
    updateManyOrder.mockResolvedValue({ count: 0 })

    const result = await processExpiredOrders()

    expect(result.expired).toBe(0)
    expect(createNotification).not.toHaveBeenCalled()
    const where = updateManyOrder.mock.calls[0]![0].where as { id: string; status: { in: string[] } }
    expect(where.id).toBe('ord-1')
    expect(where.status.in).toEqual(expect.arrayContaining(['OPEN', 'PARTIAL']))
  })

  /**
   * PARTIAL entra na varredura, e para ela "sem execução / nenhum valor foi debitado" é
   * falso: parte executou e parte foi cobrada. Mentir numa linha durável é pior que o
   * silêncio que esta correção veio matar.
   */
  test('ordem PARTIAL não recebe o corpo de "sem execução"', async () => {
    findManyOrder.mockResolvedValue([marketOrder({ status: 'PARTIAL' })])

    await processExpiredOrders()

    const { body, metadata } = createNotification.mock.calls[0][0]
    expect(body).toContain('parcial')
    expect(body).not.toContain('sem execução')
    expect(body.toLowerCase()).not.toContain('nenhum valor foi debitado')
    expect(metadata.statusAnterior).toBe('PARTIAL')
  })

  /**
   * As duas pernas de um par OCO compartilham side e quantity (OrderService.createOrder);
   * só o preço difere. Sem ele o usuário recebe DOIS avisos byte-idênticos por uma única
   * ordem que colocou, e não tem como saber que são pernas da mesma coisa.
   */
  test('as duas pernas do par OCO geram avisos distinguíveis pelo preço', async () => {
    findManyOrder
      .mockResolvedValueOnce([marketOrder({ id: 'leg-a', type: 'OCO', groupId: 'grp-1' })])
      .mockResolvedValueOnce([
        { id: 'leg-a', userId: 'user-1', side: 'SELL', quantity: 50, price: 92.77, status: 'OPEN' },
        { id: 'leg-b', userId: 'user-1', side: 'SELL', quantity: 50, price: 81.63, status: 'OPEN' },
      ])

    await processExpiredOrders()

    const bodies = createNotification.mock.calls.map((c) => c[0].body as string)
    expect(bodies[0]).toContain('92.77 FS')
    expect(bodies[1]).toContain('81.63 FS')
    expect(bodies[0]).not.toBe(bodies[1])
  })

  test('as pernas são lidas dentro da transaction, antes do update e com filtro de status', async () => {
    const order: string[] = []
    findManyOrder
      .mockResolvedValueOnce([marketOrder({ id: 'leg-a', type: 'OCO', groupId: 'grp-1' })])
      .mockImplementationOnce(async (...a: unknown[]) => {
        order.push('findMany')
        const arg = a[0] as { where: { groupId: string; status: { in: string[] } } }
        expect(arg.where.groupId).toBe('grp-1')
        expect(arg.where.status.in).toEqual(expect.arrayContaining(['OPEN', 'PARTIAL']))
        return [{ id: 'leg-a', userId: 'user-1' }]
      })
    updateManyOrder.mockImplementation(async () => {
      order.push('updateMany')
      return { count: 1 }
    })

    await processExpiredOrders()

    expect(order).toEqual(['findMany', 'updateMany'])
  })
})
