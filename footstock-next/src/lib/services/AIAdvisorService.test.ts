// ============================================================================
// FootStock — AIAdvisorService Tests (module-21/TASK-1/ST002+ST004 + TASK-2/ST003)
// Cobre: analyze (planos Craque/Lenda), cache Redis, timeout, fetchContext
// ============================================================================

import { AIAdvisorService, TimeoutError } from './AIAdvisorService'
import { PLAN_TYPE } from '@/lib/enums'

// ─── Mock: @anthropic-ai/sdk ─────────────────────────────────────────────────

const mockMessagesCreate = jest.fn()
const mockBetaMessagesCreate = jest.fn()

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: mockMessagesCreate,
    },
    beta: {
      messages: {
        create: mockBetaMessagesCreate,
      },
    },
  }))
})

// ─── Mock: @/lib/redis ───────────────────────────────────────────────────────

jest.mock('@/lib/redis', () => ({
  redisPublisher: {
    get:   jest.fn(),
    setex: jest.fn(),
  },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { redisPublisher: mockRedis } = require('@/lib/redis')

// ─── Mock: @/lib/prisma ──────────────────────────────────────────────────────

jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: {
      findFirst: jest.fn(),
    },
    news: {
      findMany: jest.fn(),
    },
    position: {
      findFirst: jest.fn(),
    },
  },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { prisma: mockPrisma } = require('@/lib/prisma')

// ─── Mock: AIResponseParser ──────────────────────────────────────────────────

jest.mock('@/lib/services/AIResponseParser', () => ({
  aiResponseParser: {
    parse: jest.fn(),
  },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { aiResponseParser: mockParser } = require('@/lib/services/AIResponseParser')

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TICKER = 'FLAM3'
const USER_ID = 'user-abc'

const BASE_ANALYSIS = {
  ticker: TICKER,
  resumo: 'Análise de teste.',
  pontos_positivos: ['P1'],
  pontos_negativos: ['N1'],
  sentimento: 0.2,
  recomendacao: 'MANTER' as const,
  risco: 'MEDIO' as const,
  noticias_relevantes: [],
  generatedAt: new Date().toISOString(),
  isWebSearched: false,
  cached: false,
}

const CLAUDE_TEXT_BLOCK = { type: 'text', text: JSON.stringify(BASE_ANALYSIS) }

function setupContextMocks() {
  mockPrisma.asset.findFirst.mockResolvedValue({
    id: 'asset-1',
    currentPrice: 100,
    openPrice: 95,
  })
  mockPrisma.news.findMany.mockResolvedValue([])
  mockPrisma.position.findFirst.mockResolvedValue(null)
  mockParser.parse.mockReturnValue(BASE_ANALYSIS)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AIAdvisorService.analyze', () => {
  let service: AIAdvisorService

  beforeEach(() => {
    service = new AIAdvisorService()
    jest.clearAllMocks()
    mockRedis.get.mockResolvedValue(null) // cache miss por padrão
    mockRedis.setex.mockResolvedValue('OK')
    setupContextMocks()
  })

  // ── Plano Craque → sem tools, isWebSearched=false ─────────────────────────

  it('plano CRAQUE: chama anthropic.messages.create sem tools, isWebSearched=false', async () => {
    mockMessagesCreate.mockResolvedValue({ content: [CLAUDE_TEXT_BLOCK] })

    const result = await service.analyze(TICKER, USER_ID, PLAN_TYPE.CRAQUE)

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1)
    expect(mockBetaMessagesCreate).not.toHaveBeenCalled()
    const callArgs = mockMessagesCreate.mock.calls[0][0]
    expect(callArgs.tools).toBeUndefined()
    expect(result.isWebSearched).toBe(false)
    expect(result.cached).toBe(false)
  })

  // ── Plano Lenda → com web_search, isWebSearched=true ─────────────────────

  it('plano LENDA: chama anthropic.beta.messages.create com web_search, isWebSearched=true', async () => {
    mockBetaMessagesCreate.mockResolvedValue({ content: [CLAUDE_TEXT_BLOCK] })

    const result = await service.analyze(TICKER, USER_ID, PLAN_TYPE.LENDA)

    expect(mockBetaMessagesCreate).toHaveBeenCalledTimes(1)
    expect(mockMessagesCreate).not.toHaveBeenCalled()
    const callArgs = mockBetaMessagesCreate.mock.calls[0][0]
    expect(callArgs.tools).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'web_search_20250305' })])
    )
    expect(result.isWebSearched).toBe(true)
    expect(result.cached).toBe(false)
  })

  // ── Cache hit → Redis retorna, Claude não é chamado, cached=true ──────────

  it('cache hit: retorna do Redis sem chamar Claude, cached=true', async () => {
    const cachedAnalysis = { ...BASE_ANALYSIS, cached: false }
    mockRedis.get.mockResolvedValue(JSON.stringify(cachedAnalysis))

    const result = await service.analyze(TICKER, USER_ID, PLAN_TYPE.CRAQUE)

    expect(result.cached).toBe(true)
    expect(mockMessagesCreate).not.toHaveBeenCalled()
    expect(mockBetaMessagesCreate).not.toHaveBeenCalled()
  })

  // ── Cache segregado por plano ─────────────────────────────────────────────

  it('cache segregado: CRAQUE e LENDA usam chaves Redis distintas', async () => {
    mockMessagesCreate.mockResolvedValue({ content: [CLAUDE_TEXT_BLOCK] })
    mockBetaMessagesCreate.mockResolvedValue({ content: [CLAUDE_TEXT_BLOCK] })

    await service.analyze(TICKER, USER_ID, PLAN_TYPE.CRAQUE)
    await service.analyze(TICKER, USER_ID, PLAN_TYPE.LENDA)

    const getCalls = mockRedis.get.mock.calls.map((c: string[]) => c[0])
    const setexCalls = mockRedis.setex.mock.calls.map((c: string[]) => c[0])

    const craqueKey = `ai:cache:${TICKER}:CRAQUE`
    const lendaKey = `ai:cache:${TICKER}:LENDA`

    expect(getCalls).toContain(craqueKey)
    expect(getCalls).toContain(lendaKey)
    expect(setexCalls).toContain(craqueKey)
    expect(setexCalls).toContain(lendaKey)
  })

  // ── Timeout 30s → TimeoutError, cache não populado ───────────────────────

  it('timeout 30s: lança TimeoutError e não popula cache', async () => {
    const abortError = new Error('aborted')
    abortError.name = 'AbortError'
    mockMessagesCreate.mockRejectedValue(abortError)

    await expect(service.analyze(TICKER, USER_ID, PLAN_TYPE.CRAQUE)).rejects.toThrow(TimeoutError)
    expect(mockRedis.setex).not.toHaveBeenCalled()
  })

  // ── Redis indisponível no cache → Claude é chamado, análise retornada ─────

  it('Redis indisponível no cache check: Claude é chamado e análise retornada', async () => {
    mockRedis.get.mockRejectedValue(new Error('ECONNREFUSED'))
    mockRedis.setex.mockRejectedValue(new Error('ECONNREFUSED'))
    mockMessagesCreate.mockResolvedValue({ content: [CLAUDE_TEXT_BLOCK] })

    const result = await service.analyze(TICKER, USER_ID, PLAN_TYPE.CRAQUE)

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1)
    expect(result.ticker).toBe(TICKER)
    // Deve retornar análise mesmo sem cache
    expect(result.cached).toBe(false)
  })
})

// ─── fetchContext ────────────────────────────────────────────────────────────

describe('AIAdvisorService.fetchContext', () => {
  let service: AIAdvisorService

  beforeEach(() => {
    service = new AIAdvisorService()
    jest.clearAllMocks()
  })

  it('busca preço, notícias e posição corretamente', async () => {
    mockPrisma.asset.findFirst.mockResolvedValue({
      id: 'asset-1',
      currentPrice: 120,
      openPrice: 100,
    })
    mockPrisma.news.findMany.mockResolvedValue([
      { title: 'Clube vence campeonato', sentiment: 'POSITIVO' },
    ])
    mockPrisma.position.findFirst.mockResolvedValue({
      quantity: 10,
      avgPrice: 110,
    })

    const ctx = await service.fetchContext(TICKER, USER_ID)

    expect(ctx.currentPrice).toBe(120)
    expect(ctx.changePercent).toBeCloseTo(20, 1) // (120-100)/100 * 100
    expect(ctx.recentNews).toHaveLength(1)
    expect(ctx.recentNews[0]?.title).toBe('Clube vence campeonato')
    expect(ctx.recentNews[0]?.sentiment).toBe(0.5) // POSITIVO → 0.5
    expect(ctx.userPosition).toEqual({ qty: 10, avgPrice: 110 })
  })

  it('posição SHORT (qty < 0) resulta em "Posição SHORT" no prompt buildado', async () => {
    mockPrisma.asset.findFirst.mockResolvedValue({
      id: 'asset-2',
      currentPrice: 50,
      openPrice: 55,
    })
    mockPrisma.news.findMany.mockResolvedValue([])
    mockPrisma.position.findFirst.mockResolvedValue({
      quantity: -5,
      avgPrice: 60,
    })

    const ctx = await service.fetchContext(TICKER, USER_ID)
    const prompt = service.buildUserPrompt(TICKER, ctx)

    expect(prompt).toContain('SHORT')
    expect(ctx.userPosition?.qty).toBe(-5)
  })

  it('ativo não encontrado → currentPrice=0, changePercent=0, userPosition=null', async () => {
    mockPrisma.asset.findFirst.mockResolvedValue(null)
    mockPrisma.news.findMany.mockResolvedValue([])
    mockPrisma.position.findFirst.mockResolvedValue(null)

    const ctx = await service.fetchContext(TICKER, USER_ID)

    expect(ctx.currentPrice).toBe(0)
    expect(ctx.changePercent).toBe(0)
    expect(ctx.userPosition).toBeNull()
    expect(ctx.recentNews).toEqual([])
  })

  it('Prisma falha → catch silencioso, retorna valores padrão', async () => {
    mockPrisma.asset.findFirst.mockRejectedValue(new Error('DB error'))

    const ctx = await service.fetchContext(TICKER, USER_ID)

    expect(ctx.currentPrice).toBe(0)
    expect(ctx.userPosition).toBeNull()
  })
})

// ─── TimeoutError ────────────────────────────────────────────────────────────

describe('TimeoutError', () => {
  it('tem code=SYS_003 e name=TimeoutError', () => {
    const err = new TimeoutError()
    expect(err.code).toBe('SYS_003')
    expect(err.name).toBe('TimeoutError')
    expect(err).toBeInstanceOf(Error)
  })
})
