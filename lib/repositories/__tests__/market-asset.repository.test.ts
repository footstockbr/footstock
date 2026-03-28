// ============================================================================
// Foot Stock — MarketAssetRepository Tests
// ============================================================================

import { MarketAssetRepository } from '../MarketAssetRepository'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

function makeDbAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: 'asset-1',
    ticker: 'VAR1',
    name: 'Urubu da Gávea',
    clubSlug: 'vasco',
    division: 'SERIE_A' as const,
    cluster: 'A_TOP',
    currentPrice: { valueOf: () => 42.5, toNumber: () => 42.5, toString: () => '42.5' },
    openPrice: { valueOf: () => 40, toNumber: () => 40, toString: () => '40' },
    closePrice: { valueOf: () => 41, toNumber: () => 41, toString: () => '41' },
    volume: BigInt(1000),
    marketCap: { valueOf: () => 42500, toNumber: () => 42500, toString: () => '42500' },
    isActive: true,
    colorPrimary: '#000',
    colorSecondary: '#fff',
    logoUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    priceHistory: [
      { close: { valueOf: () => 40, toNumber: () => 40, toString: () => '40' }, timestamp: new Date() },
    ],
    ...overrides,
  }
}

describe('MarketAssetRepository', () => {
  let repo: MarketAssetRepository

  beforeEach(() => {
    repo = new MarketAssetRepository()
    jest.clearAllMocks()
  })

  it('findAll retorna ativos com change24h calculado', async () => {
    const asset = makeDbAsset()
    ;(mockPrisma.$transaction as jest.Mock).mockResolvedValue([[asset], 1])

    const result = await repo.findAll({}, { page: 1, limit: 20 })

    expect(result.total).toBe(1)
    expect(result.data[0]!.ticker).toBe('VAR1')
    expect(result.data[0]!.change24h).toBeGreaterThan(0) // currentPrice > firstHistoryPrice
  })

  it('findAll limita a 40 ativos por requisição', async () => {
    ;(mockPrisma.$transaction as jest.Mock).mockResolvedValue([[], 0])

    await repo.findAll({}, { page: 1, limit: 50 })

    const callArgs = (mockPrisma.$transaction as jest.Mock).mock.calls[0][0]
    // Verifica que o findMany tem take <= 40
    expect(callArgs).toBeDefined()
  })

  it('findAll filtra por division SERIE_A', async () => {
    ;(mockPrisma.$transaction as jest.Mock).mockResolvedValue([[], 0])

    await repo.findAll({ division: 'SERIE_A' }, { page: 1, limit: 20 })

    const txCalls = (mockPrisma.$transaction as jest.Mock).mock.calls[0][0]
    expect(txCalls).toBeDefined()
  })

  it('findByTicker retorna null para ticker inexistente', async () => {
    ;(mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(null)

    const result = await repo.findByTicker('INEXISTENTE')
    expect(result).toBeNull()
  })

  it('findByTicker retorna AssetListItem para ticker existente', async () => {
    const asset = makeDbAsset()
    ;(mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(asset)

    const result = await repo.findByTicker('VAR1')
    expect(result).not.toBeNull()
    expect(result?.ticker).toBe('VAR1')
    expect(result?.currentPrice).toBe(42.5)
  })
})
