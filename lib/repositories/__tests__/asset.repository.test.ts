import { assetRepository } from '../asset.repository'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}))

describe('AssetRepository', () => {
  const mockAsset = {
    id: 'asset_001',
    ticker: 'FLM3',
    name: 'Flamengo',
    clubSlug: 'flamengo',
    division: 'SERIE_A' as const,
    cluster: 'A_TOP',
    currentPrice: 28.5 as any,
    openPrice: 28.0 as any,
    closePrice: 28.0 as any,
    volume: BigInt(0),
    marketCap: 28500000 as any,
    isActive: true,
    colorPrimary: '#e21d1d',
    colorSecondary: '#1a1a1a',
    logoUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(() => jest.clearAllMocks())

  test('findAll retorna apenas ativos por padrão', async () => {
    ;(prisma.asset.findMany as jest.Mock).mockResolvedValue([mockAsset])
    await assetRepository.findAll()
    expect(prisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } })
    )
  })

  test('findAll sem filtro retorna todos', async () => {
    ;(prisma.asset.findMany as jest.Mock).mockResolvedValue([mockAsset])
    await assetRepository.findAll(false)
    expect(prisma.asset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined })
    )
  })

  test('findByTicker retorna asset correto', async () => {
    ;(prisma.asset.findUnique as jest.Mock).mockResolvedValue(mockAsset)
    const result = await assetRepository.findByTicker('FLM3')
    expect(result?.ticker).toBe('FLM3')
    expect(prisma.asset.findUnique).toHaveBeenCalledWith({ where: { ticker: 'FLM3' } })
  })

  test('findByTicker retorna null para ticker inexistente', async () => {
    ;(prisma.asset.findUnique as jest.Mock).mockResolvedValue(null)
    const result = await assetRepository.findByTicker('XXX9')
    expect(result).toBeNull()
  })

  test('updatePrice atualiza currentPrice', async () => {
    const updated = { ...mockAsset, currentPrice: 29.0 as any }
    ;(prisma.asset.update as jest.Mock).mockResolvedValue(updated)
    const result = await assetRepository.updatePrice('asset_001', { currentPrice: 29.0 })
    expect(result.currentPrice).toBe(29.0)
    expect(prisma.asset.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'asset_001' } })
    )
  })
})
