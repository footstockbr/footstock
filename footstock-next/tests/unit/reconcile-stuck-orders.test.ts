/**
 * Fase 3 (M072) — rede de contencao operada por humano.
 *
 * O script nao e cron: e o invariante que verifica, depois de cada peca nova do
 * ciclo de vida, que nenhuma ordem ficou presa. Hoje ele passa de graca (a Fase
 * 2 zerou a fila); o valor esta em nao poder cancelar a ordem errada quando um
 * dia ele achar alguma coisa.
 *
 * Criterio de aceite do design §7: rodar duas vezes seguidas com --apply e a
 * segunda ser no-op total. O ultimo teste deste arquivo e exatamente isso.
 */

const findManyOrder = jest.fn()
const updateManyOrder = jest.fn()
const transaction = jest.fn()
const createNotification = jest.fn()
const disconnect = jest.fn()

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    order: {
      findMany: (...a: unknown[]) => findManyOrder(...a),
      updateMany: (...a: unknown[]) => updateManyOrder(...a),
    },
    $transaction: (...a: unknown[]) => transaction(...a),
    $disconnect: (...a: unknown[]) => disconnect(...a),
  },
}))

jest.mock('../../src/lib/repositories/NotificationRepository', () => ({
  notificationRepository: { create: (...a: unknown[]) => createNotification(...a) },
}))

import { parseArgs, run } from '../../scripts/reconcile-stuck-orders'

const NOW = new Date('2026-09-02T12:00:00.000Z')
const HOURS = 3_600_000

function stuck(over: Record<string, unknown> = {}) {
  return {
    id: 'ord-1',
    userId: 'user-1',
    status: 'OPEN',
    type: 'MARKET',
    side: 'BUY',
    quantity: 7,
    price: 12.5,
    groupId: null,
    createdAt: new Date(NOW.getTime() - 48 * HOURS),
    attemptCount: 3,
    lastErrorCode: 'P2034',
    lastAttemptAt: new Date(NOW.getTime() - 2 * HOURS),
    nextAttemptAt: null,
    asset: { ticker: 'URU3' },
    ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  createNotification.mockResolvedValue({})
  updateManyOrder.mockResolvedValue({ count: 1 })
  findManyOrder.mockResolvedValue([])
  transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      order: {
        findMany: (...a: unknown[]) => findManyOrder(...a),
        updateMany: (...a: unknown[]) => updateManyOrder(...a),
      },
    })
  )
})

describe('parseArgs', () => {
  test('default e dry-run com 24h', () => {
    expect(parseArgs([])).toEqual({ apply: false, json: false, minAgeHours: 24 })
  })

  test('--apply e --min-age-hours sao respeitados', () => {
    expect(parseArgs(['--apply', '--min-age-hours', '48'])).toEqual({
      apply: true,
      json: false,
      minAgeHours: 48,
    })
  })

  test('idade minima nunca cai abaixo de 1h', () => {
    // `--min-age-hours 0` cancelaria ordem recem-criada que o motor ainda nem
    // olhou. O clamp e a diferenca entre uma varredura e um incidente.
    expect(parseArgs(['--min-age-hours', '0']).minAgeHours).toBe(1)
  })
})

describe('run — dry-run', () => {
  test('nao escreve nada e nao notifica ninguem', async () => {
    findManyOrder.mockResolvedValue([stuck()])

    const summary = await run(parseArgs([]), NOW)

    expect(summary.mode).toBe('DRY-RUN')
    expect(summary.scanned).toBe(1)
    expect(summary.eligible).toBe(1)
    expect(updateManyOrder).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
  })

  test('reporta os campos de diagnostico da tentativa', async () => {
    findManyOrder.mockResolvedValue([stuck()])

    const [row] = (await run(parseArgs([]), NOW)).rows

    expect(row).toEqual(
      expect.objectContaining({
        ticker: 'URU3',
        status: 'OPEN',
        ageHours: 48,
        attemptCount: 3,
        lastErrorCode: 'P2034',
        eligible: true,
      })
    )
    // Id do usuario nunca sai cru num relatorio de operacao.
    expect(row.orderId).toBe('ord-...rd-1')
  })

  test('so varre ordem mais velha que o limiar', async () => {
    await run(parseArgs(['--min-age-hours', '48']), NOW)

    const where = findManyOrder.mock.calls[0][0].where
    expect(where.status).toEqual({ in: ['OPEN', 'PARTIAL'] })
    expect(where.createdAt.lt.toISOString()).toBe(new Date(NOW.getTime() - 48 * HOURS).toISOString())
  })
})

describe('run --apply', () => {
  test('encerra com CAS, motivo RECONCILIATION e backoff zerado', async () => {
    findManyOrder.mockResolvedValue([stuck()])

    const summary = await run(parseArgs(['--apply']), NOW)

    expect(summary.cancelled).toBe(1)
    expect(updateManyOrder).toHaveBeenCalledWith({
      // CAS: o motor pode liquidar entre a leitura e a escrita. Sem a guarda de
      // status, FILLED viraria CANCELLED — perda financeira silenciosa.
      where: { id: 'ord-1', status: { in: ['OPEN', 'PARTIAL'] } },
      data: { status: 'CANCELLED', cancelReason: 'RECONCILIATION', nextAttemptAt: null },
    })
  })

  test('grava aviso duravel com chave disjunta das outras origens', async () => {
    findManyOrder.mockResolvedValue([stuck()])

    await run(parseArgs(['--apply']), NOW)

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'ORDER_CANCELLED',
        idempotencyKey: 'reconciliation:order:ord-1',
      })
    )
    const body = createNotification.mock.calls[0][0].body as string
    expect(body).toContain('URU3')
    expect(body).toContain('Nenhum valor foi debitado')
  })

  test('ordem PARTIAL nao recebe corpo que nega a execucao parcial', async () => {
    findManyOrder.mockResolvedValue([stuck({ status: 'PARTIAL' })])

    await run(parseArgs(['--apply']), NOW)

    const body = createNotification.mock.calls[0][0].body as string
    expect(body).toContain('parcial')
    expect(body).not.toContain('Nenhum valor foi debitado')
  })

  test('ordem em backoff ativo NAO e tocada', async () => {
    // `nextAttemptAt` no futuro significa que o motor ainda vai tentar.
    // Encerrar ali rouba uma tentativa legitima de uma ordem sa.
    findManyOrder.mockResolvedValue([stuck({ nextAttemptAt: new Date(NOW.getTime() + 5 * 60_000) })])

    const summary = await run(parseArgs(['--apply']), NOW)

    expect(summary.inBackoff).toBe(1)
    expect(summary.eligible).toBe(0)
    expect(summary.cancelled).toBe(0)
    expect(updateManyOrder).not.toHaveBeenCalled()
    expect(summary.rows[0].eligible).toBe(false)
  })

  test('corrida perdida vira RACED, sem aviso ao usuario', async () => {
    findManyOrder.mockResolvedValue([stuck()])
    updateManyOrder.mockResolvedValue({ count: 0 })

    const summary = await run(parseArgs(['--apply']), NOW)

    expect(summary.raced).toBe(1)
    expect(summary.cancelled).toBe(0)
    // A ordem foi liquidada por outro processo. Mandar "encerrada, nada foi
    // debitado" para uma ordem que acabou de executar e mentir.
    expect(createNotification).not.toHaveBeenCalled()
  })

  test('par OCO encerra as duas pernas na mesma transaction e avisa as duas', async () => {
    const leg1 = stuck({ id: 'ord-1', type: 'OCO', groupId: 'grp-1' })
    const leg2 = stuck({ id: 'ord-2', type: 'OCO', groupId: 'grp-1', price: 20 })
    findManyOrder.mockResolvedValueOnce([leg1, leg2])
    // Leitura DENTRO da transaction, com o mesmo filtro de status do update.
    findManyOrder.mockResolvedValue([
      { id: 'ord-1', userId: 'user-1', side: 'BUY', quantity: 7, price: 12.5, status: 'OPEN' },
      { id: 'ord-2', userId: 'user-1', side: 'BUY', quantity: 7, price: 20, status: 'OPEN' },
    ])

    const summary = await run(parseArgs(['--apply']), NOW)

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(summary.cancelled).toBe(2)
    expect(createNotification.mock.calls.map((c) => c[0].idempotencyKey)).toEqual([
      'reconciliation:order:ord-1',
      'reconciliation:order:ord-2',
    ])
    const groupUpdate = updateManyOrder.mock.calls.at(-1)![0]
    expect(groupUpdate.where).toEqual({ groupId: 'grp-1', status: { in: ['OPEN', 'PARTIAL'] } })
  })

  test('par OCO cujas pernas ja morreram: nada e notificado', async () => {
    findManyOrder.mockResolvedValueOnce([stuck({ type: 'OCO', groupId: 'grp-1' })])
    findManyOrder.mockResolvedValue([])

    const summary = await run(parseArgs(['--apply']), NOW)

    expect(summary.raced).toBe(1)
    expect(summary.cancelled).toBe(0)
    expect(createNotification).not.toHaveBeenCalled()
  })

  test('falha em uma ordem nao aborta o lote', async () => {
    findManyOrder.mockResolvedValue([stuck({ id: 'ord-1' }), stuck({ id: 'ord-2' })])
    updateManyOrder.mockRejectedValueOnce(new Error('deadlock'))
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const summary = await run(parseArgs(['--apply']), NOW)

    expect(summary.failed).toBe(1)
    expect(summary.cancelled).toBe(1)
    spy.mockRestore()
  })

  test('criterio de aceite: a segunda passada e no-op total', async () => {
    findManyOrder.mockResolvedValue([stuck()])
    const first = await run(parseArgs(['--apply']), NOW)
    expect(first.cancelled).toBe(1)

    jest.clearAllMocks()
    createNotification.mockResolvedValue({})
    // Ordem encerrada saiu de OPEN/PARTIAL: o findMany nao a devolve mais.
    findManyOrder.mockResolvedValue([])

    const second = await run(parseArgs(['--apply']), NOW)

    expect(second).toEqual(
      expect.objectContaining({ scanned: 0, eligible: 0, cancelled: 0, raced: 0, failed: 0 })
    )
    expect(updateManyOrder).not.toHaveBeenCalled()
    expect(createNotification).not.toHaveBeenCalled()
  })
})
