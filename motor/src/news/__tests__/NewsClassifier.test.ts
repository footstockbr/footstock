// ============================================================================
// Testes — NewsClassifier
// Rastreabilidade: INT-047, INT-128
// ============================================================================

import RedisMock from 'ioredis-mock'
import type Redis from 'ioredis'
import { NewsClassifier, RateLimitError } from '../NewsClassifier'
import { newsQueue, type RawNewsItem } from '../NewsQueue'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreate = jest.fn()
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }))
})

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRawItem = (): RawNewsItem => ({
  url: 'https://ge.globo.com/1',
  title: 'Flamengo vence Palmeiras por 3x1',
  source: 'Globo Esporte',
  publishedAt: new Date().toISOString(),
})

const haikusResponse = (json: object) => ({
  content: [{ type: 'text', text: JSON.stringify(json) }],
})

describe('NewsClassifier', () => {
  let redis: Redis
  let classifier: NewsClassifier

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis
    // Inicializar token bucket
    await (redis as any).set('news:haiku:tokens', 60, 'EX', 60)
    classifier = new NewsClassifier(redis)
    mockCreate.mockReset()
    jest.clearAllMocks()
  })

  test('[SUCCESS] classificação normal retorna dados corretos', async () => {
    mockCreate.mockResolvedValue(haikusResponse({
      ticker: 'FLM', sentiment: 0.8, impactCategory: 'RESULTADO_ESPORTIVO', relevance: 0.9,
    }))

    const result = await classifier.classify(makeRawItem())
    expect(result.ticker).toBe('FLM')
    expect(result.sentiment).toBe(0.8)
    expect(result.relevance).toBe(0.9)
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  test('[ERROR — JSON mal-formado] fallback imediato sem retry', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Flamengo ganhou muito bem hoje' }],
    })

    const result = await classifier.classify(makeRawItem())
    expect(result.ticker).toBe('')
    expect(result.sentiment).toBe(0)
    expect(result.relevance).toBe(0)
    expect(mockCreate).toHaveBeenCalledTimes(1) // sem retry
  })

  test('[ERROR — Rate limit RATE_001] lança RateLimitError sem chamar Haiku', async () => {
    await (redis as any).set('news:haiku:tokens', 0)

    await expect(classifier.classify(makeRawItem())).rejects.toThrow(RateLimitError)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('[DEGRADED — Rede falha 3x] loga SYS_002 e retorna fallback', async () => {
    const { logger } = require('../../utils/logger')
    mockCreate.mockRejectedValue(new Error('Network error'))

    const result = await classifier.classify(makeRawItem())
    expect(result.ticker).toBe('')
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('SYS_002'))
    expect(mockCreate).toHaveBeenCalledTimes(3)
  }, 10_000)

  test('[DEGRADED — Rede falha 2x, sucesso na 3ª] retorna resultado correto', async () => {
    const { logger } = require('../../utils/logger')
    mockCreate
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValue(haikusResponse({ ticker: 'PLM', sentiment: 0.5, impactCategory: 'CONTRATACAO', relevance: 0.7 }))

    const result = await classifier.classify(makeRawItem())
    expect(result.ticker).toBe('PLM')
    expect(logger.error).not.toHaveBeenCalled()
  }, 10_000)

  test('[SUCCESS] sentiment clampado para [-1, 1]', async () => {
    mockCreate.mockResolvedValue(haikusResponse({
      ticker: 'GRM', sentiment: 1.5, impactCategory: 'RESULTADO_ESPORTIVO', relevance: 0.5,
    }))

    const result = await classifier.classify(makeRawItem())
    expect(result.sentiment).toBeLessThanOrEqual(1)
    expect(result.sentiment).toBeGreaterThanOrEqual(-1)
  })

  test('[SUCCESS] relevance clampada para [0, 1]', async () => {
    mockCreate.mockResolvedValue(haikusResponse({
      ticker: 'INT', sentiment: 0.3, impactCategory: 'CONTRATACAO', relevance: 2.0,
    }))

    const result = await classifier.classify(makeRawItem())
    expect(result.relevance).toBeLessThanOrEqual(1)
    expect(result.relevance).toBeGreaterThanOrEqual(0)
  })

  test('[EDGE — content type !== text] ternário retorna string vazia → fallback', async () => {
    // Haiku retorna bloco do tipo 'tool_use' em vez de 'text'
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', input: {} }],
    })

    const result = await classifier.classify(makeRawItem())
    // text vira '' → JSON.parse('') lança SyntaxError → fallback
    expect(result.ticker).toBe('')
    expect(result.sentiment).toBe(0)
  })

  test('[EDGE — campos JSON com tipos incorretos] usa valores padrão', async () => {
    // Todos os campos com tipos errados — cobre os branches false dos typeof
    mockCreate.mockResolvedValue(haikusResponse({
      ticker: 42,       // not string
      sentiment: 'alto', // not number
      impactCategory: 'RESULTADO_ESPORTIVO', // valid string
      relevance: 'médio', // not number
    }))

    const result = await classifier.classify(makeRawItem())
    expect(result.ticker).toBe('')  // 42.toString() é '42', mas typeof 42 === 'string' é false → ''
    expect(result.sentiment).toBe(0)
    expect(result.relevance).toBe(0)
  })

  test('[INFRA — bucket inexistente] checkRateLimit cria chave automaticamente', async () => {
    // Remover a chave criada no beforeEach
    await (redis as any).del('news:haiku:tokens')

    mockCreate.mockResolvedValue(haikusResponse({
      ticker: 'FLM', sentiment: 0.5, impactCategory: 'RESULTADO_ESPORTIVO', relevance: 0.8,
    }))

    const result = await classifier.classify(makeRawItem())
    expect(result.ticker).toBe('FLM')
    // Chave criada com 60 e depois decrementada em 1 = 59
    const tokens = await (redis as any).get('news:haiku:tokens')
    expect(parseInt(tokens)).toBe(59)
  })

  test('[INFRA] startClassifying processa item da fila e para ao stopClassifying', async () => {
    const mockPublisher = { publish: jest.fn().mockResolvedValue(undefined) }
    const item = makeRawItem()

    mockCreate.mockResolvedValue(haikusResponse({
      ticker: 'CRC', sentiment: 0.6, impactCategory: 'RESULTADO_ESPORTIVO', relevance: 0.7,
    }))

    // Esvaziar a fila, depois enfileirar 1 item
    while (!newsQueue.isEmpty()) newsQueue.dequeue()
    newsQueue.enqueue(item)

    // stopClassifying após 50ms (antes do sleep de 500ms terminar)
    setTimeout(() => classifier.stopClassifying(), 50)

    await classifier.startClassifying(mockPublisher as any)

    expect(mockPublisher.publish).toHaveBeenCalledTimes(1)
    expect(mockPublisher.publish).toHaveBeenCalledWith(item, expect.objectContaining({ ticker: 'CRC' }))
  }, 5000)

  test('[DEGRADED — RateLimitError no worker] re-enfileira item e loga RATE_001', async () => {
    const { logger } = require('../../utils/logger')
    const mockPublisher = { publish: jest.fn() }
    const item = makeRawItem()

    // Zerar tokens para forçar RateLimitError
    await (redis as any).set('news:haiku:tokens', 0)

    while (!newsQueue.isEmpty()) newsQueue.dequeue()
    newsQueue.enqueue(item)

    // Para o worker após 1.5s (após o sleep(1000) do RateLimit)
    setTimeout(() => classifier.stopClassifying(), 1500)

    await classifier.startClassifying(mockPublisher as any)

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('RATE_001'))
  }, 5000)

  test('[ERROR — erro inesperado no worker] loga erro e continua', async () => {
    const { logger } = require('../../utils/logger')
    const mockPublisher = {
      publish: jest.fn().mockRejectedValue(new Error('publisher crash')),
    }
    const item = makeRawItem()

    mockCreate.mockResolvedValue(haikusResponse({
      ticker: 'FLU', sentiment: -0.3, impactCategory: 'LESAO', relevance: 0.5,
    }))

    while (!newsQueue.isEmpty()) newsQueue.dequeue()
    newsQueue.enqueue(item)

    setTimeout(() => classifier.stopClassifying(), 50)

    await classifier.startClassifying(mockPublisher as any)

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('publisher crash'))
  }, 5000)
})
