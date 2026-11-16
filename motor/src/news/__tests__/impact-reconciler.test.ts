// ============================================================================
// Testes do ImpactReconciler (T-22 / item 023)
// ============================================================================

import {
  ImpactReconciler,
  isImpactReconcilerEnabled,
  getImpactBacklogCount,
  getImpactStaleCount,
  _resetImpactReconcilerMetricsForTests,
} from '../impact-reconciler'
import { logger } from '../../utils/logger'

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

const mockLogger = logger as unknown as Record<'info' | 'warn' | 'error', jest.Mock>

function loggedEvents(level: 'info' | 'warn' | 'error', event: string): Array<Record<string, unknown>> {
  return mockLogger[level].mock.calls
    .map(c => { try { return JSON.parse(String(c[0])) } catch { return null } })
    .filter((e): e is Record<string, unknown> => !!e && e.event === event)
}

/** count(): 1a chamada = backlog dentro do limite; 2a = vencidos. */
function mockCounts(inWindow: number, stale: number) {
  mockPrisma.news.count.mockImplementation(({ where }: { where: { createdAt: Record<string, unknown> } }) =>
    Promise.resolve('gte' in where.createdAt ? inWindow : stale)
  )
}

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
  mockPrisma.news.count.mockReset()
  _resetImpactReconcilerMetricsForTests()
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
  test('emite alerta quando o backlog dentro do limite de idade >= threshold', async () => {
    mockCounts(100, 0)
    mockPrisma.news.findMany.mockResolvedValue([])

    await createReconciler({ backlogAlertThreshold: 50 }).run()

    const alerts = loggedEvents('warn', 'impact_reconciler_backlog_alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].backlog).toBe(100)
  })

  test('as duas contagens separam a janela: gte no acionavel, lt no vencido', async () => {
    mockCounts(0, 0)
    const before = Date.now()
    await createReconciler({ staleThresholdHours: 72 }).run()

    const wheres = mockPrisma.news.count.mock.calls.map(c => c[0].where)
    expect(wheres).toHaveLength(2)
    const gte = wheres[0].createdAt.gte as Date
    expect(wheres[1].createdAt.lt).toEqual(gte)
    expect(Math.abs(before - 72 * 3600_000 - gte.getTime())).toBeLessThan(5_000)
    for (const w of wheres) {
      expect(w).toMatchObject({ impactDispatchedAt: null, ticker: { not: null }, isPublished: true })
    }
  })

  // Prod 2026-11-16: 4284 noticias de jun-jul sem despacho, nenhuma dentro de 72h.
  // O alerta disparava a cada 5 min para sempre.
  test('[REGRESSAO] backlog so de vencidos nao alerta nem busca elegiveis', async () => {
    mockCounts(0, 4284)

    const result = await createReconciler({ backlogAlertThreshold: 50 }).run()

    expect(result).toMatchObject({ status: 'ok', backlog: 0, stale: 4284, processed: 0 })
    expect(loggedEvents('warn', 'impact_reconciler_backlog_alert')).toHaveLength(0)
    expect(mockPrisma.news.findMany).not.toHaveBeenCalled()
    expect(getImpactBacklogCount()).toBe(0)
    expect(getImpactStaleCount()).toBe(4284)
  })

  test('vencidos: loga em info so quando o numero muda', async () => {
    const reconciler = createReconciler()
    mockCounts(0, 4284)
    await reconciler.run()
    await reconciler.run()
    await reconciler.run()
    mockCounts(0, 4290)
    await reconciler.run()

    const staleLogs = loggedEvents('info', 'impact_reconciler_stale_backlog')
    expect(staleLogs.map(e => [e.previous, e.stale])).toEqual([[null, 4284], [4284, 4290]])
    expect(mockLogger.warn).not.toHaveBeenCalled()
  })

  test('falha na contagem de vencidos nao derruba o ciclo', async () => {
    mockPrisma.news.count
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error('timeout'))
    mockPrisma.news.findMany.mockResolvedValue([makeRow({ id: 'news-1' })])
    mockPrisma.news.updateMany.mockResolvedValue({ count: 1 })

    const result = await createReconciler().run()

    expect(result).toMatchObject({ status: 'ok', processed: 1, backlog: 1, stale: null })
    expect(getImpactStaleCount()).toBeNull()
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
