/**
 * Testes unitarios — item 019 do loop 07-28-noticias-multi-time-linha-por-time:
 * DB-19 (source.md:1101), metade da condicao C9 (source.md:882).
 *
 * Eixo desta suite: nenhum caminho de ATUALIZACAO achata o grupo multi-time.
 * Tres clausulas literais de DB-19 — (1) nunca substituir `assetIds` por array de
 * um elemento em linha de grupo, (2) nunca escrever cruzando `group_id`,
 * (3) `assetIds: [x]` so em criacao de linha nova.
 *
 * Suite nova em vez de crescer `admin-news-group-safe-route.test.ts` porque o eixo
 * e outro (DB-19, nao criterios 21/22/23) e a de 017 ja e longa. Harness reusado
 * dela: mock total de `@/lib/prisma`, mock de `@/lib/auth`, `withAdmin`
 * passthrough, mock de `@/lib/utils/resolve-ticker`, `$transaction` que aceita
 * array e callback.
 *
 * Nota de localizacao: o `testMatch` do jest.config.ts cobre APENAS `tests/**`.
 * Suite em `src/**` nunca roda ("No tests found"), por isso ela vive aqui.
 *
 * Cada caso asserta o ARGUMENTO enviado ao Prisma, nao apenas o status HTTP — e o
 * argumento que prova o escopo de linha e a preservacao do array.
 *
 * O CASO 11 (primeiro bloco, `describe` de varredura) e a prova executavel da
 * clausula 2 e vale mais que os outros dez juntos: nenhum `updateMany` carrega
 * `assetIds`, e todo `update` que carrega usa `where: { id }`.
 */

import type { NextRequest } from 'next/server'

// --- mocks -----------------------------------------------------------------

jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn(),
  hasAdminRole: () => true,
}))

jest.mock('@/app/api/middleware', () => ({
  withAdmin: () => (handler: unknown) => handler,
}))

jest.mock('@/lib/utils/resolve-ticker', () => ({
  resolveTickerFromTitle: jest.fn(),
  resolveTickerFromText: jest.fn(),
}))

// `@/lib/env` valida o process.env inteiro no import (Zod) e derrubaria a suite;
// o cron so consome `CRON_SECRET`.
jest.mock('@/lib/env', () => ({
  env: { CRON_SECRET: 'test-cron-secret' },
}))

const findUniqueNews = jest.fn()
const findFirstNews = jest.fn()
const findManyNews = jest.fn()
const createNews = jest.fn()
const updateNews = jest.fn()
const updateManyNews = jest.fn()
const findUniqueAsset = jest.fn()
const findManyAsset = jest.fn()

const transaction = jest.fn(async (arg: unknown) => {
  if (typeof arg === 'function') {
    return (arg as (tx: unknown) => Promise<unknown>)({
      news: {
        create: (...a: unknown[]) => createNews(...a),
        update: (...a: unknown[]) => updateNews(...a),
      },
    })
  }
  return Promise.all(arg as unknown[])
})

jest.mock('@/lib/prisma', () => ({
  prisma: {
    news: {
      findUnique: (...a: unknown[]) => findUniqueNews(...a),
      findFirst: (...a: unknown[]) => findFirstNews(...a),
      findMany: (...a: unknown[]) => findManyNews(...a),
      create: (...a: unknown[]) => createNews(...a),
      update: (...a: unknown[]) => updateNews(...a),
      updateMany: (...a: unknown[]) => updateManyNews(...a),
    },
    asset: {
      findUnique: (...a: unknown[]) => findUniqueAsset(...a),
      findMany: (...a: unknown[]) => findManyAsset(...a),
    },
    $transaction: (...a: unknown[]) => transaction(a[0]),
  },
}))

import { getAuthUser } from '@/lib/auth'
import { resolveTickerFromTitle, resolveTickerFromText } from '@/lib/utils/resolve-ticker'
import {
  decideLineAssetIds,
  siblingAssetIdsFrom,
  siblingCountFrom,
} from '@/lib/services/newsLineAssetIds'
import { PATCH as adminNewsPATCH } from '@/app/api/v1/admin/news/[id]/route'
import { PATCH as editorialPATCH } from '@/app/api/v1/admin/news/editorial/[id]/route'
import { POST as batchResolvePOST } from '@/app/api/v1/admin/news/batch-resolve/route'
import { GET as reconcileCronGET } from '@/app/api/cron/reconcile-null-tickers/route'

const mockGetAuthUser = getAuthUser as jest.Mock
const mockResolveTickerFromTitle = resolveTickerFromTitle as jest.Mock
const mockResolveTickerFromText = resolveTickerFromText as jest.Mock

const AUTH = {
  user: { id: 'u1', name: 'Editor', email: 'e@t.com', adminRole: 'SUPER_ADMIN' },
  userId: 'u1',
}

const OLD_PUBLISHED = new Date('2026-07-01T10:00:00.000Z')

const ASSET_BY_TICKER: Record<string, string> = {
  FLA: 'asset-fla',
  PAL: 'asset-pal',
  VAS: 'asset-vas',
}

// --- helpers de request ----------------------------------------------------

function adminPatchReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

function adminPatchCtx(id: string) {
  return { params: Promise.resolve({ id }) }
}

function editorialItemReq(id: string, body?: unknown): NextRequest {
  return {
    nextUrl: { pathname: `/api/v1/admin/news/editorial/${id}` },
    json: async () => body,
  } as unknown as NextRequest
}

function batchResolveReq(): NextRequest {
  return { cookies: { get: () => undefined } } as unknown as NextRequest
}

function cronReq(secret = 'test-cron-secret'): NextRequest {
  return {
    headers: { get: (k: string) => (k === 'authorization' ? `Bearer ${secret}` : null) },
    nextUrl: { searchParams: new URLSearchParams() },
  } as unknown as NextRequest
}

/**
 * Estado da linha que a rota de grupo (`admin/news/[id]`) le no findUnique de
 * escopo. Mesmo shape do select real, `assetIds` incluido (item 019 / ST003).
 */
function adminContextRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    groupId: 'g1',
    groupRank: 1,
    source: null,
    publishedAt: OLD_PUBLISHED,
    ticker: 'FLA',
    title: 'Titulo original com tamanho suficiente',
    assetIds: ['asset-fla'],
    ...over,
  }
}

/** Estado da linha que a rota editorial (`editorial/[id]`) le. */
function editorialContextRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    groupId: null,
    groupRank: null,
    assetIds: [] as string[],
    source: null,
    publishedAt: null,
    ticker: null,
    title: 'Titulo original com tamanho suficiente',
    ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAuthUser.mockResolvedValue(AUTH)
  mockResolveTickerFromTitle.mockResolvedValue(null)
  mockResolveTickerFromText.mockResolvedValue(null)
  updateNews.mockResolvedValue({ id: 'n1' })
  updateManyNews.mockResolvedValue({ count: 2 })
  findUniqueAsset.mockResolvedValue({ id: 'asset-fla' })
  findManyAsset.mockResolvedValue([])
})

// ---------------------------------------------------------------------------
// CASO 11 — varredura agregada das chamadas mockadas (clausula 2 de DB-19)
// ---------------------------------------------------------------------------

/**
 * Mocks com ESTADO em vez de sequencia: o caso 11 dirige cinco escritores no
 * mesmo teste, e amarrar `mockResolvedValueOnce` na ordem exata das leituras
 * tornaria a prova fragil justamente onde ela precisa ser dura. Cada mock
 * discrimina pela FORMA do argumento, como o Prisma real faria.
 */
function installStatefulMocks() {
  const rows: Record<string, {
    id: string
    groupId: string | null
    groupRank: number | null
    assetIds: string[]
    ticker: string | null
    title: string
    content: string
    source: string | null
    publishedAt: Date | null
  }> = {
    // Grupo g1: n1 e a ancora "sem time"; n2 e o irmao que ja e do Palmeiras.
    n1: {
      id: 'n1', groupId: 'g1', groupRank: 0, assetIds: ['asset-fla'], ticker: null,
      title: 'Ancora do grupo com titulo suficiente', content: 'conteudo da ancora',
      source: null, publishedAt: OLD_PUBLISHED,
    },
    n2: {
      id: 'n2', groupId: 'g1', groupRank: 1, assetIds: ['asset-pal'], ticker: 'PAL',
      title: 'Irmao do grupo com titulo suficiente', content: 'conteudo do irmao',
      source: null, publishedAt: OLD_PUBLISHED,
    },
    // Linha solta (sem grupo): caminho de linha unica, criterio 17.
    n9: {
      id: 'n9', groupId: null, groupRank: null, assetIds: [], ticker: null,
      title: 'Linha solta com titulo suficiente', content: 'conteudo solto',
      source: null, publishedAt: null,
    },
  }

  findUniqueNews.mockImplementation(async (arg: { where: { id: string } }) => rows[arg.where.id] ?? null)

  findManyNews.mockImplementation(async (arg: { where: Record<string, unknown> }) => {
    const where = arg.where ?? {}
    // Leitura de irmaos (I-leitura-de-grupo): { groupId, NOT: { id } }.
    if (typeof where.groupId === 'string' && where.NOT) {
      const excluded = (where.NOT as { id: string }).id
      return Object.values(rows)
        .filter(r => r.groupId === where.groupId && r.id !== excluded)
        .map(r => ({ id: r.id, assetIds: r.assetIds }))
    }
    // Leitura de irmaos em LOTE (batch-resolve / cron): { groupId: { in: [...] } }.
    if (where.groupId && typeof where.groupId === 'object') {
      const ids = (where.groupId as { in: string[] }).in
      return Object.values(rows)
        .filter(r => r.groupId && ids.includes(r.groupId))
        .map(r => ({ id: r.id, groupId: r.groupId, assetIds: r.assetIds }))
    }
    // Scan de "sem time" (batch-resolve e cron usam `OR: [{ticker:null},{ticker:''}]`).
    if (Array.isArray(where.OR)) {
      return Object.values(rows)
        .filter(r => !r.ticker)
        .map(r => ({
          id: r.id, title: r.title, content: r.content,
          groupId: r.groupId, groupRank: r.groupRank, assetIds: r.assetIds,
        }))
    }
    return []
  })

  findUniqueAsset.mockImplementation(async (arg: { where: { ticker: string } }) => {
    const id = ASSET_BY_TICKER[arg.where.ticker]
    return id ? { id } : null
  })

  updateNews.mockImplementation(async (arg: { where: { id: string } }) => rows[arg.where.id] ?? { id: arg.where.id })
  updateManyNews.mockResolvedValue({ count: 2 })

  return rows
}

describe('caso 11 — clausula 2 de DB-19: nenhuma escrita de assetIds cruza group_id', () => {
  test('varredura de update/updateMany apos dirigir os 5 escritores de atualizacao', async () => {
    installStatefulMocks()
    // Titulo da ancora resolve para o time do IRMAO: e o cenario que achatava.
    mockResolveTickerFromTitle.mockResolvedValue('PAL')
    mockResolveTickerFromText.mockResolvedValue('PAL')
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'log').mockImplementation(() => {})

    // E3a — PATCH de ticker em linha de grupo, time NAO pertencente a irmao.
    const r1 = await adminNewsPATCH(adminPatchReq({ ticker: 'VAS' }), adminPatchCtx('n1'))
    expect(r1.status).toBe(200)

    // E3a (grupo) — arquivamento: escrita de GRUPO, via updateMany.
    const r2 = await adminNewsPATCH(adminPatchReq({ isArchived: true }), adminPatchCtx('n1'))
    expect(r2.status).toBe(200)

    // E5 — PATCH editorial de ticker em linha solta.
    const r3 = await editorialPATCH(editorialItemReq('n9', { ticker: 'vas' }))
    expect(r3.status).toBe(200)

    // E7 — lote (ancora de grupo + linha solta na mesma passada).
    const r4 = await batchResolvePOST(batchResolveReq())
    expect(r4.status).toBe(200)

    // E8 — cron (mesma dupla, sem humano no caminho).
    const r5 = await reconcileCronGET(cronReq())
    expect(r5.status).toBe(200)

    // --- a prova ---------------------------------------------------------
    const updateManyCalls = updateManyNews.mock.calls.map(c => c[0] as { where: unknown; data: Record<string, unknown> })
    expect(updateManyCalls.length).toBeGreaterThan(0) // a varredura nao pode passar por vacuidade
    for (const call of updateManyCalls) {
      expect(Object.keys(call.data)).not.toContain('assetIds')
    }

    const updateCalls = updateNews.mock.calls.map(c => c[0] as { where: Record<string, unknown>; data: Record<string, unknown> })
    const withAssetIds = updateCalls.filter(call => Object.keys(call.data).includes('assetIds'))
    expect(withAssetIds.length).toBeGreaterThan(0) // idem: tem que existir escrita legitima
    for (const call of withAssetIds) {
      expect(Object.keys(call.where)).toEqual(['id'])
      expect(typeof call.where.id).toBe('string')
    }
  })
})

// ---------------------------------------------------------------------------
// Casos 1..4 — o helper puro
// ---------------------------------------------------------------------------

describe('decideLineAssetIds — clausulas de DB-19', () => {
  test('caso 1: linha com 2 assets e asset resolvido -> skip legacy-multi-asset', () => {
    expect(
      decideLineAssetIds({
        current: { id: 'n1', groupId: 'g1', groupRank: 0, assetIds: ['asset-fla', 'asset-pal'] },
        resolvedAssetId: 'asset-vas',
        siblingAssetIds: [],
        siblingCount: 0,
      })
    ).toEqual({ action: 'skip', reason: 'legacy-multi-asset' })
  })

  test('caso 2: limpar vinculo com irmaos vivos -> skip group-row-clear', () => {
    expect(
      decideLineAssetIds({
        current: { id: 'n1', groupId: 'g1', groupRank: 0, assetIds: ['asset-fla'] },
        resolvedAssetId: null,
        siblingAssetIds: ['asset-pal'],
        siblingCount: 1,
      })
    ).toEqual({ action: 'skip', reason: 'group-row-clear' })
  })

  test('caso 3: asset resolvido ja pertence a irmao -> skip sibling-owns-asset', () => {
    expect(
      decideLineAssetIds({
        current: { id: 'n1', groupId: 'g1', groupRank: 0, assetIds: ['asset-fla'] },
        resolvedAssetId: 'asset-pal',
        siblingAssetIds: ['asset-pal'],
        siblingCount: 1,
      })
    ).toEqual({ action: 'skip', reason: 'sibling-owns-asset' })
  })

  test('caso 4: linha unica sem irmaos, limpar -> write [] (criterio 17)', () => {
    expect(
      decideLineAssetIds({
        current: { id: 'n9', groupId: null, groupRank: null, assetIds: ['asset-fla'] },
        resolvedAssetId: null,
        siblingAssetIds: [],
        siblingCount: 0,
      })
    ).toEqual({ action: 'write', assetIds: [] })
  })

  // Lacuna do critetio 4 fechada no recovery do review do item 019: antes a regra 2
  // media irmao vivo por `siblingAssetIds.length > 0`, entao um grupo cujos irmaos
  // existem SEM asset era invisivel e a limpeza passava — o grupo terminava com zero
  // vinculos. O criterio 4 fala de "irmaos vivos", nao de "irmaos com asset".
  test('caso 12: limpar vinculo com irmao vivo SEM asset -> skip group-row-clear', () => {
    expect(
      decideLineAssetIds({
        current: { id: 'n1', groupId: 'g1', groupRank: 0, assetIds: ['asset-fla'] },
        resolvedAssetId: null,
        siblingAssetIds: [], // irmao existe mas nao tem asset: nao aparece no achatamento
        siblingCount: 1,
      })
    ).toEqual({ action: 'skip', reason: 'group-row-clear' })
  })

  test('caso 13: `siblingCount` nao afrouxa o caminho de linha unica nem os outros skips', () => {
    // Sem irmao nenhum a limpeza continua permitida (criterio 17 preservado).
    expect(
      decideLineAssetIds({
        current: { id: 'n9', groupId: 'g1', groupRank: 0, assetIds: ['asset-fla'] },
        resolvedAssetId: null,
        siblingAssetIds: [],
        siblingCount: 0,
      })
    ).toEqual({ action: 'write', assetIds: [] })

    // A regra 1 continua tendo precedencia sobre a regra 2, mesmo com irmao vivo.
    expect(
      decideLineAssetIds({
        current: { id: 'n1', groupId: 'g1', groupRank: 0, assetIds: ['asset-fla', 'asset-pal'] },
        resolvedAssetId: null,
        siblingAssetIds: [],
        siblingCount: 2,
      })
    ).toEqual({ action: 'skip', reason: 'legacy-multi-asset' })

    // Escrita legitima em linha de grupo nao e afetada pela contagem.
    expect(
      decideLineAssetIds({
        current: { id: 'n1', groupId: 'g1', groupRank: 1, assetIds: [] },
        resolvedAssetId: 'asset-vas',
        siblingAssetIds: ['asset-pal'],
        siblingCount: 1,
      })
    ).toEqual({ action: 'write', assetIds: ['asset-vas'] })
  })

  test('nao-regressao do helper: linha unica ganha o asset resolvido; idempotencia vira skip unchanged', () => {
    expect(
      decideLineAssetIds({
        current: { id: 'n9', groupId: null, groupRank: null, assetIds: [] },
        resolvedAssetId: 'asset-vas',
        siblingAssetIds: [],
        siblingCount: 0,
      })
    ).toEqual({ action: 'write', assetIds: ['asset-vas'] })

    expect(
      decideLineAssetIds({
        current: { id: 'n9', groupId: 'g1', groupRank: 1, assetIds: ['asset-vas'] },
        resolvedAssetId: 'asset-vas',
        siblingAssetIds: ['asset-pal'],
        siblingCount: 1,
      })
    ).toEqual({ action: 'skip', reason: 'unchanged' })
  })

  test('siblingAssetIdsFrom achata as linhas irmas e exclui a propria linha', () => {
    expect(
      siblingAssetIdsFrom(
        [
          { id: 'n1', assetIds: ['asset-fla'] },
          { id: 'n2', assetIds: ['asset-pal'] },
          { id: 'n3', assetIds: [] },
        ],
        'n1'
      )
    ).toEqual(['asset-pal'])
  })

  test('siblingCountFrom conta irmao sem asset, que siblingAssetIdsFrom perde', () => {
    const rows = [
      { id: 'n1', assetIds: ['asset-fla'] },
      { id: 'n2', assetIds: [] },
      { id: 'n3', assetIds: [] },
    ]
    // A prova da lacuna: as duas leituras da MESMA consulta divergem, e e por isso que
    // a contagem nao pode ser derivada do achatamento.
    expect(siblingAssetIdsFrom(rows, 'n1')).toEqual([])
    expect(siblingCountFrom(rows, 'n1')).toBe(2)
    expect(siblingCountFrom(rows, 'n9')).toBe(3) // linha fora das rows: todas sao irmas
  })
})

// ---------------------------------------------------------------------------
// Casos 5..7 — E3a e E3b (PATCH /api/v1/admin/news/[id], superficie de grupo)
// ---------------------------------------------------------------------------

describe('E3a/E3b — admin/news/[id] preserva assetIds da linha', () => {
  test('caso 5: PATCH ticker cujo asset e de irmao grava so ticker e reporta o skip', async () => {
    findUniqueNews.mockResolvedValue(adminContextRow())
    findManyNews.mockResolvedValue([{ id: 'n2', assetIds: ['asset-pal'] }])
    findUniqueAsset.mockResolvedValue({ id: 'asset-pal' })

    const res = await adminNewsPATCH(adminPatchReq({ ticker: 'PAL' }), adminPatchCtx('n1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(updateNews).toHaveBeenCalledTimes(1)
    const arg = updateNews.mock.calls[0][0] as { where: unknown; data: Record<string, unknown> }
    expect(arg.where).toEqual({ id: 'n1' })
    expect(arg.data).toEqual({ ticker: 'PAL' })
    expect(Object.keys(arg.data)).not.toContain('assetIds')
    // Zero Silencio: o skip aparece no corpo, nao so no log.
    expect(body.data.assetIdsSkipped).toBe('sibling-owns-asset')
  })

  test('caso 6: PATCH ticker vazio em linha com irmaos vivos -> 422 NEWS-003 sem escrita', async () => {
    findUniqueNews.mockResolvedValue(adminContextRow())
    findManyNews.mockResolvedValue([{ id: 'n2', assetIds: ['asset-pal'] }])

    const res = await adminNewsPATCH(adminPatchReq({ ticker: '' }), adminPatchCtx('n1'))
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error.code).toBe('NEWS-003')
    // A recusa e ANTES da transacao: nem ticker, nem groupData, nem assetIds.
    expect(updateNews).not.toHaveBeenCalled()
    expect(updateManyNews).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  test('caso 14: PATCH ticker vazio com irmao vivo SEM asset -> 422 NEWS-003 (critetio 4 na rota)', async () => {
    findUniqueNews.mockResolvedValue(adminContextRow())
    // Sub-caso reachable que passava antes do recovery: o irmao EXISTE mas nao tem
    // asset, entao o achatamento de `siblingAssetIdsFrom` devolvia `[]`, a regra 2 nao
    // disparava e a rota gravava `assetIds: []` — deixando o grupo com zero vinculos.
    findManyNews.mockResolvedValue([{ id: 'n2', assetIds: [] }])

    const res = await adminNewsPATCH(adminPatchReq({ ticker: '' }), adminPatchCtx('n1'))
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error.code).toBe('NEWS-003')
    expect(updateNews).not.toHaveBeenCalled()
    expect(updateManyNews).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  test('caso 7: publicar ancora sem time cujo titulo resolve para o irmao nao grava ticker nem assetIds', async () => {
    findUniqueNews
      .mockResolvedValueOnce(adminContextRow({ groupRank: 0, ticker: null, assetIds: [] }))
      .mockResolvedValue({ id: 'n1', isPublished: true })
    findManyNews.mockResolvedValue([{ id: 'n2', assetIds: ['asset-pal'] }])
    mockResolveTickerFromTitle.mockResolvedValue('PAL')
    findUniqueAsset.mockResolvedValue({ id: 'asset-pal' })

    const res = await adminNewsPATCH(adminPatchReq({ isPublished: true }), adminPatchCtx('n1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    // Sem lineData: o fallback de publicacao desistiu por inteiro (ticker sem asset
    // reintroduziria a dessincronia do BUGFIX 2026-06-23).
    expect(updateNews).not.toHaveBeenCalled()
    expect(updateManyNews).toHaveBeenCalledTimes(1)
    const groupArg = updateManyNews.mock.calls[0][0] as { where: unknown; data: Record<string, unknown> }
    expect(groupArg.where).toEqual({ groupId: 'g1' })
    expect(groupArg.data).toEqual({ isPublished: true })
    expect(Object.keys(groupArg.data)).not.toContain('assetIds')
    expect(Object.keys(groupArg.data)).not.toContain('ticker')
    expect(body.data.assetIdsSkipped).toBe('sibling-owns-asset')
  })
})

// ---------------------------------------------------------------------------
// Caso 8 — E5 (PATCH /api/v1/admin/news/editorial/[id], superficie de linha)
// ---------------------------------------------------------------------------

describe('E5 — editorial/[id] em linha unica (nao-regressao)', () => {
  test('caso 8: PATCH ticker grava where { id } e assetIds do asset resolvido', async () => {
    findUniqueNews.mockResolvedValue(editorialContextRow())
    findUniqueAsset.mockResolvedValue({ id: 'asset-pal' })
    updateNews.mockResolvedValue({ id: 'n9' })
    jest.spyOn(console, 'warn').mockImplementation(() => {})

    const res = await editorialPATCH(editorialItemReq('n9', { ticker: 'pal' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.assetIdsSkipped).toBeUndefined()
    expect(updateNews).toHaveBeenCalledTimes(1)
    const arg = updateNews.mock.calls[0][0] as { where: unknown; data: Record<string, unknown> }
    expect(arg.where).toEqual({ id: 'n9' })
    expect(arg.data).toEqual({ ticker: 'PAL', assetIds: ['asset-pal'] })
    // group_id nulo cai para linha unica, mas o fallback fica registrado (item 017).
    expect(console.warn).toHaveBeenCalledWith(
      'admin_news_group_scope_fallback',
      expect.objectContaining({ route: 'admin/news/editorial/[id]#PATCH:assetIds', newsId: 'n9' })
    )
    // Nenhuma leitura de irmaos quando nao ha grupo.
    expect(findManyNews).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Caso 9 — E7 (POST /api/v1/admin/news/batch-resolve)
// ---------------------------------------------------------------------------

describe('E7 — batch-resolve em lote misto', () => {
  test('caso 9: linha de grupo sai sem assetIds, linha solta grava, skipped_group === 1', async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    findManyNews
      // scan de "sem time"
      .mockResolvedValueOnce([
        { id: 'n1', title: 'Ancora', content: 'c1', groupId: 'g1', groupRank: 0, assetIds: [] },
        { id: 'n9', title: 'Solta', content: 'c9', groupId: null, groupRank: null, assetIds: [] },
      ])
      // leitura de irmaos em lote (UMA consulta para o grupo do lote)
      .mockResolvedValueOnce([
        { id: 'n1', groupId: 'g1', assetIds: [] },
        { id: 'n2', groupId: 'g1', assetIds: ['asset-pal'] },
      ])
    mockResolveTickerFromText.mockResolvedValue('PAL')
    findUniqueAsset.mockResolvedValue({ id: 'asset-pal' })

    const res = await batchResolvePOST(batchResolveReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    // I-leitura-de-grupo: exatamente duas consultas (scan + irmaos), nunca uma por linha.
    expect(findManyNews).toHaveBeenCalledTimes(2)
    expect(updateNews).toHaveBeenCalledTimes(2)

    const grupo = updateNews.mock.calls[0][0] as { where: unknown; data: Record<string, unknown> }
    expect(grupo.where).toEqual({ id: 'n1' })
    expect(grupo.data).toEqual({ ticker: 'PAL' })

    const solta = updateNews.mock.calls[1][0] as { where: unknown; data: Record<string, unknown> }
    expect(solta.where).toEqual({ id: 'n9' })
    expect(solta.data).toEqual({ ticker: 'PAL', assetIds: ['asset-pal'] })

    expect(body.data.skipped_group).toBe(1)
    expect(body.data.skipped_by_reason['sibling-owns-asset']).toBe(1)
    // Contadores anteriores nao mudam de semantica: as duas linhas foram resolvidas.
    expect(body.data.resolved).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Caso 10 — E8 (GET /api/cron/reconcile-null-tickers)
// ---------------------------------------------------------------------------

describe('E8 — cron reconcile-null-tickers', () => {
  test('caso 10: linha de grupo cujo time e do irmao atualiza so ticker, success true, warn emitido', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'log').mockImplementation(() => {})
    findManyNews
      .mockResolvedValueOnce([
        { id: 'n1', title: 'Ancora do grupo', groupId: 'g1', groupRank: 0, assetIds: [] },
      ])
      .mockResolvedValueOnce([
        { id: 'n1', groupId: 'g1', assetIds: [] },
        { id: 'n2', groupId: 'g1', assetIds: ['asset-pal'] },
      ])
    mockResolveTickerFromTitle.mockResolvedValue('PAL')
    findUniqueAsset.mockResolvedValue({ id: 'asset-pal' })

    const res = await reconcileCronGET(cronReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(updateNews).toHaveBeenCalledTimes(1)
    const arg = updateNews.mock.calls[0][0] as { where: unknown; data: Record<string, unknown> }
    expect(arg.where).toEqual({ id: 'n1' })
    expect(arg.data).toEqual({ ticker: 'PAL' })
    expect(Object.keys(arg.data)).not.toContain('assetIds')

    // Skip NAO e falha: o cron continua verde (comportamento correto sob DB-19).
    expect(body.success).toBe(true)
    expect(body.reconciled).toBe(1)
    expect(body.failed).toBe(0)
    expect(body.skipped_group).toBe(1)
    expect(body.skipped_by_reason['sibling-owns-asset']).toBe(1)
    // Zero Silencio no caminho sem humano: warn por linha.
    expect(warn).toHaveBeenCalledWith(
      '[cron/reconcile-null-tickers] assetIds preservado (DB-19)',
      expect.objectContaining({ newsId: 'n1', groupId: 'g1', reason: 'sibling-owns-asset' })
    )
  })

  test('cron sem Bearer correto continua 401 (nao-regressao de auth)', async () => {
    const res = await reconcileCronGET(cronReq('errado'))
    expect(res.status).toBe(401)
    expect(findManyNews).not.toHaveBeenCalled()
  })
})
