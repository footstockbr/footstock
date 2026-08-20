// ============================================================================
// Testes — NewsQueue.drain (T-13: nao perder noticia enfileirada em shutdown)
// Rastreabilidade: INT-046, T-13
// ============================================================================

import { NewsQueue, type RawNewsItem } from '../NewsQueue'

jest.mock('../news-dedup', () => ({
  unmarkAsProcessed: jest.fn(),
}))

import { unmarkAsProcessed } from '../news-dedup'

const mockUnmark = unmarkAsProcessed as jest.MockedFunction<typeof unmarkAsProcessed>

const makeItem = (url: string, title?: string): RawNewsItem => ({
  url,
  title: title ?? `Notícia ${url}`,
  source: 'ESPN Brasil',
  publishedAt: new Date().toISOString(),
})

const makeMockRedis = () =>
  ({
    srem: jest.fn().mockResolvedValue(1),
    sadd: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  }) as unknown as import('ioredis').Redis

describe('NewsQueue.drain', () => {
  let queue: NewsQueue

  beforeEach(() => {
    queue = new NewsQueue()
    jest.clearAllMocks()
  })

  test('[SUCCESS] drain com 3 itens retorna drained=3, unmarked=3 e fila vazia', async () => {
    const redis = makeMockRedis()
    mockUnmark.mockResolvedValue(true)

    queue.enqueue(makeItem('http://a.com', 'Titulo A'))
    queue.enqueue(makeItem('http://b.com', 'Titulo B'))
    queue.enqueue(makeItem('http://c.com', 'Titulo C'))

    const result = await queue.drain(redis)

    expect(result.drained).toBe(3)
    expect(result.unmarked).toBe(3)
    expect(queue.isEmpty()).toBe(true)
    expect(mockUnmark).toHaveBeenCalledTimes(3)
    expect(mockUnmark).toHaveBeenCalledWith(redis, 'http://a.com', 'Titulo A')
    expect(mockUnmark).toHaveBeenCalledWith(redis, 'http://b.com', 'Titulo B')
    expect(mockUnmark).toHaveBeenCalledWith(redis, 'http://c.com', 'Titulo C')
  })

  test('[EDGE] drain com fila vazia retorna drained=0, unmarked=0 sem chamar srem', async () => {
    const redis = makeMockRedis()

    const result = await queue.drain(redis)

    expect(result.drained).toBe(0)
    expect(result.unmarked).toBe(0)
    expect(queue.isEmpty()).toBe(true)
    expect(mockUnmark).not.toHaveBeenCalled()
  })

  test('[ERROR — Redis falhando] drain e best-effort: unmarkAsProcessed retorna false, nao lanca', async () => {
    const redis = makeMockRedis()
    // unmarkAsProcessed e best-effort internamente (try/catch em news-dedup.ts):
    // Redis indisponivel retorna false, nao lanca excecao.
    mockUnmark.mockResolvedValue(false)

    queue.enqueue(makeItem('http://a.com'))
    queue.enqueue(makeItem('http://b.com'))

    const result = await queue.drain(redis)

    expect(result.drained).toBe(2)
    expect(result.unmarked).toBe(0)
    expect(queue.isEmpty()).toBe(true)
  })

  test('[EDGE] drain com partial failure: alguns itens unmarked, outros nao', async () => {
    const redis = makeMockRedis()
    mockUnmark
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    queue.enqueue(makeItem('http://a.com'))
    queue.enqueue(makeItem('http://b.com'))
    queue.enqueue(makeItem('http://c.com'))

    const result = await queue.drain(redis)

    expect(result.drained).toBe(3)
    expect(result.unmarked).toBe(2)
    expect(queue.isEmpty()).toBe(true)
  })
})
