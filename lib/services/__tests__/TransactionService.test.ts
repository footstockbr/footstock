// ============================================================================
// Foot Stock — Testes unitários: TransactionService
// Cobre: getTransactions (paginação, filtro por ticker) e getPositions (P&L, cache Redis)
// ============================================================================

import { TransactionService } from '../TransactionService'
import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: { findUnique: jest.fn() },
    transaction: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    position: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/redis', () => ({
  redisPublisher: {
    get: jest.fn(),
    setex: jest.fn(),
  },
}))

// Mocks sem contrato de tipo para evitar ruído nos testes
jest.mock('@/lib/contracts/order-contract', () => ({ validateTransition: jest.fn() }))
jest.mock('@/lib/contracts/transaction-contract', () => ({
  verifyNonNegativeBalance: jest.fn(() => true),
  verifyMarginConsistency: jest.fn(() => true),
}))
jest.mock('@/lib/services/OrderService', () => ({
  AppError: class AppError extends Error {
    constructor(public code: string, public status: number, public details?: unknown) {
      super(code)
    }
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockRedis = redis as jest.Mocked<typeof redis>

const MOCK_USER_ID = 'user_abc123'
const MOCK_ASSET_ID = 'asset_cruzeiro_001'

const mockTransaction = {
  id: 'tx_001',
  userId: MOCK_USER_ID,
  assetId: MOCK_ASSET_ID,
  orderId: 'order_001',
  type: 'MARKET',
  financialType: 'TRADE',
  side: 'BUY',
  quantity: 10,
  price: 25.0,
  fee: 0.25,
  totalAmount: 250.25,
  fsAmount: -250.25,
  balanceBefore: 1000,
  balanceAfter: 749.75,
  createdAt: new Date('2026-01-15T10:00:00Z'),
  updatedAt: new Date('2026-01-15T10:00:00Z'),
}

const mockPosition = {
  id: 'pos_001',
  userId: MOCK_USER_ID,
  assetId: MOCK_ASSET_ID,
  quantity: 10,
  avgPrice: 25.0,
  totalInvested: 250.0,
  side: 'LONG',
  status: 'OPEN',
  leverageMultiplier: 1,
  leverageAmount: 0,
  marginBlocked: 0,
  dailyInterestRate: 0,
  interestAccrued: 0,
  openedAt: new Date('2026-01-10T09:00:00Z'),
  createdAt: new Date('2026-01-10T09:00:00Z'),
  updatedAt: new Date('2026-01-10T09:00:00Z'),
  asset: {
    id: MOCK_ASSET_ID,
    ticker: 'CRZ',
    name: 'Cruzeiro',
    currentPrice: 30.0,
  },
}

describe('TransactionService', () => {
  let service: TransactionService

  beforeEach(() => {
    service = new TransactionService()
    jest.clearAllMocks()
  })

  // ──────────────────────────────────────────────
  // getTransactions
  // ──────────────────────────────────────────────

  describe('getTransactions', () => {
    test('retorna extrato paginado com valores corretos de pagination', async () => {
      ;(mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([mockTransaction])
      ;(mockPrisma.transaction.count as jest.Mock).mockResolvedValue(1)

      const result = await service.getTransactions(MOCK_USER_ID, { page: 1, limit: 20 })

      expect(result.data).toHaveLength(1)
      expect(result.pagination.page).toBe(1)
      expect(result.pagination.limit).toBe(20)
      expect(result.pagination.total).toBe(1)
      expect(result.pagination.totalPages).toBe(1)
    })

    test('respeita o offset correto na segunda página', async () => {
      ;(mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.transaction.count as jest.Mock).mockResolvedValue(25)

      await service.getTransactions(MOCK_USER_ID, { page: 2, limit: 10 })

      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      )
    })

    test('limita o máximo de registros por página a 100', async () => {
      ;(mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.transaction.count as jest.Mock).mockResolvedValue(0)

      await service.getTransactions(MOCK_USER_ID, { page: 1, limit: 9999 })

      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      )
    })

    test('filtra por ticker existente e inclui assetId no where', async () => {
      ;(mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue({
        id: MOCK_ASSET_ID,
        ticker: 'CRZ',
      })
      ;(mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([mockTransaction])
      ;(mockPrisma.transaction.count as jest.Mock).mockResolvedValue(1)

      const result = await service.getTransactions(MOCK_USER_ID, { ticker: 'CRZ' })

      expect(mockPrisma.asset.findUnique).toHaveBeenCalledWith({ where: { ticker: 'CRZ' } })
      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ assetId: MOCK_ASSET_ID }),
        }),
      )
      expect(result.data).toHaveLength(1)
    })

    test('retorna lista vazia quando ticker não existe no sistema', async () => {
      ;(mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(null)

      const result = await service.getTransactions(MOCK_USER_ID, { ticker: 'INEXISTENTE' })

      expect(result.data).toEqual([])
      expect(result.pagination.total).toBe(0)
      expect(result.pagination.totalPages).toBe(0)
      // Não deve consultar transactions quando ticker é inválido
      expect(mockPrisma.transaction.findMany).not.toHaveBeenCalled()
    })

    test('filtra por financialType quando fornecido', async () => {
      ;(mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue([])
      ;(mockPrisma.transaction.count as jest.Mock).mockResolvedValue(0)

      await service.getTransactions(MOCK_USER_ID, { financialType: 'SHORT_INTEREST' })

      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ financialType: 'SHORT_INTEREST' }),
        }),
      )
    })
  })

  // ──────────────────────────────────────────────
  // getPositions
  // ──────────────────────────────────────────────

  describe('getPositions', () => {
    test('calcula P&L corretamente quando currentPrice > avgPrice', async () => {
      // Cache miss
      ;(mockRedis.get as jest.Mock).mockResolvedValue(null)
      // Sem preço no Redis para o ticker
      ;(mockRedis.get as jest.Mock).mockImplementation((key: string) => {
        if (key.startsWith('price:')) return Promise.resolve(null)
        return Promise.resolve(null)
      })
      ;(mockPrisma.position.findMany as jest.Mock).mockResolvedValue([mockPosition])
      ;(mockRedis.setex as jest.Mock).mockResolvedValue('OK')

      const result = await service.getPositions(MOCK_USER_ID)

      // avgPrice=25, currentPrice=30, qty=10
      expect(result).toHaveLength(1)
      expect(result[0]!.pnl).toBeCloseTo(50) // (30-25)*10
      expect(result[0]!.pnlPercent).toBeCloseTo(20) // 50/250*100
      expect(result[0]!.currentValue).toBeCloseTo(300) // 30*10
    })

    test('calcula P&L negativo quando currentPrice < avgPrice', async () => {
      ;(mockRedis.get as jest.Mock).mockResolvedValue(null)
      const posicaoComPrejuizo = {
        ...mockPosition,
        avgPrice: 40.0,
        totalInvested: 400.0,
        asset: { ...mockPosition.asset, currentPrice: 30.0 },
      }
      ;(mockPrisma.position.findMany as jest.Mock).mockResolvedValue([posicaoComPrejuizo])
      ;(mockRedis.setex as jest.Mock).mockResolvedValue('OK')

      const result = await service.getPositions(MOCK_USER_ID)

      // avgPrice=40, currentPrice=30, qty=10
      expect(result[0]!.pnl).toBeCloseTo(-100)
      expect(result[0]!.pnlPercent).toBeCloseTo(-25)
    })

    test('usa preço do Redis quando disponível para calcular P&L', async () => {
      // Primeira chamada ao get (cache de posições) retorna null
      // Segunda chamada ao get (price:CRZ) retorna preço do Redis
      ;(mockRedis.get as jest.Mock)
        .mockResolvedValueOnce(null)            // cache miss de posições
        .mockResolvedValueOnce('35.00')         // preço do Redis para ticker CRZ

      ;(mockPrisma.position.findMany as jest.Mock).mockResolvedValue([mockPosition])
      ;(mockRedis.setex as jest.Mock).mockResolvedValue('OK')

      const result = await service.getPositions(MOCK_USER_ID)

      // Preço do Redis (35) deve prevalecer sobre asset.currentPrice (30)
      expect(result[0]!.currentPrice).toBe(35)
      expect(result[0]!.pnl).toBeCloseTo(100) // (35-25)*10
    })

    test('retorna dados do cache Redis quando disponível sem consultar o banco', async () => {
      const cachedPositions = [
        { ...mockPosition, currentPrice: 28, currentValue: 280, pnl: 30, pnlPercent: 12 },
      ]
      const serialized = JSON.stringify(cachedPositions)
      ;(mockRedis.get as jest.Mock).mockResolvedValue(serialized)

      const result = await service.getPositions(MOCK_USER_ID)

      // Compare serialized forms: JSON.parse converts Date objects to strings
      expect(JSON.stringify(result)).toEqual(serialized)
      // Não deve ir ao banco quando há cache
      expect(mockPrisma.position.findMany).not.toHaveBeenCalled()
    })

    test('faz fallback para o banco quando Redis lança exceção', async () => {
      ;(mockRedis.get as jest.Mock).mockRejectedValue(new Error('Redis connection refused'))
      ;(mockPrisma.position.findMany as jest.Mock).mockResolvedValue([mockPosition])
      // Também simula falha no setex para exercitar o catch silencioso
      ;(mockRedis.setex as jest.Mock).mockRejectedValue(new Error('Redis unavailable'))

      const result = await service.getPositions(MOCK_USER_ID)

      expect(result).toHaveLength(1)
      expect(result[0]!.currentPrice).toBe(30) // usa asset.currentPrice como fallback
      expect(mockPrisma.position.findMany).toHaveBeenCalled()
    })

    test('retorna array vazio quando usuário não tem posições abertas', async () => {
      ;(mockRedis.get as jest.Mock).mockResolvedValue(null)
      ;(mockPrisma.position.findMany as jest.Mock).mockResolvedValue([])
      ;(mockRedis.setex as jest.Mock).mockResolvedValue('OK')

      const result = await service.getPositions(MOCK_USER_ID)

      expect(result).toEqual([])
    })

    test('armazena resultado no cache Redis com TTL de 30 segundos', async () => {
      ;(mockRedis.get as jest.Mock).mockResolvedValue(null)
      ;(mockPrisma.position.findMany as jest.Mock).mockResolvedValue([mockPosition])
      ;(mockRedis.setex as jest.Mock).mockResolvedValue('OK')

      await service.getPositions(MOCK_USER_ID)

      expect(mockRedis.setex).toHaveBeenCalledWith(
        `positions:${MOCK_USER_ID}`,
        30,
        expect.any(String),
      )
    })
  })
})
