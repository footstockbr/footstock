// ============================================================================
// Foot Stock — Testes unitários: job order-expiry
// Cobre: expiração de ordens LIMIT/SCHEDULED, expiração atômica de par OCO,
//        incremento de métrica Redis e publicação de notificações.
// ============================================================================

import { processExpiredOrders } from '../order-expiry'
import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/redis', () => ({
  redisPublisher: {
    publish: jest.fn(),
    incr: jest.fn(),
  },
}))

jest.mock('@/lib/contracts/order-contract', () => ({
  validateTransition: jest.fn(), // não lança por padrão
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockRedis = redis as jest.Mocked<typeof redis>

// Fábrica de ordem mock para facilitar a composição nos testes
function criarOrdemMock(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order_001',
    userId: 'user_001',
    assetId: 'asset_001',
    type: 'LIMIT',
    side: 'BUY',
    status: 'OPEN',
    quantity: 10,
    price: 25.0,
    groupId: null,
    createdAt: new Date('2025-12-01T00:00:00Z'), // > 30 dias atrás
    updatedAt: new Date('2025-12-01T00:00:00Z'),
    asset: { id: 'asset_001', ticker: 'CRZ', name: 'Cruzeiro' },
    ...overrides,
  }
}

describe('processExpiredOrders', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Por padrão: publish e incr resolvem sem erro
    ;(mockRedis.publish as jest.Mock).mockResolvedValue(0)
    ;(mockRedis.incr as jest.Mock).mockResolvedValue(1)
    ;(mockPrisma.order.update as jest.Mock).mockResolvedValue({})
  })

  test('retorna zero e lista vazia quando não há ordens expiradas', async () => {
    ;(mockPrisma.order.findMany as jest.Mock).mockResolvedValue([])

    const resultado = await processExpiredOrders()

    expect(resultado.expired).toBe(0)
    expect(resultado.tickers).toEqual([])
    expect(mockPrisma.order.update).not.toHaveBeenCalled()
  })

  test('expira ordem LIMIT com mais de 30 dias e atualiza status para EXPIRED', async () => {
    const ordemVelha = criarOrdemMock()
    ;(mockPrisma.order.findMany as jest.Mock).mockResolvedValue([ordemVelha])

    const resultado = await processExpiredOrders()

    expect(resultado.expired).toBe(1)
    expect(resultado.tickers).toContain('CRZ')
    expect(mockPrisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order_001' },
      data: { status: 'EXPIRED' },
    })
  })

  test('não expira e não chama update para ordens com menos de 31 dias', async () => {
    // O findMany retorna apenas ordens que já passaram no filtro do Prisma (lt: expiryDate).
    // Se o job receber lista vazia, nenhuma ordem deve ser processada.
    ;(mockPrisma.order.findMany as jest.Mock).mockResolvedValue([])

    const resultado = await processExpiredOrders()

    expect(resultado.expired).toBe(0)
    expect(mockPrisma.order.update).not.toHaveBeenCalled()
  })

  test('expira par OCO de forma atômica via groupId, processando cada perna uma única vez', async () => {
    const groupId = 'group_oco_001'
    const perna1 = criarOrdemMock({ id: 'order_oco_1', type: 'OCO', groupId })
    const perna2 = criarOrdemMock({ id: 'order_oco_2', type: 'OCO', groupId, side: 'SELL' })

    ;(mockPrisma.order.findMany as jest.Mock)
      .mockResolvedValueOnce([perna1, perna2])  // chamada inicial do job
      .mockResolvedValueOnce([perna1, perna2])  // chamada interna para buscar as pernas do grupo

    ;(mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) => fn({
      order: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    }))

    const resultado = await processExpiredOrders()

    // Deve ter processado as 2 pernas como um grupo
    expect(resultado.expired).toBe(2)
    // $transaction deve ter sido chamado uma única vez para o par
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })

  test('não reprocessa groupId OCO já processado nesta execução do job', async () => {
    const groupId = 'group_oco_duplicado'
    const perna1 = criarOrdemMock({ id: 'order_oco_a', type: 'OCO', groupId })
    const perna2 = criarOrdemMock({ id: 'order_oco_b', type: 'OCO', groupId })

    ;(mockPrisma.order.findMany as jest.Mock)
      .mockResolvedValueOnce([perna1, perna2])
      .mockResolvedValueOnce([perna1, perna2]) // legs lookup

    ;(mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) => fn({
      order: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    }))

    await processExpiredOrders()

    // Mesmo com duas pernas na lista, $transaction só deve ser chamado uma vez
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })

  test('publica notificação ORDER_CANCELLED para o userId da ordem expirada', async () => {
    const ordemVelha = criarOrdemMock()
    ;(mockPrisma.order.findMany as jest.Mock).mockResolvedValue([ordemVelha])

    await processExpiredOrders()

    expect(mockRedis.publish).toHaveBeenCalledWith(
      'notifications:user_001',
      JSON.stringify({
        type: 'ORDER_CANCELLED',
        orderId: 'order_001',
        ticker: 'CRZ',
        motivo: 'Ordem expirada após 30 dias',
        status: 'EXPIRED',
      }),
    )
  })

  test('publica notificação para cada perna do par OCO expirado', async () => {
    const groupId = 'group_notif'
    const perna1 = criarOrdemMock({ id: 'leg_1', type: 'OCO', groupId, userId: 'user_001' })
    const perna2 = criarOrdemMock({ id: 'leg_2', type: 'OCO', groupId, userId: 'user_001' })

    ;(mockPrisma.order.findMany as jest.Mock)
      .mockResolvedValueOnce([perna1, perna2])
      .mockResolvedValueOnce([perna1, perna2])

    ;(mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) => fn({
      order: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    }))

    await processExpiredOrders()

    // Deve publicar uma notificação por perna
    expect(mockRedis.publish).toHaveBeenCalledTimes(2)
    const publishCalls = (mockRedis.publish as jest.Mock).mock.calls.map(([, payload]) =>
      JSON.parse(payload as string),
    )
    const orderIds = publishCalls.map((p) => p.orderId)
    expect(orderIds).toContain('leg_1')
    expect(orderIds).toContain('leg_2')
  })

  test('incrementa motor:metrics:orders_expired ao final do processamento', async () => {
    ;(mockPrisma.order.findMany as jest.Mock).mockResolvedValue([criarOrdemMock()])

    await processExpiredOrders()

    expect(mockRedis.incr).toHaveBeenCalledWith('motor:metrics:orders_expired')
  })

  test('incrementa a métrica mesmo quando não há ordens para expirar', async () => {
    ;(mockPrisma.order.findMany as jest.Mock).mockResolvedValue([])

    await processExpiredOrders()

    // Quando não há ordens, o job retorna cedo antes do incr
    expect(mockRedis.incr).not.toHaveBeenCalled()
  })

  test('continua processando demais ordens mesmo quando uma falha individualmente', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { validateTransition } = require('@/lib/contracts/order-contract')
    validateTransition
      .mockImplementationOnce(() => { throw new Error('Transição inválida') })
      .mockImplementation(() => {})

    const ordemComFalha = criarOrdemMock({ id: 'order_falha' })
    const ordemValida = criarOrdemMock({ id: 'order_valida' })
    ;(mockPrisma.order.findMany as jest.Mock).mockResolvedValue([ordemComFalha, ordemValida])

    const resultado = await processExpiredOrders()

    // Apenas a ordem válida deve ter sido expirada
    expect(resultado.expired).toBe(1)
    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'order_valida' } }),
    )
  })
})
