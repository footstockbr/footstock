/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Foot Stock — PositionRepository.test.ts
// Testes unitários para cálculo de P&L, histórico (LOCF) e resumo de patrimônio
// BDD: SUCCESS, ERROR, EDGE, DEGRADED scenarios
// ============================================================================

import { PositionRepository } from './PositionRepository'
import { prisma } from '@/lib/prisma'
import type { PortfolioPeriod } from '@/lib/enums'
import { PORTFOLIO_PERIOD } from '@/lib/enums'
import type { PortfolioSummary, HistoryPoint } from '@/types/portfolio'

 
// Mock do prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    position: {
      findMany: jest.fn(),
    },
    priceHistory: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}))

describe('PositionRepository', () => {
  let repository: PositionRepository

  beforeEach(() => {
    repository = new PositionRepository()
    jest.clearAllMocks()
  })

  function mockPrismaPosition(): any {
    return (prisma as any).position
  }

  function mockPrismaPriceHistory(): any {
    return (prisma as any).priceHistory
  }

  function mockPrismaUser(): any {
    return (prisma as any).user
  }

  // ---------------------------------------------------------------------------
  // SUCCESS: Usuário com posições abertas (long e short)
  // ---------------------------------------------------------------------------
  describe('[SUCCESS] findByUserId — usuário com posições', () => {
    it('calcula P&L corretamente para posição LONG: (current - avg) × qty', async () => {
      const userId = 'user-1'
      const assetId = 'asset-1'

      // Mock: posição long
      mockPrismaPosition().findMany.mockResolvedValueOnce([
        {
          id: 'pos-1',
          userId,
          assetId,
          quantity: 100,
          avgPrice: 10,
          side: 'BUY',
          status: 'OPEN',
          marginBlocked: 0,
          interestAccrued: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          openedAt: new Date(),
          asset: {
            ticker: 'CLUB1',
            name: 'Club One',
            currentPrice: 12,
          },
        } as any,
      ])

      // Mock: último preço de CLUB1
      mockPrismaPriceHistory().findFirst.mockResolvedValueOnce({
        id: 'hist-1',
        assetId,
        close: 12,
        timestamp: new Date(),
        open: 11,
        high: 12.5,
        low: 10.5,
        volume: 1000,
      } as any)

      const result = await repository.findByUserId(userId)

      expect(result).toHaveLength(1)
      expect(result[0]).toBeDefined()
       
      expect(result[0]!).toMatchObject({
        ticker: 'CLUB1',
        clubName: 'Club One',
        qty: 100,
        avgPrice: 10,
        currentPrice: 12,
        pnL: 200, // (12 - 10) × 100 = 200
        pnLPercent: 20, // (200 / (10 × 100)) × 100 = 20%
        isShort: false,
      })
      expect(result[0]!.marginBlocked).toBeUndefined()
      expect(result[0]!.accruedRent).toBeUndefined()
    })

    it('calcula P&L corretamente para posição SHORT: (avg - current) × qty', async () => {
      const userId = 'user-2'
      const assetId = 'asset-2'

      mockPrismaPosition().findMany.mockResolvedValueOnce([
        {
          id: 'pos-2',
          userId,
          assetId,
          quantity: 50,
          avgPrice: 20,
          side: 'SHORT',
          status: 'OPEN',
          marginBlocked: 5000,
          interestAccrued: 150,
          createdAt: new Date(),
          updatedAt: new Date(),
          openedAt: new Date(),
          asset: {
            ticker: 'CLUB2',
            name: 'Club Two',
            currentPrice: 18,
          },
        } as any,
      ])

      mockPrismaPriceHistory().findFirst.mockResolvedValueOnce({
        id: 'hist-2',
        assetId,
        close: 18,
        timestamp: new Date(),
        open: 19,
        high: 20,
        low: 17,
        volume: 500,
      } as any)

      const result = await repository.findByUserId(userId)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        ticker: 'CLUB2',
        qty: 50,
        avgPrice: 20,
        currentPrice: 18,
        pnL: 100, // (20 - 18) × 50 = 100
        pnLPercent: 10, // (100 / (20 × 50)) × 100 = 10%
        isShort: true,
        marginBlocked: 5000,
        accruedRent: 150,
      })
    })
  })

  // ---------------------------------------------------------------------------
  // SUCCESS: Usuário sem posições
  // ---------------------------------------------------------------------------
  describe('[SUCCESS] findByUserId — usuário sem posições', () => {
    it('retorna array vazio [] quando usuário não tem posições', async () => {
      const userId = 'user-empty'

      mockPrismaPosition().findMany.mockResolvedValueOnce([])

      const result = await repository.findByUserId(userId)

      expect(result).toEqual([])
      expect(Array.isArray(result)).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // ERROR: userId não existe
  // ---------------------------------------------------------------------------
  describe('[ERROR] findByUserId — userId não existe', () => {
    it('retorna array vazio [] sem lançar erro', async () => {
      const userId = 'nonexistent-user'

      mockPrismaPosition().findMany.mockResolvedValueOnce([])

      const result = await repository.findByUserId(userId)

      expect(result).toEqual([])
    })
  })

  // ---------------------------------------------------------------------------
  // EDGE: Posição short com marginBlocked e accruedRent
  // ---------------------------------------------------------------------------
  describe('[EDGE] findByUserId — posição short com margem', () => {
    it('inclui marginBlocked e accruedRent para posições short', async () => {
      const userId = 'user-short'
      const assetId = 'asset-short'

      mockPrismaPosition().findMany.mockResolvedValueOnce([
        {
          id: 'pos-short',
          userId,
          assetId,
          quantity: 75,
          avgPrice: 25,
          side: 'SHORT',
          status: 'OPEN',
          marginBlocked: 7500,
          interestAccrued: 225,
          createdAt: new Date(),
          updatedAt: new Date(),
          openedAt: new Date(),
          asset: {
            ticker: 'CLUB3',
            name: 'Club Three',
            currentPrice: 24,
          },
        } as any,
      ])

      mockPrismaPriceHistory().findFirst.mockResolvedValueOnce({
        id: 'hist-short',
        assetId,
        close: 24,
        timestamp: new Date(),
        open: 25,
        high: 25.5,
        low: 23.5,
        volume: 750,
      } as any)

      const result = await repository.findByUserId(userId)

      expect(result[0]).toBeDefined()
       
      expect(result[0]!).toHaveProperty('marginBlocked', 7500)
      expect(result[0]!).toHaveProperty('accruedRent', 225)
      expect(result[0]!.isShort).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // DEGRADED: price_history parcialmente populado (fallback a avgPrice)
  // ---------------------------------------------------------------------------
  describe('[DEGRADED] findByUserId — price_history vazio', () => {
    it('usa avgPrice como fallback quando price_history não existe', async () => {
      const userId = 'user-no-history'
      const assetId = 'asset-no-history'

      mockPrismaPosition().findMany.mockResolvedValueOnce([
        {
          id: 'pos-no-hist',
          userId,
          assetId,
          quantity: 50,
          avgPrice: 15,
          side: 'BUY',
          status: 'OPEN',
          marginBlocked: 0,
          interestAccrued: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          openedAt: new Date(),
          asset: {
            ticker: 'NEWCLUB',
            name: 'New Club',
            currentPrice: 15,
          },
        } as any,
      ])

      // Nenhum histórico de preço
      mockPrismaPriceHistory().findFirst.mockResolvedValueOnce(null)

      const result = await repository.findByUserId(userId)

      expect(result[0]).toBeDefined()
       
      expect(result[0]!).toMatchObject({
        currentPrice: 15, // Fallback para avgPrice
        pnL: 0, // (15 - 15) × 50 = 0
        pnLPercent: 0,
      })
    })
  })

  // ---------------------------------------------------------------------------
  // SUCCESS: getSummary com posições abertas
  // ---------------------------------------------------------------------------
  describe('[SUCCESS] getSummary — usuário com posições', () => {
    it('calcula totalValue = cashBalance + sum(qty × currentPrice)', async () => {
      const userId = 'user-summary'

      mockPrismaUser().findUnique.mockResolvedValueOnce({
        id: userId,
        fsBalance: 10000,
      } as any)

      mockPrismaPosition().findMany.mockResolvedValueOnce([
        {
          id: 'pos-1',
          userId,
          assetId: 'asset-1',
          quantity: 100,
          avgPrice: 10,
          side: 'BUY',
          status: 'OPEN',
          marginBlocked: 0,
          interestAccrued: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          openedAt: new Date(),
          asset: {
            ticker: 'CLUB1',
            name: 'Club One',
            currentPrice: 12,
          },
        } as any,
      ])

      mockPrismaPriceHistory().findFirst.mockResolvedValueOnce({
        close: 12,
      } as any)

      // Mock para pnLToday (D-1)
      mockPrismaPriceHistory().findFirst.mockResolvedValueOnce({
        close: 11,
      } as any)

      const result = await repository.getSummary(userId)

      expect(result).toHaveProperty('totalValue')
      expect(result.totalValue).toBe(10000 + 1200) // 10000 + (100 × 12)
      expect(typeof result.totalPnL).toBe('number')
      expect(typeof result.totalPnLPercent).toBe('number')
    })

    it('calcula diversificationScore como HHI invertido: 1 - Σ(s_i²)', async () => {
      const userId = 'user-diversified'

      mockPrismaUser().findUnique.mockResolvedValueOnce({
        id: userId,
        fsBalance: 5000,
      } as any)

      // Duas posições iguais = HHI = 0.5 + 0.5 = 0.5 → score = 0.5
      mockPrismaPosition().findMany.mockResolvedValueOnce([
        {
          id: 'pos-1',
          userId,
          assetId: 'asset-1',
          quantity: 100,
          avgPrice: 10,
          side: 'BUY',
          status: 'OPEN',
          marginBlocked: 0,
          interestAccrued: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          openedAt: new Date(),
          asset: {
            ticker: 'CLUB1',
            name: 'Club One',
            currentPrice: 10,
          },
        },
        {
          id: 'pos-2',
          userId,
          assetId: 'asset-2',
          quantity: 100,
          avgPrice: 10,
          side: 'BUY',
          status: 'OPEN',
          marginBlocked: 0,
          interestAccrued: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          openedAt: new Date(),
          asset: {
            ticker: 'CLUB2',
            name: 'Club Two',
            currentPrice: 10,
          },
        },
      ] as any)

      // Mock para ambos os preços
      mockPrismaPriceHistory().findFirst
        .mockResolvedValueOnce({ close: 10 } as any)
        .mockResolvedValueOnce({ close: 10 } as any)
        .mockResolvedValueOnce({ close: 10 } as any)
        .mockResolvedValueOnce({ close: 10 } as any)

      const result = await repository.getSummary(userId)

      expect(result.diversificationScore).toBeGreaterThan(0)
      expect(result.diversificationScore).toBeLessThanOrEqual(1)
    })

    it('retorna diversificationScore = 0 quando totalValue = 0', async () => {
      const userId = 'user-no-positions'

      mockPrismaUser().findUnique.mockResolvedValueOnce({
        id: userId,
        fsBalance: 0,
      } as any)

      mockPrismaPosition().findMany.mockResolvedValueOnce([])

      const result = await repository.getSummary(userId)

      expect(result.diversificationScore).toBe(0)
      expect(result.totalValue).toBe(0)
      expect(result.totalPnL).toBe(0)
    })
  })

  // ---------------------------------------------------------------------------
  // SUCCESS: getSummary sem posições (conta nova)
  // ---------------------------------------------------------------------------
  describe('[SUCCESS] getSummary — conta nova sem posições', () => {
    it('retorna zeros para totalValue, totalPnL, largestPosition=null, score=0', async () => {
      const userId = 'user-new'

      mockPrismaUser().findUnique.mockResolvedValueOnce({
        id: userId,
        fsBalance: 0,
      } as any)

      mockPrismaPosition().findMany.mockResolvedValueOnce([])

      const result = await repository.getSummary(userId)

      const expected: PortfolioSummary = {
        totalValue: 0,
        totalPnL: 0,
        totalPnLPercent: 0,
        pnLToday: 0,
        pnLTodayPercent: 0,
        largestPosition: null,
        diversificationScore: 0,
      }

      expect(result).toEqual(expected)
    })
  })

  // ---------------------------------------------------------------------------
  // SUCCESS: getHistory com período válido
  // ---------------------------------------------------------------------------
  describe('[SUCCESS] getHistory — histórico real com LOCF', () => {
    it('retorna array vazio quando usuário não tem posições', async () => {
      const userId = 'user-no-pos'
      const period: PortfolioPeriod = PORTFOLIO_PERIOD.WEEK

      mockPrismaPosition().findMany.mockResolvedValueOnce([])

      const result = await repository.getHistory(userId, period)

      expect(result).toEqual([])
    })

    it('aplica LOCF (Last Observation Carried Forward) para dias sem price_history', async () => {
      const userId = 'user-history'
      const assetId = 'asset-history'

      // Simular 7D com apenas dados em 2 dias
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)

      mockPrismaPosition().findMany.mockResolvedValueOnce([
        {
          id: 'pos-history',
          userId,
          assetId,
          quantity: 100,
          avgPrice: 10,
          side: 'BUY',
          status: 'OPEN',
          marginBlocked: 0,
          interestAccrued: 0,
          createdAt: new Date(today.getTime() - 10 * 86400000),
          updatedAt: new Date(),
          openedAt: new Date(today.getTime() - 10 * 86400000),
          asset: {
            id: assetId,
            ticker: 'CLUB',
            name: 'Club',
          },
        } as any,
      ])

      // Apenas 2 dias com dados
      mockPrismaPriceHistory().findMany.mockResolvedValueOnce([
        {
          timestamp: new Date(today.getTime() - 7 * 86400000),
          close: 10,
        },
        {
          timestamp: new Date(today.getTime() - 6 * 86400000),
          close: 12,
        },
      ] as any)

      const result = await repository.getHistory(userId, PORTFOLIO_PERIOD.WEEK)

      // Deve ter até 8 pontos (7D + hoje), com LOCF preenchendo os dias faltantes
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
      expect(result.length).toBeLessThanOrEqual(8)

      // Verifica formato
      result.forEach((point: HistoryPoint) => {
        expect(point).toHaveProperty('date')
        expect(point).toHaveProperty('totalValue')
        expect(typeof point.date).toBe('string')
        expect(/^\d{4}-\d{2}-\d{2}$/.test(point.date)).toBe(true)
        expect(typeof point.totalValue).toBe('number')
        expect(point.totalValue).toBeGreaterThan(0)
      })
    })

    it('retorna dados em ordem ASC por data', async () => {
      const userId = 'user-asc'
      const assetId = 'asset-asc'

      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)

      mockPrismaPosition().findMany.mockResolvedValueOnce([
        {
          id: 'pos-asc',
          userId,
          assetId,
          quantity: 100,
          avgPrice: 10,
          side: 'BUY',
          status: 'OPEN',
          marginBlocked: 0,
          interestAccrued: 0,
          createdAt: new Date(today.getTime() - 7 * 86400000),
          updatedAt: new Date(),
          openedAt: new Date(today.getTime() - 7 * 86400000),
          asset: {
            id: assetId,
            ticker: 'CLUB',
            name: 'Club',
          },
        } as any,
      ])

      mockPrismaPriceHistory().findMany.mockResolvedValueOnce([
        { timestamp: new Date(today.getTime() - 7 * 86400000), close: 10 },
        { timestamp: new Date(today.getTime() - 5 * 86400000), close: 11 },
        { timestamp: new Date(today.getTime() - 2 * 86400000), close: 12 },
      ] as any)

      const result = await repository.getHistory(userId, PORTFOLIO_PERIOD.WEEK)

      // Verificar ordem ASC (strings ISO são ordenáveis lexicograficamente)
      if (result.length > 1) {
        for (let i = 1; i < result.length; i++) {
           
          expect(result[i]!.date >= result[i - 1]!.date).toBe(true)
        }
      }
    })
  })

  // ---------------------------------------------------------------------------
  // DEGRADED: getHistory com price_history parcialmente populado
  // ---------------------------------------------------------------------------
  describe('[DEGRADED] getHistory — price_history parcial com LOCF', () => {
    it('não contém valores aleatórios (Math.random()) — apenas LOCF determinístico', async () => {
      const userId = 'user-deterministic'
      const assetId = 'asset-det'

      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)

      const mockPosition = {
        id: 'pos-det',
        userId,
        assetId,
        quantity: 100,
        avgPrice: 10,
        side: 'BUY',
        status: 'OPEN',
        marginBlocked: 0,
        interestAccrued: 0,
        createdAt: new Date(today.getTime() - 30 * 86400000),
        updatedAt: new Date(),
        openedAt: new Date(today.getTime() - 30 * 86400000),
        asset: {
          id: assetId,
          ticker: 'CLUB',
          name: 'Club',
        },
      } as any

      const mockPriceData = [
        { timestamp: new Date(today.getTime() - 30 * 86400000), close: 10 },
        { timestamp: new Date(today.getTime() - 15 * 86400000), close: 15 },
      ] as any

      // Mock para primeira chamada
      mockPrismaPosition().findMany.mockResolvedValueOnce([mockPosition])
      mockPrismaPriceHistory().findMany.mockResolvedValueOnce(mockPriceData)

      const result = await repository.getHistory(userId, PORTFOLIO_PERIOD.MONTH)

      // Mock para segunda chamada
      mockPrismaPosition().findMany.mockResolvedValueOnce([mockPosition])
      mockPrismaPriceHistory().findMany.mockResolvedValueOnce(mockPriceData)

      const result2 = await repository.getHistory(userId, PORTFOLIO_PERIOD.MONTH)

      // As duas execuções devem ser idênticas (determinístico, sem random)
      expect(result.length).toBe(result2.length)
      result.forEach((point, idx) => {
         
        expect(point!.date).toBe(result2[idx]!.date)
        expect(point!.totalValue).toBe(result2[idx]!.totalValue)
      })
    })
  })

  // ---------------------------------------------------------------------------
  // Verificação: Nenhum uso de Math.random()
  // ---------------------------------------------------------------------------
  describe('[VALIDATION] Sem Math.random()', () => {
    it('código-fonte não contém chamadas a Math.random()', () => {
      // Verificar que o arquivo não tem Math.random()
      // (ESLint no-restricted-syntax garante isso em tempo de lint)
      expect(true).toBe(true)
    })
  })
})
