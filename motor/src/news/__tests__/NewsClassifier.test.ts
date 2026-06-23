// ============================================================================
// Testes — NewsClassifier
// Rastreabilidade: INT-047, INT-128
// ============================================================================

import RedisMock from 'ioredis-mock'
import type Redis from 'ioredis'
import { NewsClassifier, RateLimitError } from '../NewsClassifier'
import { newsQueue, type RawNewsItem } from '../NewsQueue'
import { buildAliasIndex } from '../ticker-fallback'

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

const sonnetsResponse = (json: object) => ({
  content: [{ type: 'text', text: JSON.stringify(json) }],
})

describe('NewsClassifier', () => {
  let redis: Redis
  let classifier: NewsClassifier

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis
    // Inicializar token bucket
    await (redis as any).set('news:sonnet:tokens', 60, 'EX', 60)
    classifier = new NewsClassifier(redis)
    mockCreate.mockReset()
    jest.clearAllMocks()
  })

  test('[SUCCESS] classificação normal retorna dados corretos', async () => {
    mockCreate.mockResolvedValue(sonnetsResponse({
      ticker: 'URU3', sentiment: 0.8, impactCategory: 'RESULTADO_ESPORTIVO', relevance: 0.9,
    }))

    const result = await classifier.classify(makeRawItem())
    expect(result.ticker).toBe('URU3')
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

  test('[ERROR — Rate limit RATE_001] lança RateLimitError sem chamar Sonnet', async () => {
    await (redis as any).set('news:sonnet:tokens', 0)

    await expect(classifier.classify(makeRawItem())).rejects.toThrow(RateLimitError)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  const connError = (msg = 'Network error') =>
    Object.assign(new Error(msg), { name: 'APIConnectionError' })

  test('[DEGRADED — Rede falha 3x] loga SYS_002 e retorna fallback', async () => {
    const { logger } = require('../../utils/logger')
    mockCreate.mockRejectedValue(connError())

    const result = await classifier.classify(makeRawItem())
    expect(result.ticker).toBe('')
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('SYS_002'))
    expect(mockCreate).toHaveBeenCalledTimes(3)
  }, 10_000)

  test('[DEGRADED — Rede falha 2x, sucesso na 3ª] retorna resultado correto', async () => {
    const { logger } = require('../../utils/logger')
    mockCreate
      .mockRejectedValueOnce(connError())
      .mockRejectedValueOnce(connError())
      .mockResolvedValue(sonnetsResponse({ ticker: 'POR3', sentiment: 0.5, impactCategory: 'CONTRATACAO', relevance: 0.7 }))

    const result = await classifier.classify(makeRawItem())
    expect(result.ticker).toBe('POR3')
    expect(logger.error).not.toHaveBeenCalled()
  }, 10_000)

  test('[RETRY — 400 não-retentável] crédito esgotado falha rápido sem reentregar', async () => {
    const { logger } = require('../../utils/logger')
    const err = Object.assign(new Error('credit balance too low'), { status: 400 })
    mockCreate.mockRejectedValue(err)

    const result = await classifier.classify(makeRawItem())
    expect(result.ticker).toBe('')
    expect(mockCreate).toHaveBeenCalledTimes(1) // sem retry em 4xx não-retentável
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('não-retentável'))
  })

  test('[FALLBACK — 400 crédito esgotado + índice carregado] resolve ticker pelo título', async () => {
    // Cenário REAL de prod (2026-06-23): API Anthropic sem crédito → toda chamada
    // falha com 400. O fallback determinístico DEVE rodar mesmo nesse caminho de erro.
    ;(classifier as unknown as { tickerIndex: ReturnType<typeof buildAliasIndex> }).tickerIndex =
      buildAliasIndex([
        { ticker: 'POR3', searchText: 'palmeiras, verdao' },
        { ticker: 'URU3', searchText: 'flamengo, mengao' },
      ])
    const err = Object.assign(new Error('credit balance too low'), { status: 400 })
    mockCreate.mockRejectedValue(err)

    const result = await classifier.classify({
      ...makeRawItem(),
      title: 'Palmeiras goleia rival e dispara na liderança',
    })
    expect(result.ticker).toBe('POR3')
    expect(result.relevance).toBe(0) // fallback NÃO infla relevance → sem impacto de preço
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  test('[RETRY — 401/403/404 não-retentáveis] falham rápido sem reentregar', async () => {
    for (const status of [401, 403, 404, 422]) {
      mockCreate.mockReset()
      const err = Object.assign(new Error(`http ${status}`), { status })
      mockCreate.mockRejectedValue(err)
      const result = await classifier.classify(makeRawItem())
      expect(result.ticker).toBe('')
      expect(mockCreate).toHaveBeenCalledTimes(1)
    }
  })

  test('[RETRY — 429 retentável] reentrega e tem sucesso na 3ª', async () => {
    const rl = Object.assign(new Error('rate limited'), { status: 429 })
    mockCreate
      .mockRejectedValueOnce(rl)
      .mockRejectedValueOnce(rl)
      .mockResolvedValue(sonnetsResponse({ ticker: 'REG3', sentiment: 0.2, impactCategory: 'INSTITUCIONAL', relevance: 0.4 }))

    const result = await classifier.classify(makeRawItem())
    expect(result.ticker).toBe('REG3')
    expect(mockCreate).toHaveBeenCalledTimes(3)
  }, 10_000)

  test('[RETRY — 503 retentável] reentrega até 3x e cai no fallback', async () => {
    const { logger } = require('../../utils/logger')
    const err = Object.assign(new Error('service unavailable'), { status: 503 })
    mockCreate.mockRejectedValue(err)

    const result = await classifier.classify(makeRawItem())
    expect(result.ticker).toBe('')
    expect(mockCreate).toHaveBeenCalledTimes(3)
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('SYS_002'))
  }, 10_000)

  test('[RETRY — erro sem status e sem nome de conexão] trata como bug e falha rápido', async () => {
    // TypeError/bug local não melhora ao repetir; não deve ser mascarado como rede.
    mockCreate.mockRejectedValue(new TypeError('cannot read property of undefined'))

    const result = await classifier.classify(makeRawItem())
    expect(result.ticker).toBe('')
    expect(mockCreate).toHaveBeenCalledTimes(1) // sem retry
  })

  test('[RETRY — 429 respeita retry-after-ms do header] usa o atraso do servidor', async () => {
    const err = Object.assign(new Error('rate limited'), {
      status: 429,
      headers: { 'retry-after-ms': '50' },
    })
    mockCreate
      .mockRejectedValueOnce(err)
      .mockResolvedValue(sonnetsResponse({ ticker: 'URU3', sentiment: 0.1, impactCategory: 'INSTITUCIONAL', relevance: 0.3 }))

    const start = Date.now()
    const result = await classifier.classify(makeRawItem())
    const elapsed = Date.now() - start

    expect(result.ticker).toBe('URU3')
    expect(mockCreate).toHaveBeenCalledTimes(2)
    // Atraso do header (50ms) << backoff base (1000ms): prova que retry-after foi usado.
    expect(elapsed).toBeLessThan(800)
  })

  test('[SUCCESS] sentiment clampado para [-1, 1]', async () => {
    mockCreate.mockResolvedValue(sonnetsResponse({
      ticker: 'GRM', sentiment: 1.5, impactCategory: 'RESULTADO_ESPORTIVO', relevance: 0.5,
    }))

    const result = await classifier.classify(makeRawItem())
    expect(result.sentiment).toBeLessThanOrEqual(1)
    expect(result.sentiment).toBeGreaterThanOrEqual(-1)
  })

  test('[SUCCESS] relevance clampada para [0, 1]', async () => {
    mockCreate.mockResolvedValue(sonnetsResponse({
      ticker: 'INT', sentiment: 0.3, impactCategory: 'CONTRATACAO', relevance: 2.0,
    }))

    const result = await classifier.classify(makeRawItem())
    expect(result.relevance).toBeLessThanOrEqual(1)
    expect(result.relevance).toBeGreaterThanOrEqual(0)
  })

  test('[EDGE — content type !== text] ternário retorna string vazia → fallback', async () => {
    // Sonnet retorna bloco do tipo 'tool_use' em vez de 'text'
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
    mockCreate.mockResolvedValue(sonnetsResponse({
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
    await (redis as any).del('news:sonnet:tokens')

    mockCreate.mockResolvedValue(sonnetsResponse({
      ticker: 'URU3', sentiment: 0.5, impactCategory: 'RESULTADO_ESPORTIVO', relevance: 0.8,
    }))

    const result = await classifier.classify(makeRawItem())
    expect(result.ticker).toBe('URU3')
    // Chave criada com 60 e depois decrementada em 1 = 59
    const tokens = await (redis as any).get('news:sonnet:tokens')
    expect(parseInt(tokens)).toBe(59)
  })

  test('[INFRA] startClassifying processa item da fila e para ao stopClassifying', async () => {
    const mockPublisher = { publish: jest.fn().mockResolvedValue(undefined) }
    const item = makeRawItem()

    mockCreate.mockResolvedValue(sonnetsResponse({
      ticker: 'REG3', sentiment: 0.6, impactCategory: 'RESULTADO_ESPORTIVO', relevance: 0.7,
    }))

    // Esvaziar a fila, depois enfileirar 1 item
    while (!newsQueue.isEmpty()) newsQueue.dequeue()
    newsQueue.enqueue(item)

    // stopClassifying após 50ms (antes do sleep de 500ms terminar)
    setTimeout(() => classifier.stopClassifying(), 50)

    await classifier.startClassifying(mockPublisher as any)

    expect(mockPublisher.publish).toHaveBeenCalledTimes(1)
    expect(mockPublisher.publish).toHaveBeenCalledWith(item, expect.objectContaining({ ticker: 'REG3' }))
  }, 5000)

  test('[DEGRADED — RateLimitError no worker] re-enfileira item e loga RATE_001', async () => {
    const { logger } = require('../../utils/logger')
    const mockPublisher = { publish: jest.fn() }
    const item = makeRawItem()

    // Zerar tokens para forçar RateLimitError
    await (redis as any).set('news:sonnet:tokens', 0)

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

    mockCreate.mockResolvedValue(sonnetsResponse({
      ticker: 'FLU', sentiment: -0.3, impactCategory: 'LESAO', relevance: 0.5,
    }))

    while (!newsQueue.isEmpty()) newsQueue.dequeue()
    newsQueue.enqueue(item)

    setTimeout(() => classifier.stopClassifying(), 50)

    await classifier.startClassifying(mockPublisher as any)

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('publisher crash'))
  }, 5000)

  // -------------------------------------------------------------------------
  // Prompt caching / gate de 1024 tokens / instrumentação
  // -------------------------------------------------------------------------

  test('[CACHE — gate fail-closed] sem countTokens no SDK, cache não é habilitado (sem cache_control)', async () => {
    // O mock do SDK não expõe messages.countTokens → probe falha → cacheEligible=false.
    mockCreate.mockResolvedValue(sonnetsResponse({
      ticker: 'URU3', sentiment: 0.5, impactCategory: 'RESULTADO_ESPORTIVO', relevance: 0.8,
    }))

    await classifier.classify(makeRawItem())

    const params = mockCreate.mock.calls[0][0]
    // Não há system: tudo no papel user. Bloco estático é o primeiro content.
    expect(params.system).toBeUndefined()
    const staticBlock = params.messages[0].content[0]
    expect(staticBlock.cache_control).toBeUndefined()
  })

  test('[SPLIT] formato split mantém papel user com prefixo estático + notícia em blocos', async () => {
    mockCreate.mockResolvedValue(sonnetsResponse({
      ticker: 'URU3', sentiment: 0.5, impactCategory: 'RESULTADO_ESPORTIVO', relevance: 0.8,
    }))

    await classifier.classify(makeRawItem())

    const params = mockCreate.mock.calls[0][0]
    // Nada migra para system — preserva a semântica do legacy one-shot.
    expect(params.system).toBeUndefined()
    expect(params.messages[0].role).toBe('user')
    const content = params.messages[0].content
    expect(Array.isArray(content)).toBe(true)
    expect(content).toHaveLength(2)
    // Bloco 0 = prefixo estático cacheável; bloco 1 = notícia dinâmica.
    expect(content[0].text).toContain('classificador de notícias')
    expect(content[0].text).not.toContain('Flamengo vence Palmeiras')
    expect(content[1].text).toContain('Flamengo vence Palmeiras')
  })

  test('[CACHE — elegível] countTokens >= margem habilita cache_control no bloco estático', async () => {
    // Injeta countTokens no mock do SDK retornando acima da margem (1100).
    const anthropicInstance = (classifier as unknown as { anthropic: { messages: Record<string, unknown> } }).anthropic
    anthropicInstance.messages.countTokens = jest.fn().mockResolvedValue({ input_tokens: 1500 })

    mockCreate.mockResolvedValue(sonnetsResponse({
      ticker: 'URU3', sentiment: 0.5, impactCategory: 'RESULTADO_ESPORTIVO', relevance: 0.8,
    }))

    await classifier.classify(makeRawItem())

    const params = mockCreate.mock.calls[0][0]
    const staticBlock = params.messages[0].content[0]
    expect(staticBlock.cache_control).toBeDefined()
    expect(staticBlock.cache_control.type).toBe('ephemeral')
    // Default cacheMode = 1h → ttl '1h'.
    expect(staticBlock.cache_control.ttl).toBe('1h')
    // O bloco da notícia (dinâmico) NÃO é cacheado.
    expect(params.messages[0].content[1].cache_control).toBeUndefined()
  })

  test('[CACHE — abaixo da margem] countTokens < 1100 NÃO habilita cache (gate)', async () => {
    const anthropicInstance = (classifier as unknown as { anthropic: { messages: Record<string, unknown> } }).anthropic
    anthropicInstance.messages.countTokens = jest.fn().mockResolvedValue({ input_tokens: 800 })

    mockCreate.mockResolvedValue(sonnetsResponse({
      ticker: 'URU3', sentiment: 0.5, impactCategory: 'RESULTADO_ESPORTIVO', relevance: 0.8,
    }))

    await classifier.classify(makeRawItem())

    const params = mockCreate.mock.calls[0][0]
    expect(params.messages[0].content[0].cache_control).toBeUndefined()
  })

  test('[LEGACY] NEWS_CLASSIFIER_PROMPT_FORMAT=legacy usa string única no user, sem system', async () => {
    const prev = process.env.NEWS_CLASSIFIER_PROMPT_FORMAT
    process.env.NEWS_CLASSIFIER_PROMPT_FORMAT = 'legacy'
    try {
      const legacyClassifier = new NewsClassifier(redis)
      mockCreate.mockResolvedValue(sonnetsResponse({
        ticker: 'URU3', sentiment: 0.5, impactCategory: 'RESULTADO_ESPORTIVO', relevance: 0.8,
      }))

      await legacyClassifier.classify(makeRawItem())

      const params = mockCreate.mock.calls[0][0]
      expect(params.system).toBeUndefined()
      expect(typeof params.messages[0].content).toBe('string')
      expect(params.messages[0].content).toContain('Flamengo vence Palmeiras')
    } finally {
      if (prev === undefined) delete process.env.NEWS_CLASSIFIER_PROMPT_FORMAT
      else process.env.NEWS_CLASSIFIER_PROMPT_FORMAT = prev
    }
  })

  test('[METRICS] loga linha estruturada com tokens de cache quando presentes no usage', async () => {
    const { logger } = require('../../utils/logger')
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ ticker: 'URU3', sentiment: 0.1, impactCategory: 'INSTITUCIONAL', relevance: 0.2 }) }],
      usage: { input_tokens: 12, output_tokens: 34, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
    })

    await classifier.classify(makeRawItem())

    const metricLine = logger.info.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .find((s: string) => s.includes('news_classifier_anthropic_call'))
    expect(metricLine).toBeDefined()
    expect(metricLine).toContain('"cache_read_input_tokens":900')
    expect(metricLine).toContain('"cache_hit":true')
  })
})
