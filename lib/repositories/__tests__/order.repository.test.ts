import { orderRepository } from '../order.repository'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('OrderRepository', () => {
  const mockOrder = {
    id: 'order_001',
    userId: 'user_001',
    assetId: 'asset_001',
    type: 'MARKET' as const,
    side: 'BUY' as const,
    status: 'OPEN' as const,
    quantity: 100,
    price: null,
    executedPrice: null,
    fee: 0,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(() => jest.clearAllMocks())

  test('findOpenByAsset retorna ordens abertas de um ativo', async () => {
    mockPrisma.order.findMany.mockResolvedValue([mockOrder] as any)
    const result = await orderRepository.findOpenByAsset('asset_001')
    expect(result).toHaveLength(1)
    expect(mockPrisma.order.findMany).toHaveBeenCalledWith({
      where: { assetId: 'asset_001', status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
    })
  })

  test('findOpenByAsset retorna array vazio quando não há ordens', async () => {
    mockPrisma.order.findMany.mockResolvedValue([])
    const result = await orderRepository.findOpenByAsset('asset_inexistente')
    expect(result).toEqual([])
  })

  test('findByUser retorna ordens paginadas com total', async () => {
    ;(mockPrisma.$transaction as jest.Mock).mockResolvedValue([[mockOrder], 1])
    const result = await orderRepository.findByUser('user_001')
    expect(result.data).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  test('findByUser filtra por status quando fornecido', async () => {
    ;(mockPrisma.$transaction as jest.Mock).mockResolvedValue([[], 0])
    await orderRepository.findByUser('user_001', 'FILLED')
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(
      expect.arrayContaining([expect.anything(), expect.anything()])
    )
  })

  test('findByUser retorna vazio para usuário sem ordens', async () => {
    ;(mockPrisma.$transaction as jest.Mock).mockResolvedValue([[], 0])
    const result = await orderRepository.findByUser('user_sem_ordens')
    expect(result.data).toEqual([])
    expect(result.total).toBe(0)
  })

  test('create retorna ordem criada', async () => {
    mockPrisma.order.create.mockResolvedValue(mockOrder as any)
    const result = await orderRepository.create({
      user: { connect: { id: 'user_001' } },
      asset: { connect: { id: 'asset_001' } },
      type: 'MARKET',
      side: 'BUY',
      quantity: 100,
    } as any)
    expect(result.id).toBe('order_001')
  })

  test('updateStatus atualiza status da ordem', async () => {
    const filledOrder = { ...mockOrder, status: 'FILLED', executedPrice: 25.5 }
    mockPrisma.order.update.mockResolvedValue(filledOrder as any)
    const result = await orderRepository.updateStatus('order_001', 'FILLED', 25.5)
    expect(result.status).toBe('FILLED')
    expect(mockPrisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order_001' },
      data: { status: 'FILLED', executedPrice: 25.5 },
    })
  })

  test('updateStatus sem executedPrice não inclui o campo', async () => {
    const cancelledOrder = { ...mockOrder, status: 'CANCELLED' }
    mockPrisma.order.update.mockResolvedValue(cancelledOrder as any)
    await orderRepository.updateStatus('order_001', 'CANCELLED')
    expect(mockPrisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order_001' },
      data: { status: 'CANCELLED' },
    })
  })
})
