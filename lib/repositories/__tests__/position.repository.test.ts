import { positionRepository } from '../position.repository'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    position: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
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
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(() => jest.clearAllMocks())

  test('findByUser retorna posições do usuário com dados do asset', async () => {
    mockPrisma.position.findMany.mockResolvedValue([mockPosition] as any)
    const result = await positionRepository.findByUser('user_001')
    expect(result).toHaveLength(1)
    expect(mockPrisma.position.findMany).toHaveBeenCalledWith({
      where: { userId: 'user_001' },
      include: {
        asset: {
          select: { ticker: true, name: true, currentPrice: true, colorPrimary: true },
        },
      },
    })
  })

  test('findByUser retorna array vazio para portfólio vazio (não null)', async () => {
    mockPrisma.position.findMany.mockResolvedValue([])
    const result = await positionRepository.findByUser('user_sem_posicoes')
    expect(result).toEqual([])
    expect(Array.isArray(result)).toBe(true)
  })

  test('findByUserAndAsset retorna posição existente', async () => {
    mockPrisma.position.findUnique.mockResolvedValue(mockPosition as any)
    const result = await positionRepository.findByUserAndAsset('user_001', 'asset_001')
    expect(result?.quantity).toBe(50)
    expect(mockPrisma.position.findUnique).toHaveBeenCalledWith({
      where: { userId_assetId: { userId: 'user_001', assetId: 'asset_001' } },
    })
  })

  test('findByUserAndAsset retorna null para posição inexistente', async () => {
    mockPrisma.position.findUnique.mockResolvedValue(null)
    const result = await positionRepository.findByUserAndAsset('user_001', 'asset_inexistente')
    expect(result).toBeNull()
  })

  test('upsert cria nova posição quando não existe', async () => {
    const newPosition = { ...mockPosition, id: 'pos_new' }
    mockPrisma.position.upsert.mockResolvedValue(newPosition as any)
    const result = await positionRepository.upsert('user_001', 'asset_001', {
      quantity: 50,
      avgPrice: 25.5,
      totalInvested: 1275.0,
    })
    expect(result.id).toBe('pos_new')
    expect(mockPrisma.position.upsert).toHaveBeenCalledWith({
      where: { userId_assetId: { userId: 'user_001', assetId: 'asset_001' } },
      create: { userId: 'user_001', assetId: 'asset_001', quantity: 50, avgPrice: 25.5, totalInvested: 1275.0 },
      update: { quantity: 50, avgPrice: 25.5, totalInvested: 1275.0 },
    })
  })

  test('upsert atualiza posição existente', async () => {
    const updatedPosition = { ...mockPosition, quantity: 100, avgPrice: 26.0 }
    mockPrisma.position.upsert.mockResolvedValue(updatedPosition as any)
    const result = await positionRepository.upsert('user_001', 'asset_001', {
      quantity: 100,
      avgPrice: 26.0,
      totalInvested: 2600.0,
    })
    expect(result.quantity).toBe(100)
  })

  test('delete remove posição pelo compound key', async () => {
    mockPrisma.position.delete.mockResolvedValue(mockPosition as any)
    await positionRepository.delete('user_001', 'asset_001')
    expect(mockPrisma.position.delete).toHaveBeenCalledWith({
      where: { userId_assetId: { userId: 'user_001', assetId: 'asset_001' } },
    })
  })
})
