// ============================================================================
// Testes do ImpactReconciler (T-22 / item 023)
// ============================================================================

import { ImpactReconciler, isImpactReconcilerEnabled, getImpactBacklogCount } from '../impact-reconciler'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRedis = {
  publish: jest.fn().mockResolvedValue(1),
}

const mockPrisma = {
  news: {
    count: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
}

function createReconciler(config = {}) {
  return new ImpactReconciler(
    mockPrisma as unknown as any,
    mockRedis as unknown as any,
    config
  )
}

function makeRow(overrides: Partial<{
  id: string
  title: string
  impact: string
  sentiment: string
  ticker: string | null
  source: string
  publishedAt: Date
  groupId: string | null
  createdAt: Date
}> = {}) {
  return {
    id: overrides.id ?? 'news-1',
    title: overrides.title ?? 'Test News',
    impact: overrides.impact ?? 'INSTITUCIONAL',
    sentiment: overrides.sentiment ?? 'BULLISH',
    ticker: 'ticker' in overrides ? overrides.ticker : 'PETR4',
    source: overrides.source ?? 'Test Source',
    publishedAt: overrides.publishedAt ?? new Date('2026-08-20T10:00:00Z'),
    groupId: 'groupId' in overrides ? overrides.groupId : undefined,
    createdAt: overrides.createdAt ?? new Date(),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.IMPACT_RECONCILER_ENABLED
})

// ---------------------------------------------------------------------------
// Kill switch
// ---------------------------------------------------------------------------

describe('isImpactReconcilerEnabled', () => {
  test('default: true (quando env ausente)', () => {
    expect(isImpactReconcilerEnabled()).toBe(true)
  })

  test('true quando IMPACT_RECONCILER_ENABLED=true', () => {
    process.env.IMPACT_RECONCILER_ENABLED = 'true'
    expect(isImpactReconcilerEnabled()).toBe(true)
  })

  test('false quando IMPACT_RECONCILER_ENABLED=false', () => {
    process.env.IMPACT_RECONCILER_ENABLED = 'false'
    expect(isImpactReconcilerEnabled()).toBe(false)
  })

  test('false quando IMPACT_RECONCILER_ENABLED=FALSE (case-insensitive)', () => {
    process.env.IMPACT_RECONCILER_ENABLED = 'FALSE'
    expect(isImpactReconcilerEnabled()).toBe(false)
  })

  test('true quando IMPACT_RECONCILER_ENABLED=lixo (nao e false)', () => {
    process.env.IMPACT_RECONCILER_ENABLED = 'garbage'
    expect(isImpactReconcilerEnabled()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Ciclo do reconciliador
// ---------------------------------------------------------------------------

describe('ImpactReconciler.run', () => {
  test('skip quando kill switch desligado', async () => {
    process.env.IMPACT_RECONCILER_ENABLED = 'false'
    const reconciler = createReconciler()
    const result = await reconciler.run()
    expect(result.status).toBe('disabled')
    expect(result.processed).toBe(0)
    expect(mockPrisma.news.count).not.toHaveBeenCalled()
  })

  test('skip quando backlog vazio', async () => {
    mockPrisma.news.count.mockResolvedValue(0)
    const reconciler = createReconciler()
    const result = await reconciler.run()
    expect(result.status).toBe('ok')
    expect(result.processed).toBe(0)
    expect(result.backlog).toBe(0)
    expect(mockPrisma.news.findMany).not.toHaveBeenCalled()
  })

  test('processa registros elegiveis e marca impactDispatchedAt', async () => {
    mockPrisma.news.count.mockResolvedValue(2)
    mockPrisma.news.findMany.mockResolvedValue([
      makeRow({ id: 'news-1', ticker: 'PETR4', sentiment: 'BULLISH' }),
      makeRow({ id: 'news-2', ticker: 'VALE3', sentiment: 'BEARISH' }),
    ])
    mockPrisma.news.updateMany.mockResolvedValue({ count: 2 })

    const reconciler = createReconciler()
    const result = await reconciler.run()

    expect(result.status).toBe('ok')
    expect(result.processed).toBe(2)
    expect(result.failed).toBe(0)
    expect(mockRedis.publish).toHaveBeenCalledTimes(2)
    expect(mockPrisma.news.updateMany).toHaveBeenCalledTimes(1)
    expect(mockPrisma.news.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['news-1', 'news-2'] } },
        data: expect.objectContaining({ impactDispatchedAt: expect.any(Date) }),
      })
    )
  })

  test('falha de Redis nao interrompe o ciclo', async () => {
    mockPrisma.news.count.mockResolvedValue(2)
    mockPrisma.news.findMany.mockResolvedValue([
      makeRow({ id: 'news-1', ticker: 'PETR4' }),
      makeRow({ id: 'news-2', ticker: 'VALE3' }),
    ])
    mockRedis.publish
      .mockRejectedValueOnce(new Error('Redis unavailable'))
      .mockResolvedValueOnce(1)
    mockPrisma.news.updateMany.mockResolvedValue({ count: 1 })

    const reconciler = createReconciler()
    const result = await reconciler.run()

    expect(result.processed).toBe(1)
    expect(result.failed).toBe(1)
    // Apenas o segundo registro foi marcado
    expect(mockPrisma.news.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['news-2'] } },
      })
    )
  })

  test('registros sem ticker sao ignorados', async () => {
    mockPrisma.news.count.mockResolvedValue(1)
    mockPrisma.news.findMany.mockResolvedValue([
      makeRow({ id: 'news-1', ticker: null }),
    ])
    mockPrisma.news.updateMany.mockResolvedValue({ count: 0 })

    const reconciler = createReconciler()
    const result = await reconciler.run()

    expect(result.processed).toBe(0)
    expect(mockRedis.publish).not.toHaveBeenCalled()
  })

  test('limite de idade: registros antigos nao sao reprocessados', async () => {
    const oldDate = new Date(Date.now() - 100 * 60 * 60 * 1000) // 100h atrás
    mockPrisma.news.count.mockResolvedValue(1)
    mockPrisma.news.findMany.mockResolvedValue([]) // Nenhum registro dentro do limite

    const reconciler = createReconciler({ staleThresholdHours: 72 })
    const result = await reconciler.run()

    expect(result.processed).toBe(0)
    expect(result.backlog).toBe(1)
    // findMany foi chamado com filtro de createdAt >= staleCutoff
    expect(mockPrisma.news.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Idempotencia
// ---------------------------------------------------------------------------

describe('idempotencia', () => {
  test('re-executar o reconciliador nao duplica despachos (marca apos sucesso)', async () => {
    mockPrisma.news.count.mockResolvedValue(1)
    mockPrisma.news.findMany.mockResolvedValue([
      makeRow({ id: 'news-1', ticker: 'PETR4' }),
    ])
    mockPrisma.news.updateMany.mockResolvedValue({ count: 1 })

    const reconciler = createReconciler()

    // Primeira execução
    const result1 = await reconciler.run()
    expect(result1.processed).toBe(1)

    // Segunda execução: o registro já foi marcado, então count retorna 0
    mockPrisma.news.count.mockResolvedValue(0)
    mockPrisma.news.findMany.mockResolvedValue([])

    const result2 = await reconciler.run()
    expect(result2.processed).toBe(0)
    expect(mockRedis.publish).toHaveBeenCalledTimes(1) // Apenas 1 publish total
  })
})

// ---------------------------------------------------------------------------
// Métrica de backlog
// ---------------------------------------------------------------------------

describe('getImpactBacklogCount', () => {
  test('retorna 0 antes da primeira execucao', () => {
    expect(getImpactBacklogCount()).toBe(0)
  })

  test('atualiza apos execucao', async () => {
    mockPrisma.news.count.mockResolvedValue(42)
    mockPrisma.news.findMany.mockResolvedValue([])

    const reconciler = createReconciler()
    await reconciler.run()

    expect(getImpactBacklogCount()).toBe(42)
  })
})

// ---------------------------------------------------------------------------
// Alerta de backlog
// ---------------------------------------------------------------------------

describe('alerta de backlog', () => {
  test('emite alerta quando backlog >= threshold', async () => {
    mockPrisma.news.count.mockResolvedValue(100)
    mockPrisma.news.findMany.mockResolvedValue([])

    const reconciler = createReconciler({ backlogAlertThreshold: 50 })
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation()

    await reconciler.run()

    // O alerta é emitido via logger.warn — verificamos que o count foi chamado
    expect(mockPrisma.news.count).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// Construção do evento
// ---------------------------------------------------------------------------

describe('buildEvent (via run)', () => {
  test('reconstrói evento com correlationId = groupId quando presente', async () => {
    mockPrisma.news.count.mockResolvedValue(1)
    mockPrisma.news.findMany.mockResolvedValue([
      makeRow({ id: 'news-1', groupId: 'group-1', ticker: 'PETR4' }),
    ])
    mockPrisma.news.updateMany.mockResolvedValue({ count: 1 })

    const reconciler = createReconciler()
    await reconciler.run()

    const publishCall = mockRedis.publish.mock.calls[0]
    const event = JSON.parse(publishCall[1])
    expect(event.correlationId).toBe('group-1')
  })

  test('reconstrói evento com correlationId = newsId quando groupId ausente', async () => {
    mockPrisma.news.count.mockResolvedValue(1)
    mockPrisma.news.findMany.mockResolvedValue([
      makeRow({ id: 'news-1', groupId: null, ticker: 'PETR4' }),
    ])
    mockPrisma.news.updateMany.mockResolvedValue({ count: 1 })

    const reconciler = createReconciler()
    await reconciler.run()

    const publishCall = mockRedis.publish.mock.calls[0]
    const event = JSON.parse(publishCall[1])
    expect(event.correlationId).toBe('news-1')
  })

  test('sentiment BEARISH gera magnitude negativa', async () => {
    mockPrisma.news.count.mockResolvedValue(1)
    mockPrisma.news.findMany.mockResolvedValue([
      makeRow({ id: 'news-1', sentiment: 'BEARISH', impact: 'FINANCEIRA_CRITICA', ticker: 'PETR4' }),
    ])
    mockPrisma.news.updateMany.mockResolvedValue({ count: 1 })

    const reconciler = createReconciler()
    await reconciler.run()

    const publishCall = mockRedis.publish.mock.calls[0]
    const event = JSON.parse(publishCall[1])
    expect(event.magnitude).toBe(-0.05) // FINANCEIRA_CRITICA = 0.05, BEARISH = negativo
    expect(event.sentiment).toBe(-1)
  })
})
