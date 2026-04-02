import { positionRepository } from '../position.repository'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    position: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('PositionRepository', () => {
  const mockPosition = {
    id: 'pos_001',
    userId: 'user_001',
    assetId: 'asset_001',
    quantity: 50,
    avgPrice: 25.5,
    totalInvested: 1275.0,
    status: 'OPEN',
    side: 'LONG',
    leverageMultiplier: 1,
    leverageAmount: 0,
    marginBlocked: 0,
    dailyInterestRate: 0,
    interestAccrued: 0,
    openedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(() => jest.clearAllMocks())

  test('findByUser retorna posições do usuário com dados do asset', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockPrisma.position.findMany as jest.Mock).mockResolvedValue([mockPosition])
    const result = await positionRepository.findByUser('user_001')
    expect(result).toHaveLength(1)
    expect(mockPrisma.position.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user_001' },
      })
    )
  })

  test('findByUser retorna array vazio para portfólio vazio (não null)', async () => {
    ;(mockPrisma.position.findMany as jest.Mock).mockResolvedValue([])
    const result = await positionRepository.findByUser('user_sem_posicoes')
    expect(result).toEqual([])
    expect(Array.isArray(result)).toBe(true)
  })

  test('findByUserAndAsset retorna posição existente', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockPrisma.position.findFirst as jest.Mock).mockResolvedValue(mockPosition)
    const result = await positionRepository.findByUserAndAsset('user_001', 'asset_001')
    expect(result?.quantity).toBe(50)
    expect(mockPrisma.position.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user_001', assetId: 'asset_001' }),
      })
    )
  })

  test('findByUserAndAsset retorna null para posição inexistente', async () => {
    ;(mockPrisma.position.findFirst as jest.Mock).mockResolvedValue(null)
    const result = await positionRepository.findByUserAndAsset('user_001', 'asset_inexistente')
    expect(result).toBeNull()
  })

  test('upsert cria nova posição quando não existe', async () => {
    const newPosition = { ...mockPosition, id: 'pos_new' }
    ;(mockPrisma.position.findFirst as jest.Mock).mockResolvedValue(null)
    ;(mockPrisma.position.create as jest.Mock).mockResolvedValue(newPosition)
    const result = await positionRepository.upsert('user_001', 'asset_001', {
      quantity: 50,
      avgPrice: 25.5,
      totalInvested: 1275.0,
    })
    expect(result.id).toBe('pos_new')
    expect(mockPrisma.position.create).toHaveBeenCalled()
  })

  test('upsert atualiza posição existente', async () => {
    const updatedPosition = { ...mockPosition, quantity: 100, avgPrice: 26.0 }
    ;(mockPrisma.position.findFirst as jest.Mock).mockResolvedValue({ id: 'pos_001' })
    ;(mockPrisma.position.update as jest.Mock).mockResolvedValue(updatedPosition)
    const result = await positionRepository.upsert('user_001', 'asset_001', {
      quantity: 100,
      avgPrice: 26.0,
      totalInvested: 2600.0,
    })
    expect(result.quantity).toBe(100)
    expect(mockPrisma.position.update).toHaveBeenCalled()
  })

  test('delete remove posição pelo compound key', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockPrisma.position.deleteMany as jest.Mock).mockResolvedValue({ count: 1 })
    await positionRepository.delete('user_001', 'asset_001')
    expect(mockPrisma.position.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user_001', assetId: 'asset_001' }),
      })
    )
  })
})
