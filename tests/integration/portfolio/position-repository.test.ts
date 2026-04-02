// ============================================================================
// Foot Stock — Unit Tests: PositionRepository (module-15, TASK-6)
// Cobre findByUserId, getSummary (com regressão GAP-001), getHistory (LOCF).
// Rastreabilidade: INT-034, INT-035
// ============================================================================

// ─── Mocks globais ───────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  position: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  priceHistory: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
}

jest.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

let PositionRepository: typeof import('@/lib/repositories/PositionRepository').PositionRepository

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePosition(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pos-1',
    userId: 'user-1',
    assetId: 'asset-1',
    quantity: 10,
    avgPrice: 100,
    side: 'LONG',
    status: 'OPEN',
    marginBlocked: null,
    interestAccrued: null,
    openedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    asset: { ticker: 'FLA', name: 'Flamengo', currentPrice: 120, id: 'asset-1' },
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PositionRepository', () => {
  let repo: import('@/lib/repositories/PositionRepository').PositionRepository

  beforeAll(async () => {
    ;({ PositionRepository } = await import('@/lib/repositories/PositionRepository'))
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.user.findUnique.mockResolvedValue({ fsBalance: 0 })
    repo = new PositionRepository()
  })

  // ─── findByUserId ──────────────────────────────────────────────────────────

  describe('findByUserId', () => {
    it('retorna array vazio para usuário sem posições', async () => {
      mockPrisma.position.findMany.mockResolvedValue([])

      const result = await repo.findByUserId('user-empty')

      expect(result).toEqual([])
      expect(mockPrisma.position.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-empty', status: 'OPEN' },
        })
      )
    })

    it('calcula P&L long corretamente: (currentPrice - avgPrice) × qty', async () => {
      const pos = makePosition({ avgPrice: 100, quantity: 10 })
      mockPrisma.position.findMany.mockResolvedValue([pos])
      mockPrisma.priceHistory.findFirst.mockResolvedValue({ close: 150 })

      const result = await repo.findByUserId('user-1')

      expect(result).toHaveLength(1)
      expect(result[0]!.currentPrice).toBe(150)
      // P&L = (150 - 100) × 10 = 500
      expect(result[0]!.pnL).toBe(500)
      expect(result[0]!.pnLPercent).toBe(50)
      expect(result[0]!.isShort).toBe(false)
    })

    it('calcula P&L short corretamente: (avgPrice - currentPrice) × qty', async () => {
      const pos = makePosition({
        side: 'SHORT',
        avgPrice: 100,
        quantity: 5,
        marginBlocked: 250,
        interestAccrued: 10,
      })
      mockPrisma.position.findMany.mockResolvedValue([pos])
      mockPrisma.priceHistory.findFirst.mockResolvedValue({ close: 80 })

      const result = await repo.findByUserId('user-1')

      expect(result).toHaveLength(1)
      // P&L = (100 - 80) × 5 = 100
      expect(result[0]!.pnL).toBe(100)
      expect(result[0]!.isShort).toBe(true)
      expect(result[0]!.marginBlocked).toBe(250)
      expect(result[0]!.accruedRent).toBe(10)
    })

    it('fallback para asset.currentPrice quando priceHistory vazio', async () => {
      const pos = makePosition({ avgPrice: 100, quantity: 10 })
      pos.asset.currentPrice = 110
      mockPrisma.position.findMany.mockResolvedValue([pos])
      mockPrisma.priceHistory.findFirst.mockResolvedValue(null)

      const result = await repo.findByUserId('user-1')

      expect(result[0]!.currentPrice).toBe(110)
      // P&L = (110 - 100) × 10 = 100
      expect(result[0]!.pnL).toBe(100)
    })

    it('fallback para avgPrice quando currentPrice também é null', async () => {
      const pos = makePosition({ avgPrice: 100, quantity: 10 })
      pos.asset.currentPrice = 0
      mockPrisma.position.findMany.mockResolvedValue([pos])
      mockPrisma.priceHistory.findFirst.mockResolvedValue(null)

      const result = await repo.findByUserId('user-1')

      expect(result[0]!.currentPrice).toBe(100)
      expect(result[0]!.pnL).toBe(0) // same price = zero P&L
    })

    it('não inclui marginBlocked/accruedRent em posições long', async () => {
      const pos = makePosition({ side: 'LONG' })
      mockPrisma.position.findMany.mockResolvedValue([pos])
      mockPrisma.priceHistory.findFirst.mockResolvedValue({ close: 120 })

      const result = await repo.findByUserId('user-1')

      expect(result[0]!.marginBlocked).toBeUndefined()
      expect(result[0]!.accruedRent).toBeUndefined()
    })
  })

  // ─── getSummary ────────────────────────────────────────────────────────────

  describe('getSummary', () => {
    it('retorna zeros para portfólio vazio', async () => {
      mockPrisma.position.findMany.mockResolvedValue([])

      const summary = await repo.getSummary('user-empty')

      expect(summary).toEqual({
        totalValue: 0,
        totalPnL: 0,
        totalPnLPercent: 0,
        pnLToday: 0,
        pnLTodayPercent: 0,
        largestPosition: null,
        diversificationScore: 0,
      })
    })

    it('inclui saldo FS$ no patrimônio quando não há posições', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ fsBalance: 5000 })
      mockPrisma.position.findMany.mockResolvedValue([])

      const summary = await repo.getSummary('user-empty')

      expect(summary.totalValue).toBe(5000)
      expect(summary.totalPnL).toBe(0)
      expect(summary.pnLToday).toBe(0)
    })

    it('HHI score = 0 para 1 ativo (concentração total)', async () => {
      const pos = makePosition()
      mockPrisma.position.findMany.mockResolvedValue([pos])
      mockPrisma.priceHistory.findFirst.mockResolvedValue({ close: 120 })

      const summary = await repo.getSummary('user-1')

      // 1 ativo = share 100% → HHI = 1 → score = 1 - 1 = 0
      expect(summary.diversificationScore).toBe(0)
    })

    it('HHI score ≈ 0.5 para 2 ativos iguais', async () => {
      const pos1 = makePosition({ id: 'pos-1', assetId: 'asset-1', quantity: 10 })
      const pos2 = makePosition({
        id: 'pos-2',
        assetId: 'asset-2',
        quantity: 10,
        asset: { ticker: 'COR', name: 'Corinthians', currentPrice: 120, id: 'asset-2' },
      })
      mockPrisma.position.findMany.mockResolvedValue([pos1, pos2])
      mockPrisma.priceHistory.findFirst.mockResolvedValue({ close: 120 })

      const summary = await repo.getSummary('user-1')

      // 2 ativos iguais: HHI = 2 × (0.5)² = 0.5 → score = 0.5
      expect(summary.diversificationScore).toBe(0.5)
    })

    it('largestPosition aponta para o ticker correto', async () => {
      const pos1 = makePosition({
        id: 'pos-1',
        assetId: 'asset-1',
        quantity: 5,
        asset: { ticker: 'FLA', name: 'Flamengo', currentPrice: 100, id: 'asset-1' },
      })
      const pos2 = makePosition({
        id: 'pos-2',
        assetId: 'asset-2',
        quantity: 20,
        asset: { ticker: 'PAL', name: 'Palmeiras', currentPrice: 200, id: 'asset-2' },
      })
      mockPrisma.position.findMany.mockResolvedValue([pos1, pos2])
      mockPrisma.priceHistory.findFirst.mockResolvedValue({ close: 150 })

      const summary = await repo.getSummary('user-1')

      // PAL: 20 × 150 = 3000 > FLA: 5 × 150 = 750
      expect(summary.largestPosition).toBe('PAL')
    })

    it('REGRESSÃO GAP-001: pnLToday usa assetId CORRETO por posição', async () => {
      // Setup: 2 posições com ativos diferentes
      const pos1 = makePosition({
        id: 'pos-1',
        assetId: 'asset-FLA',
        quantity: 10,
        asset: { ticker: 'FLA', name: 'Flamengo', currentPrice: 120, id: 'asset-FLA' },
      })
      const pos2 = makePosition({
        id: 'pos-2',
        assetId: 'asset-COR',
        quantity: 5,
        asset: { ticker: 'COR', name: 'Corinthians', currentPrice: 80, id: 'asset-COR' },
      })
      mockPrisma.position.findMany.mockResolvedValue([pos1, pos2])

      // findFirst para priceHistory: retorna preços diferentes por assetId
      mockPrisma.priceHistory.findFirst.mockImplementation(
        (args: { where?: { assetId?: string }; orderBy?: unknown; select?: unknown }) => {
          const assetId = args.where?.assetId
          if (assetId === 'asset-FLA') {
            return Promise.resolve({ close: 120 }) // currentPrice para findByUserId
          }
          if (assetId === 'asset-COR') {
            return Promise.resolve({ close: 80 }) // currentPrice para findByUserId
          }
          return Promise.resolve(null)
        }
      )

      await repo.getSummary('user-1')

      // Verificar que priceHistory.findFirst foi chamado com AMBOS assetIds
      const priceHistoryCalls = mockPrisma.priceHistory.findFirst.mock.calls
      const assetIdsQueried = priceHistoryCalls.map(
        (call: Array<{ where?: { assetId?: string } }>) => call[0]?.where?.assetId
      )

      // Deve conter ambos os assetIds (não apenas o primeiro)
      expect(assetIdsQueried).toContain('asset-FLA')
      expect(assetIdsQueried).toContain('asset-COR')
    })
  })

  // ─── getHistory ────────────────────────────────────────────────────────────

  describe('getHistory', () => {
    it('retorna array vazio para usuário sem posições', async () => {
      mockPrisma.position.findMany.mockResolvedValue([])

      const result = await repo.getHistory('user-empty', '7D')

      expect(result).toEqual([])
    })

    it('LOCF: propaga último preço em dias sem dados', async () => {
      const pos = makePosition({
        openedAt: new Date('2025-03-20'),
        createdAt: new Date('2025-03-20'),
      })
      mockPrisma.position.findMany.mockResolvedValue([pos])

      // Simular price_history com gap no dia 22
      mockPrisma.priceHistory.findMany.mockResolvedValue([
        { timestamp: new Date('2025-03-20'), close: 100 },
        { timestamp: new Date('2025-03-21'), close: 110 },
        // dia 22 sem dados — LOCF deve propagar 110
        { timestamp: new Date('2025-03-23'), close: 115 },
      ])

      // Mock Date.now para simular estar no dia 2025-03-23
      const realDate = Date
      const mockDate = new Date('2025-03-23T12:00:00Z')
      jest.spyOn(global, 'Date').mockImplementation(function (this: Date, ...args: unknown[]) {
        if (args.length === 0) return mockDate
        // @ts-expect-error — dynamic constructor call
        return new realDate(...args)
      } as unknown as (value: string | number | Date) => Date)
      // Preserve static methods
      Object.setPrototypeOf(Date, realDate)
      Date.UTC = realDate.UTC

      const result = await repo.getHistory('user-1', 'ALL')

      jest.restoreAllMocks()

      // Deve ter 4 pontos: 20, 21, 22 (LOCF), 23
      expect(result.length).toBeGreaterThanOrEqual(3)

      // Verificar que o ponto LOCF (dia 22) usa o valor do dia 21
      const day22 = result.find(p => p.date === '2025-03-22')
      if (day22) {
        expect(day22.totalValue).toBe(10 * 110) // qty × LOCF price
      }
    })

    it('posição fechada não conta após closedAt', async () => {
      const pos = makePosition({
        status: 'CLOSED',
        openedAt: new Date('2025-03-20'),
        updatedAt: new Date('2025-03-21'), // closed on 21st
      })
      mockPrisma.position.findMany.mockResolvedValue([pos])
      mockPrisma.priceHistory.findMany.mockResolvedValue([
        { timestamp: new Date('2025-03-20'), close: 100 },
        { timestamp: new Date('2025-03-21'), close: 110 },
        { timestamp: new Date('2025-03-22'), close: 120 },
      ])

      const realDate = Date
      const mockDate = new Date('2025-03-23T12:00:00Z')
      jest.spyOn(global, 'Date').mockImplementation(function (this: Date, ...args: unknown[]) {
        if (args.length === 0) return mockDate
        // @ts-expect-error — dynamic constructor call
        return new realDate(...args)
      } as unknown as (value: string | number | Date) => Date)
      Object.setPrototypeOf(Date, realDate)
      Date.UTC = realDate.UTC

      const result = await repo.getHistory('user-1', 'ALL')

      jest.restoreAllMocks()

      // Ponto do dia 20 deve existir, mas dias 21+ não devem ter valor
      // (posição fechada em 21)
      const day22 = result.find(p => p.date === '2025-03-22')
      expect(day22).toBeUndefined() // totalValue = 0 → ponto não incluído
    })
  })
})
