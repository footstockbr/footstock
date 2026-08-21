/**
 * @jest-environment node
 */
// ============================================================================
// T-10 (item 011 do loop 08-18-foot-stock-motor-noticias-analise) —
// as quatro fixtures do aceite, atravessando as DUAS camadas que produzem a
// coluna `content` de `news`: a ingestão (`RSSFetcher.fetchFeed`) e a
// persistência (`NewsPublisher.publish` -> `rowData`).
//
// Arquivo separado de propósito: `NewsPublisher.test.ts` está sujo com
// trabalho alheio (M067) no working tree, e tocá-lo sequestraria esse trabalho
// para dentro do commit desta task.
//
// Classes degeneradas medidas em produção por T-01 (2026-08-19): `'null'`
// (2003 linhas, ESPN Brasil) e `''` (427 linhas, O Gol, produtor ATIVO).
// ============================================================================

import RedisMock from 'ioredis-mock'
import type Redis from 'ioredis'
import { RSSFetcher } from '../RSSFetcher'
import { newsQueue, type RawNewsItem } from '../NewsQueue'
import { NewsPublisher } from '../NewsPublisher'
import { ImpactCategory } from '../types'
import type { ClassifiedNews } from '../NewsClassifier'
import { logger } from '../../utils/logger'

const mockParseURL = jest.fn()
jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({ parseURL: mockParseURL }))
})

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

const mockNewsCreate = jest.fn()
const mockNewsUpdate = jest.fn()
const mockNewsUpdateMany = jest.fn()
const mockAssetFindUnique = jest.fn()
const mockTransaction = jest.fn()

jest.mock('@prisma/client', () => {
  const actual = jest.requireActual('@prisma/client')
  return {
    ...actual,
    PrismaClient: jest.fn().mockImplementation(() => ({
      news: { create: mockNewsCreate, update: mockNewsUpdate, updateMany: mockNewsUpdateMany },
      asset: { findUnique: mockAssetFindUnique },
      $transaction: mockTransaction,
    })),
  }
})

const mockedLogger = logger as jest.Mocked<typeof logger>

/** Entradas do aceite, na ordem em que a task as enumera. */
const DEGENERATE_DESCRIPTIONS: ReadonlyArray<[rotulo: string, valor: unknown]> = [
  ['ausente', undefined],
  ['vazia', ''],
  ['só com tags', '<p>&nbsp;</p>'],
  ['com o texto literal null', 'null'],
]

const structuredLogs = (channel: 'info' | 'warn' | 'error') =>
  (mockedLogger[channel] as jest.Mock).mock.calls
    .map(call => {
      try {
        return JSON.parse(call[0] as string)
      } catch {
        return null
      }
    })
    .filter((entry: unknown): entry is Record<string, unknown> => entry !== null)

// ---------------------------------------------------------------------------
// Camada 1 — ingestão
// ---------------------------------------------------------------------------

describe('RSSFetcher.fetchFeed - fallback de description', () => {
  let fetcher: RSSFetcher

  beforeEach(() => {
    const redis = new RedisMock() as unknown as Redis
    fetcher = new RSSFetcher(redis)
    while (!newsQueue.isEmpty()) newsQueue.dequeue()
    mockParseURL.mockReset()
    mockedLogger.warn.mockClear()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  /** Drena a fila devolvendo os itens indexados por título. */
  const drainByTitle = (): Map<string, RawNewsItem> => {
    const found = new Map<string, RawNewsItem>()
    while (!newsQueue.isEmpty()) {
      const item = newsQueue.dequeue()
      if (item) found.set(item.title, item)
    }
    return found
  }

  test('as quatro classes degeneradas viram description undefined', async () => {
    mockParseURL.mockResolvedValue({
      items: DEGENERATE_DESCRIPTIONS.map(([rotulo, valor], i) => ({
        link: `https://feed.com/t10/degenerada/${i}`,
        title: `Degenerada ${rotulo}`,
        contentSnippet: valor,
        pubDate: new Date().toISOString(),
      })),
    })

    await fetcher.fetchAll()
    const found = drainByTitle()

    for (const [rotulo] of DEGENERATE_DESCRIPTIONS) {
      const item = found.get(`Degenerada ${rotulo}`)
      expect(item).toBeDefined()
      expect(item?.description).toBeUndefined()
    }
  })

  test('description real sobrevive ao guard', async () => {
    mockParseURL.mockResolvedValue({
      items: [
        {
          link: 'https://feed.com/t10/real',
          title: 'Descricao real preservada',
          contentSnippet: 'Descricao real',
          pubDate: new Date().toISOString(),
        },
      ],
    })

    await fetcher.fetchAll()
    const item = drainByTitle().get('Descricao real preservada')
    expect(item?.description).toBe('Descricao real')
  })

  test('item de titulo degenerado e descartado e o descarte e logado', async () => {
    mockParseURL.mockResolvedValue({
      items: [
        {
          link: 'https://feed.com/t10/titulo-degenerado',
          title: 'null',
          contentSnippet: '',
          pubDate: new Date().toISOString(),
        },
      ],
    })

    await fetcher.fetchAll()

    expect(newsQueue.isEmpty()).toBe(true)
    const descartes = structuredLogs('warn').filter(
      entry => entry.event === 'news_rss_degenerate_title'
    )
    expect(descartes.length).toBeGreaterThan(0)
    expect(descartes[0]).toEqual(
      expect.objectContaining({
        event: 'news_rss_degenerate_title',
        url: 'https://feed.com/t10/titulo-degenerado',
        rawTitle: 'null',
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Camada 2 — persistência
// ---------------------------------------------------------------------------

describe('NewsPublisher - conteudo nunca degenerado', () => {
  let publisher: NewsPublisher

  const makeRaw = (overrides: Partial<RawNewsItem> = {}): RawNewsItem => ({
    url: 'https://espnbrasil.com/t10',
    title: 'Flamengo vence',
    source: 'ESPN Brasil',
    publishedAt: new Date('2026-08-19T12:00:00.000Z').toISOString(),
    ...overrides,
  })

  const makeClassified = (): ClassifiedNews => ({
    ticker: 'FLM',
    sentiment: 0.8,
    impactCategory: ImpactCategory.ESPORTIVA_MAJORITARIA,
    relevance: 0.9,
    teams: [{ ticker: 'FLM', sentiment: 0.8, confidence: 0.9, rank: 0, origin: 'classifier' }],
  })

  /** `content` do último INSERT em `news`. */
  const lastContent = (): unknown =>
    (mockNewsCreate.mock.calls.at(-1)?.[0] as { data: Record<string, unknown> }).data.content

  beforeEach(() => {
    const redis = new RedisMock() as unknown as Redis
    redis.publish = jest.fn().mockResolvedValue(1) as unknown as Redis['publish']
    const { PrismaClient } = require('@prisma/client')
    publisher = new NewsPublisher(new PrismaClient(), redis)

    mockNewsCreate.mockReset()
    mockNewsUpdate.mockReset()
    mockNewsUpdateMany.mockReset()
    mockAssetFindUnique.mockReset()
    mockTransaction.mockReset()
    mockedLogger.error.mockClear()

    let idSeq = 0
    mockNewsCreate.mockImplementation(async () => ({ id: `news-id-${++idSeq}` }))
    mockNewsUpdate.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id }))
    mockNewsUpdateMany.mockImplementation(async () => ({ count: 1 }))
    mockAssetFindUnique.mockImplementation(async ({ where }: { where: { ticker: string } }) => ({
      id: `asset-uuid-${where.ticker}`,
    }))
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ news: { create: mockNewsCreate, update: mockNewsUpdate } })
    )
  })

  test.each(DEGENERATE_DESCRIPTIONS)(
    'description %s grava content igual ao titulo',
    async (_rotulo, valor) => {
      await publisher.publish(
        makeRaw({ description: valor as string | undefined }),
        makeClassified()
      )

      const content = lastContent()
      expect(content).toBe('Flamengo vence')
      expect(content).not.toBe('')
      expect(content).not.toBe('null')
      expect(content).not.toBe('undefined')
    }
  )

  test('description real e gravada como veio', async () => {
    await publisher.publish(
      makeRaw({ description: 'Vitoria por 3 a 0 no Maracana' }),
      makeClassified()
    )
    expect(lastContent()).toBe('Vitoria por 3 a 0 no Maracana')
  })

  test('description E titulo degenerados: cai no titulo cru e e barulhento', async () => {
    // Terceiro ramo (decisão 6). Inalcançável pelo pipeline atual — o filtro de
    // `fetchFeed` já barra título degenerado — mas exercitado aqui para cobrir a
    // branch e provar que o caminho loga em vez de gravar em silêncio.
    await publisher.publish(makeRaw({ title: 'null', description: '' }), makeClassified())

    expect(lastContent()).toBe('null')
    const alertas = structuredLogs('error').filter(
      entry => entry.event === 'news_content_degenerate_at_publisher'
    )
    expect(alertas.length).toBe(1)
    expect(alertas[0]).toEqual(
      expect.objectContaining({
        event: 'news_content_degenerate_at_publisher',
        url: 'https://espnbrasil.com/t10',
        source: 'ESPN Brasil',
      })
    )
  })
})
