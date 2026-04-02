/**
 * @jest-environment node
 */
// ============================================================================
// Testes — NewsPublisher
// Rastreabilidade: INT-046
// ============================================================================

import RedisMock from 'ioredis-mock'
import type Redis from 'ioredis'
import { NewsPublisher } from '../NewsPublisher'
import { validateNewsInjectPayload } from '../../contracts/news-inject-contract'
import type { RawNewsItem } from '../NewsQueue'
import type { ClassifiedNews } from '../NewsClassifier'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNewsCreate = jest.fn()
const mockPublish = jest.fn()

jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client')
  return {
    ...actual,
    PrismaClient: jest.fn().mockImplementation(() => ({
      news: { create: mockNewsCreate },
    })),
    ImpactCategory: actual.ImpactCategory ?? {
      RESULTADO_ESPORTIVO: 'RESULTADO_ESPORTIVO',
      CONTRATACAO: 'CONTRATACAO',
      FINANCEIRO: 'FINANCEIRO',
      LESAO: 'LESAO',
      SUSPENSAO: 'SUSPENSAO',
      INSTITUCIONAL: 'INSTITUCIONAL',
    },
  }
})

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRaw = (): RawNewsItem => ({
  url: 'https://espnbrasil.com/1',
  title: 'Flamengo vence',
  source: 'ESPN Brasil',
  publishedAt: new Date().toISOString(),
})

const makeClassified = (overrides: Partial<ClassifiedNews> = {}): ClassifiedNews => ({
  ticker: 'FLM',
  sentiment: 0.8,
  impactCategory: 'RESULTADO_ESPORTIVO',
  relevance: 0.9,
  ...overrides,
})

describe('NewsPublisher', () => {
  let redis: Redis
  let publisher: NewsPublisher

  beforeEach(() => {
    redis = new RedisMock() as unknown as Redis
    jest.spyOn(redis, 'publish').mockImplementation(mockPublish)
    const { PrismaClient } = require('@prisma/client')
    publisher = new NewsPublisher(new PrismaClient(), redis)

    mockNewsCreate.mockReset()
    mockPublish.mockReset()
    mockNewsCreate.mockResolvedValue({ id: 'uuid-test-123' })
    mockPublish.mockResolvedValue(1)
  })

  test('[SUCCESS — Notícia relevante] DB + Redis + audit criados', async () => {
    await publisher.publish(makeRaw(), makeClassified())

    expect(mockNewsCreate).toHaveBeenCalledTimes(1)
    expect(mockPublish).toHaveBeenCalledTimes(1)

    const publishedPayload = JSON.parse(mockPublish.mock.calls[0][1])
    expect(publishedPayload.type).toBe('NEWS')
    expect(publishedPayload.assetId).toBe('FLM')
  })

  test('[SUCCESS — Notícia irrelevante] apenas DB, sem Redis', async () => {
    await publisher.publish(makeRaw(), makeClassified({ relevance: 0.2 }))

    expect(mockNewsCreate).toHaveBeenCalledTimes(1)
    expect(mockPublish).not.toHaveBeenCalled()
  })

  test('[EDGE — Ticker vazio] apenas DB, sem Redis', async () => {
    await publisher.publish(makeRaw(), makeClassified({ ticker: '', relevance: 0.9 }))

    expect(mockNewsCreate).toHaveBeenCalledTimes(1)
    expect(mockPublish).not.toHaveBeenCalled()
  })

  test('[ERROR — DB falha] não publica no Redis, sem exceção propagada', async () => {
    const { logger } = require('../../utils/logger')
    mockNewsCreate.mockRejectedValue(new Error('DB Error'))

    await expect(publisher.publish(makeRaw(), makeClassified())).resolves.toBeUndefined()
    expect(mockPublish).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Erro ao salvar no DB'))
  })

  test('[DEGRADED — Redis falha após DB salvo] sem exceção propagada', async () => {
    const { logger } = require('../../utils/logger')
    mockPublish.mockRejectedValue(new Error('Redis Error'))

    await expect(publisher.publish(makeRaw(), makeClassified())).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Erro ao publicar no Redis'))
    expect(mockNewsCreate).toHaveBeenCalledTimes(1) // DB salvo
  })

  test('[INFRA] payload Redis tem formato NewsInjectEvent válido', async () => {
    await publisher.publish(makeRaw(), makeClassified())

    expect(mockPublish).toHaveBeenCalled()
    const event = JSON.parse(mockPublish.mock.calls[0][1])
    expect(event).toMatchObject({
      type: 'NEWS',
      assetId: expect.any(String),
      impact: expect.any(String),
      magnitude: expect.any(Number),
      durationTicks: expect.any(Number),
    })
  })
})
