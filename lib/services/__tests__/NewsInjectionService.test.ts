// ============================================================================
// Foot Stock — Testes unitarios: NewsInjectionService
// Rastreabilidade: INT-049 / TASK-6 (module-17-rss-noticias)
// ============================================================================

import {
  NewsInjectionService,
  adminNewsInjectSchema,
  type AdminNewsInjectDTO,
} from '../NewsInjectionService'

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: { findUnique: jest.fn() },
    news: { create: jest.fn() },
    adminMarketAction: { create: jest.fn() },
  },
}))

jest.mock('@/lib/redis', () => ({
  redisPublisher: {
    publish: jest.fn().mockResolvedValue(0),
  },
  REDIS_CHANNELS: {
    MARKET_TICK: 'market:tick',
    MOTOR_CONTROL: 'motor:control',
    NEWS_INJECT: 'news:inject',
  },
}))

jest.mock('../../contracts/NewsInjectContract', () => ({
  sentimentToImpact: jest.fn((s: number) => {
    if (s > 0.1) return 'POSITIVE'
    if (s < -0.1) return 'NEGATIVE'
    return 'NEUTRAL'
  }),
  sentimentToDurationTicks: jest.fn((s: number) =>
    Math.max(1, Math.min(10, Math.round(Math.abs(s) * 5))),
  ),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = require('@/lib/prisma')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { redisPublisher: mockRedis } = require('@/lib/redis')

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeValidDTO(overrides: Partial<AdminNewsInjectDTO> = {}): AdminNewsInjectDTO {
  const raw = {
    title: 'Flamengo vence classico',
    content: 'Noticia completa sobre a partida decisiva.',
    ticker: 'FLA1',
    impactCategory: 'ESPORTIVA_MAJORITARIA' as const,
    sentiment: 0.6,
    source: 'Admin',
    ...overrides,
  }
  return adminNewsInjectSchema.parse(raw)
}

function makeAsset(overrides = {}) {
  return {
    id: 'asset-fla',
    ticker: 'FLA1',
    currentPrice: { toNumber: () => 50 },
    isActive: true,
    ...overrides,
  }
}

const ADMIN_ID = 'admin-user-1'

// ─── Testes ─────────────────────────────────────────────────────────────────

describe('NewsInjectionService', () => {
  let service: NewsInjectionService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new NewsInjectionService()

    // defaults
    mockPrisma.asset.findUnique.mockResolvedValue(makeAsset())
    mockPrisma.news.create.mockResolvedValue({ id: 'news-1' })
    mockPrisma.adminMarketAction.create.mockResolvedValue({ id: 'audit-1' })
  })

  // ─── SUCCESS ────────────────────────────────────────────────────────────

  describe('SUCCESS — inject com payload valido', () => {
    it('ST001-1: cria noticia, publica Redis e registra auditoria', async () => {
      const dto = makeValidDTO()
      const result = await service.inject(dto, ADMIN_ID)

      expect(result).toEqual({ newsId: 'news-1' })
      expect(mockPrisma.asset.findUnique).toHaveBeenCalledWith({
        where: { ticker: 'FLA1' },
      })
      expect(mockPrisma.news.create).toHaveBeenCalledTimes(1)
      expect(mockRedis.publish).toHaveBeenCalledTimes(1)
      expect(mockPrisma.adminMarketAction.create).toHaveBeenCalledTimes(1)
    })

    it('ST001-2: audit record contem campos corretos (adminId, action, ticker)', async () => {
      const dto = makeValidDTO({ sentiment: -0.7 })
      await service.inject(dto, ADMIN_ID)

      const auditCall = mockPrisma.adminMarketAction.create.mock.calls[0][0]
      expect(auditCall.data.adminId).toBe(ADMIN_ID)
      expect(auditCall.data.action).toBe('NEWS_INJECT')
      expect(auditCall.data.assetId).toBe('asset-fla')
      expect(auditCall.data.reason).toContain('-0.7')
    })

    it('ST001-7: Redis publish chamado com canal e payload corretos', async () => {
      const dto = makeValidDTO({ sentiment: 0.8 })
      await service.inject(dto, ADMIN_ID)

      expect(mockRedis.publish).toHaveBeenCalledWith(
        'news:inject',
        expect.any(String),
      )

      const publishedPayload = JSON.parse(mockRedis.publish.mock.calls[0][1])
      expect(publishedPayload).toMatchObject({
        type: 'NEWS',
        assetId: 'FLA1',
        magnitude: 0.8,
      })
      // impact derives from sentimentToImpact mock (sentiment > 0.1 → 'POSITIVE')
      expect(typeof publishedPayload.impact).toBe('string')
      expect(publishedPayload.durationTicks).toBeGreaterThanOrEqual(1)
    })

    it('ST001-8: noticia criada com source="Admin"', async () => {
      const dto = makeValidDTO()
      await service.inject(dto, ADMIN_ID)

      const newsCreateCall = mockPrisma.news.create.mock.calls[0][0]
      expect(newsCreateCall.data.source).toBe('Admin')
      expect(newsCreateCall.data.isPublished).toBe(true)
      expect(newsCreateCall.data.title).toBe('Flamengo vence classico')
      expect(newsCreateCall.data.assetIds).toEqual(['asset-fla'])
    })

    it('ST001-8b: source default "Admin" quando nao informado', async () => {
      const raw = {
        title: 'Teste sem source',
        content: 'Conteudo de teste.',
        ticker: 'FLA1',
        impactCategory: 'INSTITUCIONAL' as const,
        sentiment: 0,
      }
      const dto = adminNewsInjectSchema.parse(raw)
      await service.inject(dto, ADMIN_ID)

      const newsCreateCall = mockPrisma.news.create.mock.calls[0][0]
      expect(newsCreateCall.data.source).toBe('Admin')
    })
  })

  // ─── ERROR ──────────────────────────────────────────────────────────────

  describe('ERROR — validacao de schema', () => {
    it('ST001-3: ticker >4 chars rejeita com ZodError', () => {
      expect(() =>
        adminNewsInjectSchema.parse({
          title: 'X',
          content: 'Y',
          ticker: 'ABCDE',
          impactCategory: 'ESPORTIVA_MAJORITARIA',
          sentiment: 0.5,
        }),
      ).toThrow()
    })

    it('ST001-3b: ticker vazio rejeita com ZodError', () => {
      expect(() =>
        adminNewsInjectSchema.parse({
          title: 'X',
          content: 'Y',
          ticker: '',
          impactCategory: 'ESPORTIVA_MAJORITARIA',
          sentiment: 0.5,
        }),
      ).toThrow()
    })

    it('ST001-4: sentiment >1 rejeita com ZodError', () => {
      expect(() =>
        adminNewsInjectSchema.parse({
          title: 'X',
          content: 'Y',
          ticker: 'FLA1',
          impactCategory: 'ESPORTIVA_MAJORITARIA',
          sentiment: 1.5,
        }),
      ).toThrow()
    })

    it('ST001-4b: sentiment <-1 rejeita com ZodError', () => {
      expect(() =>
        adminNewsInjectSchema.parse({
          title: 'X',
          content: 'Y',
          ticker: 'FLA1',
          impactCategory: 'ESPORTIVA_MAJORITARIA',
          sentiment: -1.5,
        }),
      ).toThrow()
    })

    it('ST001-5: campo obrigatorio (title) ausente rejeita com ZodError', () => {
      expect(() =>
        adminNewsInjectSchema.parse({
          content: 'Y',
          ticker: 'FLA1',
          impactCategory: 'ESPORTIVA_MAJORITARIA',
          sentiment: 0.5,
        }),
      ).toThrow()
    })
  })

  describe('ERROR — asset nao encontrado', () => {
    it('ST001-6: ticker inexistente lanca erro "Ativo nao encontrado"', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(null)

      const dto = makeValidDTO({ ticker: 'ZZZ1' } as unknown as Partial<AdminNewsInjectDTO>)
      await expect(service.inject(dto, ADMIN_ID)).rejects.toThrow(
        'Ativo não encontrado',
      )

      // Garante que nao criou news nem auditoria
      expect(mockPrisma.news.create).not.toHaveBeenCalled()
      expect(mockPrisma.adminMarketAction.create).not.toHaveBeenCalled()
      expect(mockRedis.publish).not.toHaveBeenCalled()
    })
  })

  // ─── SENTIMENT MAPPING ────────────────────────────────────────────────

  describe('numberToSentiment — via news.create data.sentiment', () => {
    it('sentiment positivo (>0.1) → BULLISH', async () => {
      const dto = makeValidDTO({ sentiment: 0.5 })
      await service.inject(dto, ADMIN_ID)

      const data = mockPrisma.news.create.mock.calls[0][0].data
      expect(data.sentiment).toBe('BULLISH')
    })

    it('sentiment negativo (<-0.1) → BEARISH', async () => {
      const dto = makeValidDTO({ sentiment: -0.5 })
      await service.inject(dto, ADMIN_ID)

      const data = mockPrisma.news.create.mock.calls[0][0].data
      expect(data.sentiment).toBe('BEARISH')
    })

    it('sentiment neutro (entre -0.1 e 0.1) → NEUTRAL', async () => {
      const dto = makeValidDTO({ sentiment: 0.05 })
      await service.inject(dto, ADMIN_ID)

      const data = mockPrisma.news.create.mock.calls[0][0].data
      expect(data.sentiment).toBe('NEUTRAL')
    })
  })
})
