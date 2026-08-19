// ============================================================================
// Testes — NewsPipelineLifecycle
// Rastreabilidade: T-07
// ============================================================================

import RedisMock from 'ioredis-mock'
import type Redis from 'ioredis'
import { startNewsPipeline, stopNewsPipeline } from '../NewsPipelineLifecycle'
import { RSSFetcher } from '../RSSFetcher'
import { NewsClassifier } from '../NewsClassifier'
import { newsQueue } from '../NewsQueue'

jest.mock('../RSSFetcher')
jest.mock('../NewsClassifier')
jest.mock('../NewsPublisher')
jest.mock('../NewsLlmRuntimeConfigService')
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $disconnect: jest.fn().mockResolvedValue(undefined),
  })),
}))
jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation(() => ({})),
}))
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

describe('NewsPipelineLifecycle', () => {
  let redis: Redis

  beforeEach(() => {
    redis = new RedisMock() as unknown as Redis
    while (!newsQueue.isEmpty()) newsQueue.dequeue()
    ;(RSSFetcher as unknown as jest.Mock).mockImplementation(() => ({
      start: jest.fn(),
      stop: jest.fn(),
      fetchAll: jest.fn().mockResolvedValue(0),
    }))
    ;(NewsClassifier as unknown as jest.Mock).mockImplementation(() => ({
      startClassifying: jest.fn().mockResolvedValue(undefined),
      stopClassifying: jest.fn(),
    }))
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('[SUCCESS] startNewsPipeline cria fetcher e classifier e inicia ambos', async () => {
    const pipeline = await startNewsPipeline(redis)
    expect(pipeline.rssFetcher).toBeDefined()
    expect(pipeline.newsClassifier).toBeDefined()
    expect(pipeline.rssFetcher.start).toHaveBeenCalled()
    expect(pipeline.newsClassifier.startClassifying).toHaveBeenCalled()
  })

  test('[SUCCESS — T-07] stopNewsPipeline para fetcher e classifier', async () => {
    const pipeline = await startNewsPipeline(redis)
    stopNewsPipeline(pipeline)
    expect(pipeline.rssFetcher.stop).toHaveBeenCalled()
    expect(pipeline.newsClassifier.stopClassifying).toHaveBeenCalled()
  })

  test('[SUCCESS — T-07] stopNewsPipeline com null e no-op', () => {
    expect(() => stopNewsPipeline(null)).not.toThrow()
  })
})
