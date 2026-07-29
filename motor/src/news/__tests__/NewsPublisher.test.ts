/**
 * @jest-environment node
 */
// ============================================================================
// Testes — NewsPublisher
//
// Cobre o publisher legado (flag desligado) e o fan-out multi-time do item 013
// do loop 07-28-noticias-multi-time-linha-por-time.
//
// Critérios da seção 12 exercitados aqui: 1 (N linhas, mesmo grupo, ranks e
// published_at), 2 (falha em qualquer linha reverte o grupo inteiro), 3
// (magnitude absoluta idêntica, só o sinal difere), 4 (nenhum impacto elegível
// fica sem despacho), 17 e 27 (`correlationId = groupId`; em grupo unitário
// `groupId = newsId`), 36 (`sentimentClassifiedAt` gravado na própria escrita).
//
// O mock de Prisma simula DUAS coisas do banco real, sem as quais os critérios
// 1, 2 e 27 seriam tautológicos aqui:
//  (a) atomicidade de `$transaction` — o que foi escrito dentro do callback só
//      entra no "banco" no commit e é descartado quando o callback rejeita;
//  (b) o trigger `news_group_defaults_trg` da M067 — `group_id` recebe `id` e
//      `group_rank` recebe 0 quando o writer não os informa.
//
// Rastreabilidade: INT-046
// ============================================================================

import RedisMock from 'ioredis-mock'
import type Redis from 'ioredis'
import {
  NewsPublisher,
  NewsPersistenceError,
  NEWS_MULTI_TEAM_FLAG,
  isMultiTeamFanOutEnabled,
} from '../NewsPublisher'
import { ImpactCategory, IMPACT_MAGNITUDE } from '../types'
import { NEWS_IMPACT_DURATION_TICKS } from '../../contracts/news-inject-contract'
import type { RawNewsItem } from '../NewsQueue'
import type { ClassifiedNews, ClassifiedTeam } from '../NewsClassifier'

// ---------------------------------------------------------------------------
// "Banco" simulado
// ---------------------------------------------------------------------------

interface FakeRow {
  id: string
  ticker: string | null
  groupId: string
  groupRank: number
  publishedAt: Date
  sentiment: string
  impact: string
  content: string
  assetIds: string[]
  sentimentClassifiedAt?: Date
  impactDispatchedAt?: Date
  [key: string]: unknown
}

/** Linhas commitadas. Equivale à tabela `news` depois do COMMIT. */
let dbRows: FakeRow[] = []
/** Linhas escritas dentro da transação corrente, ainda não commitadas. */
let txScratch: FakeRow[] = []
let idSeq = 0
/** Relógio lógico para provar a ordem commit-antes-de-evento. */
let clock = 0
let committedAtTick: number | null = null
let publishTicks: number[] = []

const mockNewsCreate = jest.fn()
const mockNewsUpdate = jest.fn()
const mockNewsUpdateMany = jest.fn()
const mockAssetFindUnique = jest.fn()
const mockPublish = jest.fn()
const mockTransaction = jest.fn()

/** true enquanto o callback de `$transaction` está em voo. */
let inTransaction = false

/**
 * INSERT + trigger `news_group_defaults_trg` (M067 STEP 3).
 *
 * Fora de uma transação o INSERT faz AUTOCOMMIT, como no Postgres: a linha entra
 * em `dbRows` na hora. Isso é o que sustenta o caminho unitário (flag desligado),
 * que desde a decisão do operador de 2026-07-29 grava com `create` direto.
 */
const createImpl = async ({ data }: { data: Record<string, unknown> }) => {
  const id = `news-id-${++idSeq}`
  const row = {
    ...data,
    id,
    groupId: (data.groupId as string | undefined) ?? id,
    groupRank: (data.groupRank as number | undefined) ?? 0,
  } as unknown as FakeRow
  if (inTransaction) {
    txScratch.push(row)
  } else {
    dbRows.push(row) // AUTOCOMMIT
    committedAtTick = ++clock
  }
  return { id }
}

const updateImpl = async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
  const row =
    txScratch.find((candidate) => candidate.id === where.id) ??
    dbRows.find((candidate) => candidate.id === where.id)
  if (!row) throw new Error(`update em linha inexistente: ${where.id}`)
  Object.assign(row, data)
  return { id: row.id }
}

/**
 * UPDATE ... WHERE id IN (...) do marcador `impact_dispatched_at` (item 014).
 *
 * Roda FORA da transação de escrita, depois do commit — por isso mexe só em
 * `dbRows`. Um id ausente não é erro no Prisma (`updateMany` casa zero linhas e
 * devolve `count: 0`), e é assim que o mock se comporta.
 */
const updateManyImpl = async ({
  where,
  data,
}: {
  where: { id: { in: string[] } }
  data: Record<string, unknown>
}) => {
  const targets = dbRows.filter((row) => where.id.in.includes(row.id))
  for (const row of targets) Object.assign(row, data)
  return { count: targets.length }
}

const transactionImpl = async (fn: (tx: unknown) => Promise<unknown>) => {
  txScratch = []
  inTransaction = true
  try {
    const result = await fn({ news: { create: mockNewsCreate, update: mockNewsUpdate } })
    dbRows.push(...txScratch) // COMMIT
    txScratch = []
    committedAtTick = ++clock
    return result
  } catch (err) {
    txScratch = [] // ROLLBACK — nada do grupo sobrevive
    throw err
  } finally {
    inTransaction = false
  }
}

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

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRaw = (overrides: Partial<RawNewsItem> = {}): RawNewsItem => ({
  url: 'https://espnbrasil.com/1',
  title: 'Flamengo vence',
  source: 'ESPN Brasil',
  publishedAt: new Date('2026-07-28T12:00:00.000Z').toISOString(),
  ...overrides,
})

const makeTeam = (overrides: Partial<ClassifiedTeam> = {}): ClassifiedTeam => ({
  ticker: 'FLM',
  sentiment: 0.8,
  confidence: 0.9,
  rank: 0,
  origin: 'classifier',
  ...overrides,
})

const makeClassified = (overrides: Partial<ClassifiedNews> = {}): ClassifiedNews => ({
  ticker: 'FLM',
  sentiment: 0.8,
  impactCategory: ImpactCategory.ESPORTIVA_MAJORITARIA,
  relevance: 0.9,
  // Contrato multi-time (item 011): `teams` sempre presente; `ticker`/`sentiment`
  // de topo são a projeção do rank 0.
  teams: [makeTeam()],
  ...overrides,
})

/** Grupo de 3 times com sinais opostos — o caso canônico do loop. */
const makeMultiTeamClassified = (overrides: Partial<ClassifiedNews> = {}): ClassifiedNews =>
  makeClassified({
    ticker: 'PAL3',
    sentiment: 0.7,
    relevance: 0.9,
    teams: [
      makeTeam({ ticker: 'PAL3', sentiment: 0.7, confidence: 0.95, rank: 0 }),
      makeTeam({ ticker: 'URU3', sentiment: -0.6, confidence: 0.8, rank: 1 }),
      makeTeam({ ticker: 'COR3', sentiment: 0.4, confidence: 0.7, rank: 2 }),
    ],
    ...overrides,
  })

const publishedEvents = () =>
  mockPublish.mock.calls.map((call) => JSON.parse(call[1] as string))

const structuredLogs = (channel: 'info' | 'warn' | 'error') => {
  const { logger } = require('../../utils/logger')
  return (logger[channel] as jest.Mock).mock.calls
    .map((call) => {
      try {
        return JSON.parse(call[0] as string)
      } catch {
        return null
      }
    })
    .filter((entry: unknown): entry is Record<string, unknown> => entry !== null)
}

/** Ocorrências de `news_publish_db_failed` (critério 6). */
const dbFailedLogs = () =>
  structuredLogs('error').filter((entry) => entry.event === 'news_publish_db_failed')

/** Ocorrências do marcador durável `impact_dispatched_at` (DB-12 / critério 27). */
const impactMarkLogs = () =>
  structuredLogs('info').filter((entry) => entry.event === 'news_publisher_impact_marked')

const skipLogs = (reason: string) =>
  structuredLogs('info').filter(
    (entry) => entry.event === 'news_publisher_dispatch_skipped' && entry.reason === reason
  )

describe('NewsPublisher', () => {
  let redis: Redis
  let publisher: NewsPublisher
  const envBackup = process.env[NEWS_MULTI_TEAM_FLAG]

  beforeEach(() => {
    redis = new RedisMock() as unknown as Redis
    redis.publish = mockPublish as unknown as Redis['publish']
    const { PrismaClient } = require('@prisma/client')
    publisher = new NewsPublisher(new PrismaClient(), redis)

    mockNewsCreate.mockReset()
    mockNewsUpdate.mockReset()
    mockNewsUpdateMany.mockReset()
    mockAssetFindUnique.mockReset()
    mockPublish.mockReset()
    mockTransaction.mockReset()

    const { logger } = require('../../utils/logger')
    logger.info.mockClear()
    logger.warn.mockClear()
    logger.error.mockClear()

    dbRows = []
    txScratch = []
    inTransaction = false
    idSeq = 0
    clock = 0
    committedAtTick = null
    publishTicks = []

    mockNewsCreate.mockImplementation(createImpl)
    mockNewsUpdate.mockImplementation(updateImpl)
    mockNewsUpdateMany.mockImplementation(updateManyImpl)
    mockTransaction.mockImplementation(transactionImpl)
    mockAssetFindUnique.mockImplementation(async ({ where }: { where: { ticker: string } }) => ({
      id: `asset-uuid-${where.ticker}`,
    }))
    mockPublish.mockImplementation(async () => {
      publishTicks.push(++clock)
      return 1
    })

    // Default de produção em D1..D6: fan-out DESLIGADO.
    delete process.env[NEWS_MULTI_TEAM_FLAG]
  })

  afterAll(() => {
    if (envBackup === undefined) delete process.env[NEWS_MULTI_TEAM_FLAG]
    else process.env[NEWS_MULTI_TEAM_FLAG] = envBackup
  })

  // -------------------------------------------------------------------------
  // Caminhos de sucesso (comportamento legado, flag desligado)
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
          assetIds: ['asset-uuid-FLM'],
        }),
      })
    )
    expect(mockPublish).toHaveBeenCalledTimes(1)

    const publishedPayload = publishedEvents()[0]
    expect(publishedPayload.type).toBe('NEWS')
    expect(publishedPayload.assetId).toBe('FLM')
  })

  test('[SUCCESS — Notícia irrelevante] apenas DB, sem Redis', async () => {
    await publisher.publish(makeRaw(), makeClassified({ relevance: 0.2 }))

    expect(mockNewsCreate).toHaveBeenCalledTimes(1)
    expect(mockPublish).not.toHaveBeenCalled()
  })

  test('[SUCCESS — Descricao presente] content usa a descricao do item bruto', async () => {
    await publisher.publish(
      makeRaw({ description: 'Vitoria por 3 a 0 no Maracana' }),
      makeClassified()
    )

    expect(dbRows[0].content).toBe('Vitoria por 3 a 0 no Maracana')
  })

  test('[SUCCESS — Categoria desconhecida] cai para INSTITUCIONAL sem quebrar o despacho', async () => {
    await publisher.publish(makeRaw(), makeClassified({ impactCategory: 'CATEGORIA_INEXISTENTE' }))

    expect(dbRows[0].impact).toBe(ImpactCategory.INSTITUCIONAL)
    expect(Math.abs(publishedEvents()[0].magnitude)).toBe(
      IMPACT_MAGNITUDE[ImpactCategory.INSTITUCIONAL]
    )
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
    expect(skipLogs('ticker_unresolved')).toHaveLength(1)
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
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('nao encontrado em assets'))
  })

  test('[EDGE — asset.findUnique lanca exception] nao cria News, nao publica Redis, propaga NewsPersistenceError', async () => {
    mockAssetFindUnique.mockRejectedValue(new Error('Asset DB Error'))

    await expect(publisher.publish(makeRaw(), makeClassified())).rejects.toBeInstanceOf(
      NewsPersistenceError
    )
    expect(mockNewsCreate).not.toHaveBeenCalled()
    expect(mockPublish).not.toHaveBeenCalled()
    expect(dbFailedLogs()).toHaveLength(1)
  })

  // -------------------------------------------------------------------------
  // Caminhos de falha de infraestrutura
  // -------------------------------------------------------------------------

  // Critério 6 — falha de banco é ruidosa e o item NÃO pode terminar marcado
  // como processado. A parte "não marcado" mora no worker (NewsClassifier, que
  // desfaz a marca de dedup ao ver `NewsPersistenceError`); o contrato daqui é
  // emitir o log estruturado e propagar o erro tipado para que o worker consiga.
  test('[ERROR — DB falha no news.create] nao publica no Redis e propaga NewsPersistenceError com log estruturado', async () => {
    mockNewsCreate.mockRejectedValue(new Error('DB Error'))

    const raw = makeRaw()
    await expect(publisher.publish(raw, makeClassified())).rejects.toMatchObject({
      name: 'NewsPersistenceError',
      item: { url: raw.url },
    })

    expect(mockPublish).not.toHaveBeenCalled()
    expect(dbRows).toHaveLength(0)

    const failures = dbFailedLogs()
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({
      event: 'news_publish_db_failed',
      url: raw.url,
      source: raw.source,
      error_message: 'DB Error',
    })
  })

  test('[DEGRADED — Redis falha apos DB salvo] sem excecao propagada, DB preservado', async () => {
    const { logger } = require('../../utils/logger')
    mockPublish.mockRejectedValue(new Error('Redis Error'))

    await expect(publisher.publish(makeRaw(), makeClassified())).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Erro ao publicar no Redis'))
    expect(mockNewsCreate).toHaveBeenCalledTimes(1)
    expect(dbRows).toHaveLength(1)
  })

  // -------------------------------------------------------------------------
  // Contrato de payload Redis
  // -------------------------------------------------------------------------

  test('[INFRA] payload Redis tem formato NewsInjectEvent valido', async () => {
    await publisher.publish(makeRaw(), makeClassified())

    expect(mockPublish).toHaveBeenCalled()
    expect(mockPublish.mock.calls[0][0]).toBe('news:inject')

    const event = publishedEvents()[0]
    expect(event).toMatchObject({
      type: 'NEWS',
      assetId: expect.any(String),
      impact: expect.any(String),
      magnitude: expect.any(Number),
      durationTicks: NEWS_IMPACT_DURATION_TICKS,
      curveType: 'canonical',
    })
    expect(Object.values(ImpactCategory)).toContain(event.impactCategory)
    expect(new Date(event.publishedAt).toISOString()).toBe(event.publishedAt)
  })

  // -------------------------------------------------------------------------
  // Flag multi-time — entregue DESLIGADO (item 013)
  // -------------------------------------------------------------------------

  describe('flag NEWS_MULTI_TEAM_ENABLED', () => {
    test('[FLAG] ausente resolve para desligado', () => {
      delete process.env[NEWS_MULTI_TEAM_FLAG]
      expect(isMultiTeamFanOutEnabled()).toBe(false)
    })

    test('[FLAG] so o literal "true" liga; valores ambiguos NAO ligam', () => {
      for (const value of ['', 'false', '0', '1', 'yes', 'on', 'True-ish', 'lixo']) {
        process.env[NEWS_MULTI_TEAM_FLAG] = value
        expect(isMultiTeamFanOutEnabled()).toBe(false)
      }
      for (const value of ['true', 'TRUE', '  True  ']) {
        process.env[NEWS_MULTI_TEAM_FLAG] = value
        expect(isMultiTeamFanOutEnabled()).toBe(true)
      }
    })

    test('[FLAG OFF] noticia de 3 times grava UMA linha e emite UM evento (comportamento de hoje)', async () => {
      await publisher.publish(makeRaw(), makeMultiTeamClassified())

      expect(mockNewsCreate).toHaveBeenCalledTimes(1)
      expect(mockNewsUpdate).not.toHaveBeenCalled()
      expect(mockPublish).toHaveBeenCalledTimes(1)

      // Nenhum campo de grupo é escrito pelo writer: o default vem do trigger.
      const written = mockNewsCreate.mock.calls[0][0].data
      expect(written).not.toHaveProperty('groupId')
      expect(written).not.toHaveProperty('groupRank')
      expect(written.ticker).toBe('PAL3')

      // Critérios 17 / 27: `correlationId = newsId = groupId` em grupo unitário.
      const event = publishedEvents()[0]
      expect(event.assetId).toBe('PAL3')
      expect(event.correlationId).toBe(event.newsId)
      expect(dbRows[0].groupId).toBe(dbRows[0].id)
      expect(dbRows[0].groupRank).toBe(0)
    })

    test('[FLAG OFF] PARIDADE: payload de `create` e o do HEAD + sentimentClassifiedAt, sem transacao', async () => {
      // Fecha o F-01 do review do item 013. A cláusula da aceite ("com o flag
      // desligado o comportamento é idêntico ao de hoje, verificado por teste")
      // não podia coexistir com o critério 36, que exige gravar
      // `sentimentClassifiedAt` na própria escrita. Decisão do operador em
      // 2026-07-29: a aceite cede ao critério 36, e a divergência com o HEAD
      // fica limitada a ESSE campo — nada mais. Este teste é o gate disso.
      //
      // Payload do HEAD, literal (`git show HEAD:motor/src/news/NewsPublisher.ts`,
      // linhas 81-91): title, content, impact, sentiment, ticker, assetIds,
      // source, isPublished, publishedAt. Nove chaves, nem uma a mais.
      await publisher.publish(makeRaw(), makeMultiTeamClassified())

      expect(mockNewsCreate).toHaveBeenCalledTimes(1)
      // O caminho unitário NÃO abre transação interativa: uma escrita só já é
      // atômica no Postgres, e `$transaction` traria o modo de falha P2028 do
      // adapter para um caminho que hoje não o tem (F-02).
      expect(mockTransaction).not.toHaveBeenCalled()
      expect(mockNewsUpdate).not.toHaveBeenCalled()

      const written = mockNewsCreate.mock.calls[0][0].data
      expect(written).toEqual({
        // --- as 9 chaves do HEAD, com os mesmos valores ---
        title: 'Flamengo vence',
        content: 'Flamengo vence',
        impact: ImpactCategory.ESPORTIVA_MAJORITARIA,
        sentiment: 'BULLISH',
        ticker: 'PAL3',
        assetIds: ['asset-uuid-PAL3'],
        source: 'ESPN Brasil',
        isPublished: true,
        publishedAt: new Date('2026-07-28T12:00:00.000Z'),
        // --- única divergência admitida, mandatada pelo critério 36 ---
        sentimentClassifiedAt: expect.any(Date),
      })
      // `toEqual` acima já rejeita chave extra; explicitado para o leitor.
      expect(Object.keys(written).sort()).toEqual([
        'assetIds', 'content', 'impact', 'isPublished', 'publishedAt',
        'sentiment', 'sentimentClassifiedAt', 'source', 'ticker', 'title',
      ])
    })

    test('[FLAG OFF] rank 0 marcado como low_confidence NAO silencia o despacho de hoje', async () => {
      await publisher.publish(
        makeRaw(),
        makeClassified({
          teams: [makeTeam({ origin: 'low_confidence', confidence: 0.1 })],
        })
      )

      expect(mockPublish).toHaveBeenCalledTimes(1)
      expect(skipLogs('low_confidence')).toHaveLength(0)
    })

    test('[FLAG OFF] `teams` vazio nao muda o caminho legado', async () => {
      await publisher.publish(makeRaw(), makeClassified({ teams: [] }))

      expect(mockNewsCreate).toHaveBeenCalledTimes(1)
      expect(mockPublish).toHaveBeenCalledTimes(1)
      expect(publishedEvents()[0].assetId).toBe('FLM')
    })
  })

  // -------------------------------------------------------------------------
  // Fan-out multi-time (flag LIGADO) — item 013
  // -------------------------------------------------------------------------

  describe('fan-out multi-time (flag ligado)', () => {
    beforeEach(() => {
      process.env[NEWS_MULTI_TEAM_FLAG] = 'true'
    })

    test('[CRITERIO 1] 3 times geram 3 linhas, ids distintos, mesmo group_id, ranks 0/1/2 e um unico published_at', async () => {
      await publisher.publish(makeRaw(), makeMultiTeamClassified())

      expect(dbRows).toHaveLength(3)

      const ids = dbRows.map((row) => row.id)
      expect(new Set(ids).size).toBe(3)

      const groupIds = new Set(dbRows.map((row) => row.groupId))
      expect(groupIds.size).toBe(1)
      // O group_id do grupo é o id da âncora (rank 0).
      const anchor = dbRows.find((row) => row.groupRank === 0) as FakeRow
      expect([...groupIds][0]).toBe(anchor.id)

      expect(dbRows.map((row) => row.groupRank).sort()).toEqual([0, 1, 2])
      expect(dbRows.map((row) => row.ticker)).toEqual(['PAL3', 'URU3', 'COR3'])

      const publishedAtValues = new Set(dbRows.map((row) => row.publishedAt.toISOString()))
      expect(publishedAtValues.size).toBe(1)
    })

    test('[CRITERIO 2] falha na SEGUNDA linha reverte o grupo inteiro e nao publica nada', async () => {
      let calls = 0
      mockNewsCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => {
        calls += 1
        if (calls === 2) throw new Error('DB Error na linha 2')
        return createImpl(args)
      })

      // Item 014: o rollback continua sendo o do critério 2, mas agora ele é
      // RUIDOSO — a exceção sobe tipada até o worker (critério 6).
      await expect(publisher.publish(makeRaw(), makeMultiTeamClassified())).rejects.toBeInstanceOf(
        NewsPersistenceError
      )

      // Equivalente ao `SELECT count(*) FROM news WHERE group_id = $1` retornando 0.
      expect(dbRows).toHaveLength(0)
      expect(mockPublish).not.toHaveBeenCalled()
      // Nenhum marcador de despacho para um grupo que nunca existiu.
      expect(mockNewsUpdateMany).not.toHaveBeenCalled()

      const failures = dbFailedLogs()
      expect(failures).toHaveLength(1)
      expect(failures[0]).toMatchObject({ planned_rows: 3, multi_team_enabled: true })
    })

    test('[CRITERIO 3] os N eventos compartilham a magnitude absoluta e diferem apenas no sinal', async () => {
      await publisher.publish(makeRaw(), makeMultiTeamClassified())

      const events = publishedEvents()
      expect(events).toHaveLength(3)

      const magnitudes = new Set(events.map((event) => Math.abs(event.magnitude)))
      expect(magnitudes.size).toBe(1)
      expect([...magnitudes][0]).toBe(IMPACT_MAGNITUDE[ImpactCategory.ESPORTIVA_MAJORITARIA])

      const byTicker = Object.fromEntries(events.map((event) => [event.assetId, event.magnitude]))
      expect(byTicker.PAL3).toBeGreaterThan(0)
      expect(byTicker.URU3).toBeLessThan(0) // sentimento -0.6
      expect(byTicker.COR3).toBeGreaterThan(0)

      // Impacto é da notícia, não do time: as 3 linhas compartilham a categoria.
      expect(new Set(dbRows.map((row) => row.impact)).size).toBe(1)
      // Sentimento, ao contrário, é por linha.
      expect(dbRows.map((row) => row.sentiment)).toEqual(['BULLISH', 'BEARISH', 'BULLISH'])
    })

    test('[CRITERIO 4] todo time elegivel do grupo despacha — um evento por linha', async () => {
      await publisher.publish(makeRaw(), makeMultiTeamClassified())

      const events = publishedEvents()
      expect(events.map((event) => event.assetId).sort()).toEqual(['COR3', 'PAL3', 'URU3'])
      // Cada evento carrega o newsId da SUA linha.
      expect(new Set(events.map((event) => event.newsId)).size).toBe(3)
      expect(events.map((event) => event.newsId).sort()).toEqual(dbRows.map((row) => row.id).sort())
      expect(skipLogs('relevance_gate')).toHaveLength(0)
      expect(skipLogs('low_confidence')).toHaveLength(0)
      expect(skipLogs('ticker_unresolved')).toHaveLength(0)
    })

    test('[CRITERIO 27] correlationId e o groupId em todos os eventos, sem campo novo no contrato', async () => {
      await publisher.publish(makeRaw(), makeMultiTeamClassified())

      const groupId = dbRows[0].groupId
      const events = publishedEvents()
      expect(events.every((event) => event.correlationId === groupId)).toBe(true)
      expect(events.every((event) => !('groupId' in event))).toBe(true)
    })

    test('[ORDEM] os eventos so saem DEPOIS do commit', async () => {
      await publisher.publish(makeRaw(), makeMultiTeamClassified())

      expect(committedAtTick).not.toBeNull()
      expect(publishTicks).toHaveLength(3)
      expect(Math.min(...publishTicks)).toBeGreaterThan(committedAtTick as number)
    })

    test('[CRITERIO 36] sentimentClassifiedAt e gravado em todas as linhas do grupo', async () => {
      await publisher.publish(makeRaw(), makeMultiTeamClassified())

      expect(dbRows).toHaveLength(3)
      for (const row of dbRows) {
        expect(row.sentimentClassifiedAt).toBeInstanceOf(Date)
      }
      // Uma única marca temporal para o grupo inteiro.
      expect(
        new Set(dbRows.map((row) => (row.sentimentClassifiedAt as Date).toISOString())).size
      ).toBe(1)
    })

    test('[GATE confidence] linha low_confidence e GRAVADA, nao despacha, e o motivo fica no log', async () => {
      await publisher.publish(
        makeRaw(),
        makeMultiTeamClassified({
          teams: [
            makeTeam({ ticker: 'PAL3', sentiment: 0.7, confidence: 0.95, rank: 0 }),
            makeTeam({ ticker: 'URU3', sentiment: 0, confidence: 0.55, rank: 1, origin: 'low_confidence' }),
            makeTeam({ ticker: 'COR3', sentiment: 0.4, confidence: 0.7, rank: 2 }),
          ],
        })
      )

      // Gravada normalmente, com sentimento neutro.
      expect(dbRows).toHaveLength(3)
      const lowConfidenceRow = dbRows.find((row) => row.ticker === 'URU3') as FakeRow
      expect(lowConfidenceRow.sentiment).toBe('NEUTRAL')

      // Sem evento para ela; as demais despacham.
      const events = publishedEvents()
      expect(events.map((event) => event.assetId).sort()).toEqual(['COR3', 'PAL3'])

      const logs = skipLogs('low_confidence')
      expect(logs).toHaveLength(1)
      const rows = logs[0].rows as Array<Record<string, unknown>>
      expect(rows[0].ticker).toBe('URU3')
      expect(rows[0].origin).toBe('low_confidence')
      expect(rows[0].news_id).toBe(lowConfidenceRow.id)
    })

    test('[GATE relevancia] grupo reprovado nao despacha NADA mesmo com confidence alto em todos os times', async () => {
      await publisher.publish(makeRaw(), makeMultiTeamClassified({ relevance: 0.2 }))

      expect(dbRows).toHaveLength(3)
      expect(mockPublish).not.toHaveBeenCalled()

      const relevanceLogs = skipLogs('relevance_gate')
      expect(relevanceLogs).toHaveLength(1)
      expect(relevanceLogs[0].relevance).toBe(0.2)
      expect(relevanceLogs[0].threshold).toBe(0.3)
      expect(relevanceLogs[0].rows).toHaveLength(3)
      // Os dois motivos NAO se colapsam: reprovado na relevância não emite
      // motivo de confidence, e vice-versa.
      expect(skipLogs('low_confidence')).toHaveLength(0)
    })

    test('[GATE relevancia] limite e estritamente maior que 0.3 (0.3 exato nao despacha)', async () => {
      await publisher.publish(makeRaw(), makeMultiTeamClassified({ relevance: 0.3 }))

      expect(dbRows).toHaveLength(3)
      expect(mockPublish).not.toHaveBeenCalled()
      expect(skipLogs('relevance_gate')).toHaveLength(1)
    })

    test('[CRITERIO 17] grupo unitario com flag ligado continua com correlationId = newsId', async () => {
      await publisher.publish(makeRaw(), makeClassified())

      expect(dbRows).toHaveLength(1)
      expect(mockNewsUpdate).not.toHaveBeenCalled()
      const event = publishedEvents()[0]
      expect(event.correlationId).toBe(event.newsId)
      expect(dbRows[0].groupId).toBe(dbRows[0].id)
    })

    test('[FALLBACK] time resolvido pelo fallback deterministico despacha normalmente', async () => {
      await publisher.publish(
        makeRaw(),
        makeClassified({
          teams: [makeTeam({ ticker: 'FLM', origin: 'classifier_fallback', confidence: 0 })],
        })
      )

      expect(dbRows).toHaveLength(1)
      expect(mockPublish).toHaveBeenCalledTimes(1)
      expect(skipLogs('low_confidence')).toHaveLength(0)
    })

    test('[DEFENSIVO] ticker duplicado e excedente do cap nao chegam ao banco', async () => {
      await publisher.publish(
        makeRaw(),
        makeMultiTeamClassified({
          teams: [
            makeTeam({ ticker: 'PAL3', rank: 0 }),
            makeTeam({ ticker: 'PAL3', rank: 1 }),
            makeTeam({ ticker: 'URU3', rank: 2 }),
            makeTeam({ ticker: 'COR3', rank: 3 }),
            makeTeam({ ticker: 'SAO3', rank: 4 }),
          ],
        })
      )

      expect(dbRows.map((row) => row.ticker)).toEqual(['PAL3', 'URU3', 'COR3'])
      expect(dbRows.map((row) => row.groupRank)).toEqual([0, 1, 2])

      const sanitized = structuredLogs('warn').filter(
        (entry) => entry.event === 'news_publisher_group_sanitized'
      )
      expect(sanitized).toHaveLength(1)
      expect(sanitized[0].duplicates).toEqual(['PAL3'])
      expect(sanitized[0].overflow).toEqual(['SAO3'])

      // Reindexar 0,2,3 -> 0,1,2 e um desvio: fica registrado, nunca silencioso.
      expect(
        structuredLogs('warn').filter((entry) => entry.event === 'news_publisher_rank_normalized')
      ).toHaveLength(1)
    })

    test('[DEFENSIVO] `teams` mal formado cai no caminho legado sem derrubar a noticia', async () => {
      await publisher.publish(
        makeRaw(),
        makeClassified({ teams: undefined as unknown as ClassifiedTeam[] })
      )
      await publisher.publish(
        makeRaw(),
        makeClassified({
          teams: [
            null as unknown as ClassifiedTeam,
            makeTeam({ ticker: 42 as unknown as string }),
            makeTeam({ ticker: '' }),
          ],
        })
      )

      // Duas notícias, uma linha legada cada, ambas com o ticker de topo.
      expect(dbRows).toHaveLength(2)
      expect(dbRows.map((row) => row.ticker)).toEqual(['FLM', 'FLM'])
      expect(mockPublish).toHaveBeenCalledTimes(2)
    })

    test('[DEGRADED] falha de Redis numa linha nao impede o despacho das irmas', async () => {
      const { logger } = require('../../utils/logger')
      let calls = 0
      mockPublish.mockImplementation(async () => {
        calls += 1
        publishTicks.push(++clock)
        if (calls === 2) throw new Error('Redis Error')
        return 1
      })

      await expect(publisher.publish(makeRaw(), makeMultiTeamClassified())).resolves.toBeUndefined()

      expect(mockPublish).toHaveBeenCalledTimes(3)
      expect(dbRows).toHaveLength(3)
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Erro ao publicar no Redis'))
    })

    test('[ASSET] cada linha carrega o seu proprio assetId', async () => {
      await publisher.publish(makeRaw(), makeMultiTeamClassified())

      expect(mockAssetFindUnique).toHaveBeenCalledTimes(3)
      expect(dbRows.map((row) => row.assetIds)).toEqual([
        ['asset-uuid-PAL3'],
        ['asset-uuid-URU3'],
        ['asset-uuid-COR3'],
      ])
    })
  })

  // -------------------------------------------------------------------------
  // Marcador durável de despacho (item 014 — DB-12 / leitura A8)
  //
  // Uma coluna só, `impact_dispatched_at`, e o MESMO timestamp em toda decisão
  // terminal: despachou ou decidiu não despachar. Sem coluna de estado, sem
  // migration nova. O que distingue o gate do despacho bem-sucedido é a
  // ausência de evento no Redis, não o valor gravado.
  //
  // A única linha que fica com o marcador NULO é a que falhou ao publicar — é
  // exatamente essa que o reconciliador do item 029 precisa drenar (critério 29).
  // -------------------------------------------------------------------------

  describe('marcador impactDispatchedAt', () => {
    const markedAt = () => dbRows.map((row) => row.impactDispatchedAt)

    test('[DB-12] despacho bem-sucedido grava o marcador na linha', async () => {
      await publisher.publish(makeRaw(), makeClassified())

      expect(mockPublish).toHaveBeenCalledTimes(1)
      expect(dbRows[0].impactDispatchedAt).toBeInstanceOf(Date)

      const logs = impactMarkLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].marked).toEqual([{ news_id: dbRows[0].id, outcome: 'dispatched' }])
    })

    test('[DB-12] gate de relevancia grava o MESMO marcador, sem evento no Redis', async () => {
      await publisher.publish(makeRaw(), makeClassified({ relevance: 0.2 }))

      expect(mockPublish).not.toHaveBeenCalled()
      expect(dbRows[0].impactDispatchedAt).toBeInstanceOf(Date)

      const logs = impactMarkLogs()
      expect(logs).toHaveLength(1)
      expect(logs[0].marked).toEqual([{ news_id: dbRows[0].id, outcome: 'relevance_gate' }])
    })

    test('[DB-12] o grupo inteiro reprovado no gate compartilha UM unico timestamp', async () => {
      process.env[NEWS_MULTI_TEAM_FLAG] = 'true'
      await publisher.publish(makeRaw(), makeMultiTeamClassified({ relevance: 0.2 }))

      expect(dbRows).toHaveLength(3)
      expect(mockPublish).not.toHaveBeenCalled()

      const stamps = markedAt()
      expect(stamps.every((stamp) => stamp instanceof Date)).toBe(true)
      expect(new Set(stamps.map((stamp) => (stamp as Date).toISOString())).size).toBe(1)
    })

    test('[DB-12] ticker nao resolvido tambem e decisao terminal e leva o marcador', async () => {
      await publisher.publish(makeRaw(), makeClassified({ ticker: '', teams: [] }))

      expect(mockPublish).not.toHaveBeenCalled()
      expect(dbRows[0].impactDispatchedAt).toBeInstanceOf(Date)
      expect(impactMarkLogs()[0].marked).toEqual([
        { news_id: dbRows[0].id, outcome: 'ticker_unresolved' },
      ])
    })

    test('[DB-12] linha low_confidence e marcada junto com as irmas que despacharam', async () => {
      process.env[NEWS_MULTI_TEAM_FLAG] = 'true'
      await publisher.publish(
        makeRaw(),
        makeMultiTeamClassified({
          teams: [
            makeTeam({ ticker: 'PAL3', sentiment: 0.7, confidence: 0.95, rank: 0 }),
            makeTeam({ ticker: 'URU3', sentiment: 0, confidence: 0.55, rank: 1, origin: 'low_confidence' }),
            makeTeam({ ticker: 'COR3', sentiment: 0.4, confidence: 0.7, rank: 2 }),
          ],
        })
      )

      // Todas as 3 tiveram decisão terminal: 2 despacharam, 1 foi barrada.
      expect(markedAt().every((stamp) => stamp instanceof Date)).toBe(true)
      const marked = impactMarkLogs()[0].marked as Array<Record<string, string>>
      expect(marked.map((entry) => entry.outcome).sort()).toEqual([
        'dispatched',
        'dispatched',
        'low_confidence',
      ])
    })

    // Critério 29: o reconciliador drena `impact_dispatched_at IS NULL`. Marcar
    // uma linha cujo evento nunca saiu do Redis a esconderia do reconciliador
    // para sempre.
    test('[CRITERIO 29] falha de Redis deixa a linha SEM marcador', async () => {
      mockPublish.mockRejectedValue(new Error('Redis Error'))

      await expect(publisher.publish(makeRaw(), makeClassified())).resolves.toBeUndefined()

      expect(dbRows).toHaveLength(1)
      expect(dbRows[0].impactDispatchedAt).toBeUndefined()
      expect(mockNewsUpdateMany).not.toHaveBeenCalled()
    })

    test('[CRITERIO 29] num grupo, so a linha que falhou no Redis fica sem marcador', async () => {
      process.env[NEWS_MULTI_TEAM_FLAG] = 'true'
      let calls = 0
      mockPublish.mockImplementation(async () => {
        calls += 1
        publishTicks.push(++clock)
        if (calls === 2) throw new Error('Redis Error')
        return 1
      })

      await publisher.publish(makeRaw(), makeMultiTeamClassified())

      expect(dbRows).toHaveLength(3)
      const semMarcador = dbRows.filter((row) => row.impactDispatchedAt === undefined)
      expect(semMarcador.map((row) => row.ticker)).toEqual(['URU3'])
    })

    // O marcador é escrito DEPOIS do commit e DEPOIS dos eventos. Se ele falhar,
    // a notícia já está no banco e os eventos já saíram: propagar o erro faria o
    // worker desmarcar a URL e recriar as linhas no ciclo seguinte (duplicatas).
    // Degrada em log e deixa o reconciliador do item 029 drenar.
    test('[DEGRADED] falha no proprio marcador nao derruba a publicacao', async () => {
      mockNewsUpdateMany.mockRejectedValue(new Error('DB Error no updateMany'))

      await expect(publisher.publish(makeRaw(), makeClassified())).resolves.toBeUndefined()

      expect(dbRows).toHaveLength(1)
      expect(mockPublish).toHaveBeenCalledTimes(1)
      const falhas = structuredLogs('error').filter(
        (entry) => entry.event === 'news_publisher_impact_marker_failed'
      )
      expect(falhas).toHaveLength(1)
      expect(falhas[0].news_ids).toEqual([dbRows[0].id])
    })
  })
})
