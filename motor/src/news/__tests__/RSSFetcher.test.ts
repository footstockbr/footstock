// ============================================================================
// Testes — RSSFetcher
// Rastreabilidade: INT-046, INT-048, INT-128
// ============================================================================

import RedisMock from 'ioredis-mock'
import type Redis from 'ioredis'
import { RSSFetcher } from '../RSSFetcher'
import { NewsQueue, newsQueue } from '../NewsQueue'
import { FallbackPool } from '../FallbackPool'
import { logger } from '../../utils/logger'

// ---------------------------------------------------------------------------
// Mock rss-parser (hoisted by jest)
// ---------------------------------------------------------------------------

const mockParseURL = jest.fn()
jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: mockParseURL,
  }))
})

// ---------------------------------------------------------------------------
// Mock logger (jest.mock is hoisted, so the import above receives the mock)
// ---------------------------------------------------------------------------

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

const mockedLogger = logger as jest.Mocked<typeof logger>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeItem = (i: number) => ({
  link: `https://feed.com/noticia/${i}`,
  title: `Notícia ${i}`,
  contentSnippet: `Descrição ${i}`,
  pubDate: new Date().toISOString(),
})

describe('RSSFetcher', () => {
  let redis: Redis
  let fetcher: RSSFetcher

  beforeEach(() => {
    redis = new RedisMock() as unknown as Redis
    fetcher = new RSSFetcher(redis)
    // Esvaziar a fila antes de cada teste
    while (!newsQueue.isEmpty()) newsQueue.dequeue()
    mockParseURL.mockReset()
    jest.spyOn(FallbackPool, 'isActivated').mockResolvedValue(false)
    jest.spyOn(FallbackPool, 'getRandom').mockReturnValue([
      { url: 'https://fallback.com/1', title: 'Fallback 1', source: 'ESPN Brasil', publishedAt: new Date().toISOString() },
    ])
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('[SUCCESS] fetchAll enfileira novos itens e retorna count > 0', async () => {
    mockParseURL.mockResolvedValue({ items: [makeItem(1), makeItem(2)] })

    const count = await fetcher.fetchAll()
    expect(count).toBeGreaterThan(0)
    expect(newsQueue.size()).toBeGreaterThan(0)
  })

  test('[SUCCESS — Deduplicação] URL duplicada não é enfileirada', async () => {
    const url = 'https://feed.com/noticia/dup'
    await (redis as unknown as { sadd: (key: string, value: string) => Promise<number> }).sadd('news:urls', url)

    mockParseURL.mockResolvedValue({
      items: [{ link: url, title: 'Duplicata', pubDate: new Date().toISOString() }],
    })

    const count = await fetcher.fetchAll()
    // Todos os 3 feeds retornam o mesmo item duplicado
    expect(count).toBe(0)
    expect(newsQueue.size()).toBe(0)
  })

  test('[ERROR — Feed com 503] retry exponencial e SYS_001 após 3 falhas', async () => {
    mockParseURL.mockRejectedValue(new Error('HTTP 503'))

    const count = await fetcher.fetchAll()
    expect(count).toBe(0)
    expect(mockedLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('SYS_001')
    )
  }, 15_000) // retry delay = 1+2+4s

  test('[ERROR — Fallback ativado quando count=0]', async () => {
    mockParseURL.mockResolvedValue({ items: [] });
    (FallbackPool.isActivated as jest.Mock).mockResolvedValue(true)

    await fetcher.fetchAll()
    expect(FallbackPool.getRandom).toHaveBeenCalled()
    expect(newsQueue.size()).toBeGreaterThan(0)
  })

  test('[EDGE — Fila cheia] item descartado e não marcado como processado', async () => {
    // Encher a fila
    for (let i = 0; i < NewsQueue.MAX_SIZE; i++) {
      newsQueue.enqueue({ url: `http://existing${i}.com`, title: `T${i}`, source: 'Lance!', publishedAt: new Date().toISOString() })
    }

    mockParseURL.mockResolvedValue({ items: [makeItem(999)] })

    await fetcher.fetchAll()
    expect(mockedLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Fila cheia'))
  })

  test('[DEGRADED — Redis offline em isDuplicate] retorna false e item enfileirado', async () => {
    const brokenRedis = {
      sismember: jest.fn().mockRejectedValue(new Error('Redis offline')),
      sadd: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
    } as unknown as Redis

    const fetcherBroken = new RSSFetcher(brokenRedis)
    mockParseURL.mockResolvedValue({ items: [makeItem(42)] })

    const count = await fetcherBroken.fetchAll()
    expect(count).toBeGreaterThan(0)
  })

  test('[INFRA — setInterval] start configura interval e stop limpa', () => {
    jest.useFakeTimers()
    const setIntervalSpy = jest.spyOn(global, 'setInterval')
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval')

    fetcher.start()
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000)

    fetcher.stop()
    expect(clearIntervalSpy).toHaveBeenCalled()

    jest.useRealTimers()
  })

  test('[INFRA — stop sem interval] stop sem start não lança erro', () => {
    // Nenhum start() chamado — _interval é null
    expect(() => fetcher.stop()).not.toThrow()
  })

  test('[ERROR — fetchFeed rejeitado inesperadamente] resultado rejected no allSettled é tratado', async () => {
    // Forçar fetchFeed a rejeitar (ignora o retry interno)
    jest.spyOn(fetcher as unknown as Record<string, jest.Mock>, 'fetchFeed').mockRejectedValue(new Error('unexpected rejection'))

    const count = await fetcher.fetchAll()
    expect(count).toBe(0)
    expect(mockedLogger.error).toHaveBeenCalledWith(expect.stringContaining('rejeitado'))
  })

  test('[INFRA — catch no interval] erro em fetchAll é capturado pelo start', async () => {
    jest.useFakeTimers()

    jest.spyOn(fetcher as unknown as Record<string, jest.Mock>, 'fetchAll').mockRejectedValue(new Error('fetchAll crash'))
    fetcher.start()

    // Disparar exatamente um tick do intervalo
    jest.advanceTimersByTime(5 * 60 * 1000)

    // Aguardar microtasks (a Promise rejection precisa ser processada)
    await Promise.resolve()
    await Promise.resolve()

    fetcher.stop()
    jest.useRealTimers()

    expect(mockedLogger.error).toHaveBeenCalledWith(
      '[RSS] Erro não capturado no ciclo:',
      expect.any(Error)
    )
  })
})
