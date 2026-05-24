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
const mockAssetFindUnique = jest.fn()
const mockPublish = jest.fn()

jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client')
  return {
    ...actual,
    PrismaClient: jest.fn().mockImplementation(() => ({
      news: { create: mockNewsCreate },
      asset: { findUnique: mockAssetFindUnique },
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
    mockAssetFindUnique.mockReset()
    mockPublish.mockReset()

    mockNewsCreate.mockResolvedValue({ id: 'uuid-test-123' })
    mockAssetFindUnique.mockResolvedValue({ id: 'asset-uuid-123' })
    mockPublish.mockResolvedValue(1)
  })

  // -------------------------------------------------------------------------
  // Caminhos de sucesso
  // -------------------------------------------------------------------------

  test('[SUCCESS — Notícia relevante] DB + Redis criados com ticker e assetId corretos', async () => {
    await publisher.publish(makeRaw(), makeClassified())

    expect(mockAssetFindUnique).toHaveBeenCalledWith({
      where: { ticker: 'FLM' },
      select: { id: true },
    })
    expect(mockNewsCreate).toHaveBeenCalledTimes(1)
    expect(mockNewsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticker: 'FLM',
          assetIds: ['asset-uuid-123'],
        }),
      })
    )
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

  // -------------------------------------------------------------------------
  // Edge cases de ticker
  // -------------------------------------------------------------------------

  test('[EDGE — Ticker vazio] asset.findUnique nao chamado; assetIds vazio; sem Redis', async () => {
    await publisher.publish(makeRaw(), makeClassified({ ticker: '', relevance: 0.9 }))

    expect(mockAssetFindUnique).not.toHaveBeenCalled()
    expect(mockNewsCreate).toHaveBeenCalledTimes(1)
    expect(mockNewsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticker: null,
          assetIds: [],
        }),
      })
    )
    expect(mockPublish).not.toHaveBeenCalled()
  })

  test('[EDGE — Ticker resolvido mas Asset nao encontrado no banco] ticker gravado, assetIds vazio, warn emitido', async () => {
    const { logger } = require('../../utils/logger')
    mockAssetFindUnique.mockResolvedValue(null)

    await publisher.publish(makeRaw(), makeClassified())

    expect(mockAssetFindUnique).toHaveBeenCalledTimes(1)
    expect(mockNewsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticker: 'FLM',
          assetIds: [],
        }),
      })
    )
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("nao encontrado em assets")
    )
  })

  test('[EDGE — asset.findUnique lanca exception] nao cria News, nao publica Redis, loga erro', async () => {
    const { logger } = require('../../utils/logger')
    mockAssetFindUnique.mockRejectedValue(new Error('Asset DB Error'))

    await expect(publisher.publish(makeRaw(), makeClassified())).resolves.toBeUndefined()
    expect(mockNewsCreate).not.toHaveBeenCalled()
    expect(mockPublish).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Erro ao salvar no DB'))
  })

  // -------------------------------------------------------------------------
  // Caminhos de falha de infraestrutura
  // -------------------------------------------------------------------------

  test('[ERROR — DB falha no news.create] nao publica no Redis, sem excecao propagada', async () => {
    const { logger } = require('../../utils/logger')
    mockNewsCreate.mockRejectedValue(new Error('DB Error'))

    await expect(publisher.publish(makeRaw(), makeClassified())).resolves.toBeUndefined()
    expect(mockPublish).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Erro ao salvar no DB'))
  })

  test('[DEGRADED — Redis falha apos DB salvo] sem excecao propagada, DB preservado', async () => {
    const { logger } = require('../../utils/logger')
    mockPublish.mockRejectedValue(new Error('Redis Error'))

    await expect(publisher.publish(makeRaw(), makeClassified())).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Erro ao publicar no Redis'))
    expect(mockNewsCreate).toHaveBeenCalledTimes(1)
  })

  // -------------------------------------------------------------------------
  // Contrato de payload Redis
  // -------------------------------------------------------------------------

  test('[INFRA] payload Redis tem formato NewsInjectEvent valido', async () => {
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
