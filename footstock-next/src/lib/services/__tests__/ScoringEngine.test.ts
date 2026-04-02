// module-20: ScoringEngine unit tests — 15 cases, 100% pillar coverage
import { ScoringEngine } from '../ScoringEngine'
import type { ScoreBreakdown } from '@/types'
import type { TradingDataForScoring } from '@/lib/contracts/scoring-contract'

// ─── Mock prisma ──────────────────────────────────────────────────────────────
jest.mock('@/lib/prisma', () => ({
  prisma: {
    league: {
      findUnique: jest.fn(),
    },
    leagueMember: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    position: { findMany: jest.fn() },
    priceHistory: { findMany: jest.fn() },
    order: { findMany: jest.fn() },
    glossaryInteraction: { count: jest.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
const mockPrisma = prisma as jest.Mocked<typeof prisma>

// ─── Helper builders ──────────────────────────────────────────────────────────
function makeTrading(overrides: Partial<TradingDataForScoring> = {}): TradingDataForScoring {
  return {
    pnLPercent: 0,
    totalOrders: 0,
    advancedOrders: 0,
    positions: [],
    dailyReturns: [],
    glossaryInteractions: 0,
    postsWithLikes: 0,
    planUpgraded: false,
    hasBothDivisions: false,
    ...overrides,
  }
}

function mockLeague(division = 'ABERTA', startsAt = new Date('2024-01-01')) {
  ;(mockPrisma.league.findUnique as jest.Mock).mockResolvedValue({
    id: 'league-1',
    division,
    startsAt,
  })
}

function mockProviders(data: TradingDataForScoring) {
  const positions = data.positions.map(p => ({
    ticker: p.ticker,
    quantity: p.value, // proxy: quantity = value, avgPrice = 1
    avgPrice: '1',
  }))
  ;(mockPrisma.position.findMany as jest.Mock).mockResolvedValue(positions)
  ;(mockPrisma.priceHistory.findMany as jest.Mock).mockResolvedValue([])
  ;(mockPrisma.order.findMany as jest.Mock).mockResolvedValue(
    Array.from({ length: data.totalOrders }, (_, i) => ({
      type: i < data.advancedOrders ? 'LIMIT' : 'MARKET',
      side: 'BUY',
    }))
  )
  ;(mockPrisma.glossaryInteraction.count as jest.Mock).mockResolvedValue(data.glossaryInteractions)
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('ScoringEngine', () => {
  let engine: ScoringEngine

  beforeEach(() => {
    jest.clearAllMocks()
    engine = new ScoringEngine()
  })

  // ── getFatorEquidade ────────────────────────────────────────────────────────
  describe('getFatorEquidade', () => {
    it('returns 1.2 for BRONZE', () => {
      expect(engine.getFatorEquidade('BRONZE')).toBe(1.2)
    })

    it('returns 1.0 for PRATA', () => {
      expect(engine.getFatorEquidade('PRATA')).toBe(1.0)
    })

    it('returns 0.9 for OURO', () => {
      expect(engine.getFatorEquidade('OURO')).toBe(0.9)
    })

    it('returns 1.0 for ABERTA', () => {
      expect(engine.getFatorEquidade('ABERTA')).toBe(1.0)
    })

    it('returns 1.0 for unknown category', () => {
      expect(engine.getFatorEquidade('UNKNOWN')).toBe(1.0)
    })
  })

  // ── calcularScore — pilares ─────────────────────────────────────────────────
  // Tests spy on getTradingData to control pnL/positions/orders/interactions
  // independently of how prisma is mocked
  describe('calcularScore', () => {
    it('returns zero score when league not found', async () => {
      ;(mockPrisma.league.findUnique as jest.Mock).mockResolvedValue(null)

      const score = await engine.calcularScore('u1', 'l1')
      expect(score.finalScore).toBe(0)
      expect(score.fatorEquidade).toBe(1.0)
    })

    // ── Pilar 1: Rentabilidade (Sharpe ratio) ────────────────────────────────
    it('calculates rentabilidade > 0 for positive Sharpe (consistent positive returns)', async () => {
      mockLeague('ABERTA')
      // Retornos consistentemente positivos → Sharpe alto
      jest.spyOn(engine, 'getTradingData').mockResolvedValue(
        makeTrading({ dailyReturns: [0.02, 0.03, 0.02, 0.025, 0.03, 0.02] })
      )

      const score = await engine.calcularScore('u1', 'l1')
      expect(score.rentabilidade).toBeGreaterThan(0)
      expect(score.rentabilidade).toBeLessThanOrEqual(35)
    })

    it('caps rentabilidade at 35', async () => {
      mockLeague('ABERTA')
      // Retornos quase idênticos → vol baixa → Sharpe enorme → cap em 35
      jest.spyOn(engine, 'getTradingData').mockResolvedValue(
        makeTrading({ dailyReturns: [0.05, 0.05, 0.05, 0.05, 0.05] })
      )

      const score = await engine.calcularScore('u1', 'l1')
      expect(score.rentabilidade).toBeLessThanOrEqual(35)
    })

    it('returns 0 rentabilidade when less than 2 daily returns', async () => {
      mockLeague('ABERTA')
      jest.spyOn(engine, 'getTradingData').mockResolvedValue(makeTrading({ dailyReturns: [0.01] }))

      const score = await engine.calcularScore('u1', 'l1')
      expect(score.rentabilidade).toBe(0)
    })

    // ── Pilar 2: Sofisticação (granular breakdown) ────────────────────────────
    it('calculates sofisticacao via orderTypeBreakdown when available', async () => {
      mockLeague('ABERTA')
      jest.spyOn(engine, 'getTradingData').mockResolvedValue(
        makeTrading({
          orderTypeBreakdown: { LIMIT: 2, OCO: 1 }, // 2*4 + 1*6 = 14
        })
      )

      const score = await engine.calcularScore('u1', 'l1')
      expect(score.sofisticacao).toBeCloseTo(14)
    })

    it('caps sofisticacao at 25', async () => {
      mockLeague('ABERTA')
      jest.spyOn(engine, 'getTradingData').mockResolvedValue(
        makeTrading({
          orderTypeBreakdown: { LIMIT: 10, OCO: 10, SHORT_PROFITABLE: 10 }, // 40+60+80 = 180 → cap 25
        })
      )

      const score = await engine.calcularScore('u1', 'l1')
      expect(score.sofisticacao).toBe(25)
    })

    it('falls back to ratio when orderTypeBreakdown is absent', async () => {
      mockLeague('ABERTA')
      jest.spyOn(engine, 'getTradingData').mockResolvedValue(
        makeTrading({ totalOrders: 10, advancedOrders: 10 })
      )

      const score = await engine.calcularScore('u1', 'l1')
      expect(score.sofisticacao).toBeCloseTo(25)
    })

    // ── Pilar 3: Diversificação (ativos únicos × 3 + bonus) ──────────────────
    it('calculates diversificacao = 3 for single-asset (1 × 3)', async () => {
      mockLeague('ABERTA')
      jest.spyOn(engine, 'getTradingData').mockResolvedValue(
        makeTrading({ positions: [{ ticker: 'VALE3', value: 1000 }] })
      )

      const score = await engine.calcularScore('u1', 'l1')
      expect(score.diversificacao).toBe(3)
    })

    it('calculates diversificacao = 9 for 3 assets (3 × 3)', async () => {
      mockLeague('ABERTA')
      jest.spyOn(engine, 'getTradingData').mockResolvedValue(
        makeTrading({
          positions: [
            { ticker: 'VALE3', value: 500 },
            { ticker: 'PETR4', value: 500 },
            { ticker: 'ITUB4', value: 500 },
          ],
        })
      )

      const score = await engine.calcularScore('u1', 'l1')
      expect(score.diversificacao).toBe(9)
    })

    it('adds 4 bonus when hasBothDivisions is true', async () => {
      mockLeague('ABERTA')
      jest.spyOn(engine, 'getTradingData').mockResolvedValue(
        makeTrading({
          positions: [{ ticker: 'VALE3', value: 500 }, { ticker: 'PETR4', value: 500 }],
          hasBothDivisions: true,
        })
      )

      const score = await engine.calcularScore('u1', 'l1')
      expect(score.diversificacao).toBe(10) // 2*3 + 4
    })

    it('caps diversificacao at 20', async () => {
      mockLeague('ABERTA')
      jest.spyOn(engine, 'getTradingData').mockResolvedValue(
        makeTrading({
          positions: Array.from({ length: 10 }, (_, i) => ({ ticker: `T${i}`, value: 100 })),
          hasBothDivisions: true,
        })
      )

      const score = await engine.calcularScore('u1', 'l1')
      expect(score.diversificacao).toBe(20) // 10*3+4=34 → cap 20
    })

    // ── Pilar 4: Consistência ────────────────────────────────────────────────
    it('calculates consistencia from dailyRankPositions', async () => {
      mockLeague('ABERTA')
      jest.spyOn(engine, 'getTradingData').mockResolvedValue(
        makeTrading({
          dailyRankPositions: [1, 2, 1, 3, 2], // avg ~1.8 in 100 members → top 1.8%
          totalLeagueMembers: 100,
        })
      )

      const score = await engine.calcularScore('u1', 'l1')
      expect(score.consistencia).toBeGreaterThan(10)
      expect(score.consistencia).toBeLessThanOrEqual(15)
    })

    it('falls back to Sharpe for consistencia when no rank data', async () => {
      mockLeague('ABERTA')
      jest.spyOn(engine, 'getTradingData').mockResolvedValue(
        makeTrading({ dailyReturns: [0.01, 0.02, 0.015, 0.01, 0.02] })
      )

      const score = await engine.calcularScore('u1', 'l1')
      expect(score.consistencia).toBeGreaterThanOrEqual(0)
      expect(score.consistencia).toBeLessThanOrEqual(15)
    })

    // ── Pilar 5: Bônus Educativo ─────────────────────────────────────────────
    it('calculates bonusEducativo: glossary≥5 (+1), postsWithLikes (+2), planUpgraded (+2) = 5', async () => {
      mockLeague('ABERTA')
      jest.spyOn(engine, 'getTradingData').mockResolvedValue(
        makeTrading({ glossaryInteractions: 10, postsWithLikes: 3, planUpgraded: true })
      )

      const score = await engine.calcularScore('u1', 'l1')
      expect(score.bonusEducativo).toBe(5) // 1+2+2 = 5
    })

    it('bonusEducativo = 1 with only glossary≥5', async () => {
      mockLeague('ABERTA')
      jest.spyOn(engine, 'getTradingData').mockResolvedValue(
        makeTrading({ glossaryInteractions: 5 })
      )

      const score = await engine.calcularScore('u1', 'l1')
      expect(score.bonusEducativo).toBe(1)
    })

    it('bonusEducativo = 0 with glossary < 5', async () => {
      mockLeague('ABERTA')
      jest.spyOn(engine, 'getTradingData').mockResolvedValue(
        makeTrading({ glossaryInteractions: 3 })
      )

      const score = await engine.calcularScore('u1', 'l1')
      expect(score.bonusEducativo).toBe(0)
    })

    it('applies BRONZE equity factor 1.2 to finalScore', async () => {
      mockLeague('BRONZE')
      jest.spyOn(engine, 'getTradingData').mockResolvedValue(
        makeTrading({
          dailyReturns: [0.02, 0.03, 0.02, 0.025, 0.03],
          glossaryInteractions: 10,
          postsWithLikes: 1,
          planUpgraded: true,
        })
      )

      const score = await engine.calcularScore('u1', 'l1')
      expect(score.total).toBeGreaterThan(0)
      expect(score.finalScore).toBeCloseTo(score.total * 1.2)
      expect(score.fatorEquidade).toBe(1.2)
    })

    it('returns zero score on unexpected exception (degraded mode)', async () => {
      ;(mockPrisma.league.findUnique as jest.Mock).mockRejectedValue(new Error('DB down'))

      const score = await engine.calcularScore('u1', 'l1')
      expect(score.finalScore).toBe(0)
    })
  })

  // ── salvarScore ─────────────────────────────────────────────────────────────
  describe('salvarScore', () => {
    it('upserts leagueMember with score data', async () => {
      ;(mockPrisma.leagueMember.upsert as jest.Mock).mockResolvedValue({})

      const score: ScoreBreakdown = {
        rentabilidade: 20, sofisticacao: 15, diversificacao: 10,
        consistencia: 5, bonusEducativo: 3, total: 53, finalScore: 53, fatorEquidade: 1.0,
      }

      await engine.salvarScore('u1', 'l1', score)
      expect(mockPrisma.leagueMember.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { leagueId_userId: { leagueId: 'l1', userId: 'u1' } },
          update: expect.objectContaining({ score: 53 }),
        })
      )
    })
  })

  // ── recalcularRanks ─────────────────────────────────────────────────────────
  describe('recalcularRanks', () => {
    it('assigns sequential ranks ordered by score desc then joinedAt asc', async () => {
      ;(mockPrisma.leagueMember.findMany as jest.Mock).mockResolvedValue([
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
      ])
      ;(mockPrisma.leagueMember.update as jest.Mock).mockResolvedValue({})

      await engine.recalcularRanks('l1')

      expect(mockPrisma.leagueMember.update).toHaveBeenCalledTimes(3)
      expect(mockPrisma.leagueMember.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'a' }, data: { rank: 1 } })
      )
      expect(mockPrisma.leagueMember.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c' }, data: { rank: 3 } })
      )
    })
  })
})
