/**
 * Testes unitarios — item 017 do loop 07-28-noticias-multi-time-linha-por-time:
 * rotas admin de noticias group-safe.
 *
 * Cobre os criterios 21 (admin lista grupos, nao linhas), 22 (PATCH/arquivamento
 * com escopo de grupo por padrao) e 23 (edicao individual restrita ao par
 * ticker/sentimento, 422 no resto), mais nao-regressao dos criterios 14 (sem grupo
 * fantasma) e 17 (noticia de time unico identica).
 *
 * Nota de localizacao: o `testMatch` do jest.config.ts cobre APENAS `tests/**`.
 * Suite em `src/**` nunca roda ("No tests found"), por isso ela vive aqui.
 *
 * `@/lib/prisma` e mockado por completo: o arquivo real importa 'server-only' e
 * abre conexao no import. Cada caso asserta o ARGUMENTO enviado ao Prisma, nao
 * apenas o status HTTP — e o argumento que prova o escopo de grupo.
 *
 * As duas familias de rota autenticam de formas diferentes e a suite reflete isso:
 * `admin/news/*` usa `getAuthUser`/`hasAdminRole` de `@/lib/auth`; `editorial/*`
 * usa o wrapper `withAdmin` de `@/app/api/middleware`.
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

const findUniqueNews = jest.fn()
const findFirstNews = jest.fn()
const findManyNews = jest.fn()
const createNews = jest.fn()
const updateNews = jest.fn()
const updateManyNews = jest.fn()
const findUniqueAsset = jest.fn()
const findManyAsset = jest.fn()

// Duas formas de $transaction convivem nesta suite: o PATCH group-safe (item 017)
// passa um ARRAY de operacoes; o `writeNewsGroup` do POST multi-time (item 018)
// passa um CALLBACK que recebe o client transacional. O client entregue ao
// callback reusa os mesmos mocks de news.*, entao as assercoes valem nos dois.
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
import { resolveTickerFromText } from '@/lib/utils/resolve-ticker'
import { GET as adminNewsGET, POST as adminNewsPOST } from '@/app/api/v1/admin/news/route'
import { PATCH as adminNewsPATCH } from '@/app/api/v1/admin/news/[id]/route'
import { GET as editorialGET } from '@/app/api/v1/admin/news/editorial/route'
import {
  PATCH as editorialPATCH,
  DELETE as editorialDELETE,
} from '@/app/api/v1/admin/news/editorial/[id]/route'

const mockGetAuthUser = getAuthUser as jest.Mock
const mockResolveTickerFromText = resolveTickerFromText as jest.Mock

const AUTH = {
  user: { id: 'u1', name: 'Editor', email: 'e@t.com', adminRole: 'EDITOR' },
  userId: 'u1',
}

const OLD_PUBLISHED = new Date('2026-07-01T10:00:00.000Z')

// --- helpers de request ----------------------------------------------------

function adminListReq(): NextRequest {
  return {} as unknown as NextRequest
}

function adminPatchReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

function adminPatchCtx(id: string) {
  return { params: Promise.resolve({ id }) }
}

function editorialListReq(params: Record<string, string> = {}): NextRequest {
  const searchParams = new URLSearchParams(params)
  return { nextUrl: { searchParams } } as unknown as NextRequest
}

function editorialItemReq(id: string, body?: unknown): NextRequest {
  return {
    nextUrl: { pathname: `/api/v1/admin/news/editorial/${id}` },
    json: async () => body,
  } as unknown as NextRequest
}

/** Estado da linha carregada pelo findUnique de escopo do PATCH de grupo. */
function newsRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    groupId: 'g1',
    groupRank: 0,
    source: null,
    publishedAt: null,
    ticker: 'FLA',
    title: 'Titulo original com tamanho suficiente',
    ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAuthUser.mockResolvedValue(AUTH)
  mockResolveTickerFromText.mockResolvedValue(null)
  createNews.mockResolvedValue({ id: 'n1' })
  updateNews.mockResolvedValue({ id: 'n1' })
  updateManyNews.mockResolvedValue({ count: 3 })
  findUniqueAsset.mockResolvedValue({ id: 'asset-fla' })
  findManyAsset.mockResolvedValue([])
})

// ---------------------------------------------------------------------------
// Criterio 21 — listagens contam grupos, nao linhas
// ---------------------------------------------------------------------------

describe('criterio 21 — listagens admin ancoradas em grupo', () => {
  test('caso 1: GET /admin/news filtra groupRank 0 e 10 grupos de 3 devolvem 10 itens', async () => {
    const anchors = Array.from({ length: 10 }, (_, i) => ({
      id: `n${i}`,
      groupId: `g${i}`,
      groupRank: 0,
    }))
    findManyNews.mockResolvedValue(anchors)

    const res = await adminNewsGET(adminListReq())
    const body = await res.json()

    expect(findManyNews).toHaveBeenCalledTimes(1)
    const arg = findManyNews.mock.calls[0][0] as { where: Record<string, unknown>; take: number }
    expect(arg.where).toEqual({ groupRank: 0 })
    expect(arg.take).toBe(100)
    expect(body.data).toHaveLength(10)
  })

  test('caso 2: GET /editorial filtra groupRank 0 junto do filtro de status', async () => {
    findManyNews.mockResolvedValue([])

    const res = await editorialGET(editorialListReq({ status: 'ALL' }))
    expect(res.status).toBe(200)

    const arg = findManyNews.mock.calls[0][0] as { where: Record<string, unknown>; take: number }
    expect(arg.where).toMatchObject({ groupRank: 0 })
    expect(arg.take).toBe(200)
  })

  test('caso 3: GET /editorial?ticker casando em IRMAO nao perde o grupo', async () => {
    findUniqueAsset.mockResolvedValue({ id: 'asset-pal' })
    // A linha que casa no ticker e o irmao (rank 1); a ancora do grupo e n1.
    findManyNews
      .mockResolvedValueOnce([{ id: 'n2', groupId: 'g1' }])
      .mockResolvedValueOnce([
        { id: 'n1', groupId: 'g1', groupRank: 0, assetIds: ['asset-fla'] },
      ])

    const res = await editorialGET(editorialListReq({ status: 'ALL', ticker: 'PAL' }))
    const body = await res.json()

    // 1a chamada: resolve os group_id que tem alguma linha casando no ticker.
    const matchArg = findManyNews.mock.calls[0][0] as { where: Record<string, unknown>; take: number }
    expect(matchArg.where).toEqual({ assetIds: { has: 'asset-pal' } })
    expect(matchArg.take).toBe(200)

    // 2a chamada: ancora DENTRO desses grupos — nunca `assetIds has` + groupRank 0.
    const listArg = findManyNews.mock.calls[1][0] as { where: Record<string, unknown> }
    expect(listArg.where).toMatchObject({ groupRank: 0 })
    expect(listArg.where.assetIds).toBeUndefined()
    expect(listArg.where.OR).toEqual([
      { groupId: { in: ['g1'] } },
      { AND: [{ groupId: null }, { id: { in: ['g1'] } }] },
    ])
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('n1')
  })
})

// ---------------------------------------------------------------------------
// Criterio 22 — PATCH, publicacao e arquivamento com escopo de grupo
// ---------------------------------------------------------------------------

describe('criterio 22 — PATCH group-safe em /admin/news/[id]', () => {
  test('caso 4: PATCH de title faz fan-out por groupId', async () => {
    findUniqueNews.mockResolvedValue(newsRow())

    const res = await adminNewsPATCH(
      adminPatchReq({ title: 'Titulo novo do irmao' }),
      adminPatchCtx('n1')
    )
    const body = await res.json()

    expect(updateManyNews).toHaveBeenCalledTimes(1)
    const arg = updateManyNews.mock.calls[0][0] as {
      where: Record<string, unknown>
      data: Record<string, unknown>
    }
    expect(arg.where).toEqual({ groupId: 'g1' })
    expect(arg.data).toEqual({ title: 'Titulo novo do irmao' })
    expect(updateNews).not.toHaveBeenCalled()
    expect(body.data.groupAffected).toBe(3)
  })

  test('caso 5: PATCH de sentiment fica na LINHA (sem updateMany)', async () => {
    findUniqueNews.mockResolvedValue(newsRow())

    await adminNewsPATCH(adminPatchReq({ sentiment: 'BEARISH' }), adminPatchCtx('n1'))

    expect(updateManyNews).not.toHaveBeenCalled()
    expect(updateNews).toHaveBeenCalledTimes(1)
    const arg = updateNews.mock.calls[0][0] as {
      where: Record<string, unknown>
      data: Record<string, unknown>
    }
    expect(arg.where).toEqual({ id: 'n1' })
    expect(arg.data).toEqual({ sentiment: 'BEARISH' })
  })

  test('caso 6: PATCH misto grava as duas escritas dentro de $transaction', async () => {
    findUniqueNews.mockResolvedValue(newsRow())

    await adminNewsPATCH(
      adminPatchReq({ title: 'Titulo novo do irmao', sentiment: 'BULLISH' }),
      adminPatchCtx('n1')
    )

    expect(transaction).toHaveBeenCalledTimes(1)
    // update (linha) + updateMany (grupo) + leitura final, tudo numa transacao.
    const ops = transaction.mock.calls[0][0] as unknown[]
    expect(ops).toHaveLength(3)
    expect(updateNews).toHaveBeenCalledTimes(1)
    expect(updateManyNews).toHaveBeenCalledTimes(1)
  })

  test('caso 7: arquivar um irmao arquiva o grupo com archivedAt unico (c22, c14)', async () => {
    findUniqueNews.mockResolvedValue(newsRow({ groupRank: 1 }))

    await adminNewsPATCH(adminPatchReq({ isArchived: true }), adminPatchCtx('n2'))

    expect(updateManyNews).toHaveBeenCalledTimes(1)
    const arg = updateManyNews.mock.calls[0][0] as {
      where: Record<string, unknown>
      data: Record<string, unknown>
    }
    expect(arg.where).toEqual({ groupId: 'g1' })
    expect(arg.data.isArchived).toBe(true)
    expect(arg.data.archivedAt).toBeInstanceOf(Date)
    // Uma unica escrita para o grupo inteiro = mesmo timestamp em todas as linhas.
    expect(updateNews).not.toHaveBeenCalled()
  })

  test('caso 8: publicar irmao de grupo ja publicado preserva o publishedAt da ANCORA', async () => {
    // Linha editada e um irmao sem publishedAt proprio; a ancora ja tem data.
    findUniqueNews.mockResolvedValue(newsRow({ groupRank: 1, publishedAt: null }))
    findFirstNews.mockResolvedValue({ publishedAt: OLD_PUBLISHED })

    await adminNewsPATCH(adminPatchReq({ isPublished: true }), adminPatchCtx('n2'))

    expect(findFirstNews).toHaveBeenCalledWith({
      where: { groupId: 'g1', groupRank: 0 },
      select: { publishedAt: true },
    })
    const arg = updateManyNews.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data.isPublished).toBe(true)
    expect(arg.data.publishedAt).toBeUndefined()
  })

  test('caso 9: groupId nulo cai para escopo de linha e registra o fallback', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    findUniqueNews.mockResolvedValue(newsRow({ groupId: null }))

    await adminNewsPATCH(
      adminPatchReq({ title: 'Titulo novo sem grupo' }),
      adminPatchCtx('n9')
    )

    const arg = updateManyNews.mock.calls[0][0] as { where: Record<string, unknown> }
    expect(arg.where).toEqual({ id: 'n9' })
    expect(warn).toHaveBeenCalledWith(
      'admin_news_group_scope_fallback',
      expect.objectContaining({ newsId: 'n9', reason: 'null_group_id' })
    )
    warn.mockRestore()
  })

  test('caso 10: PATCH de title em noticia com source preserva o 403 NEWS-002', async () => {
    findUniqueNews.mockResolvedValue(newsRow({ source: 'ge.globo' }))

    const res = await adminNewsPATCH(
      adminPatchReq({ title: 'Titulo novo de fonte externa' }),
      adminPatchCtx('n1')
    )
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error.code).toBe('NEWS-002')
    expect(updateManyNews).not.toHaveBeenCalled()
    expect(updateNews).not.toHaveBeenCalled()
  })

  test('caso 11: PATCH de source e aceito e aplicado por updateMany no grupo', async () => {
    findUniqueNews.mockResolvedValue(newsRow())

    const res = await adminNewsPATCH(
      adminPatchReq({ source: 'redacao-interna' }),
      adminPatchCtx('n1')
    )

    expect(res.status).toBe(200)
    const arg = updateManyNews.mock.calls[0][0] as {
      where: Record<string, unknown>
      data: Record<string, unknown>
    }
    expect(arg.where).toEqual({ groupId: 'g1' })
    expect(arg.data).toEqual({ source: 'redacao-interna' })
  })
})

// ---------------------------------------------------------------------------
// Criterio 23 — superficie de LINHA aceita so (ticker, sentiment)
// ---------------------------------------------------------------------------

describe('criterio 23 — 422 na edicao editorial individual', () => {
  test('caso 12: PATCH /editorial/[id] { title } retorna 422 nomeando o campo', async () => {
    const res = await editorialPATCH(
      editorialItemReq('n1', { title: 'Titulo novo pela rota de linha' })
    )
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.fields).toEqual(['title'])
    expect(body.error).toContain('rota de grupo')
    expect(updateNews).not.toHaveBeenCalled()
    expect(updateManyNews).not.toHaveBeenCalled()
  })

  test('caso 13: PATCH /editorial/[id] { content } retorna 422', async () => {
    const res = await editorialPATCH(
      editorialItemReq('n1', { content: 'Conteudo novo pela rota de linha' })
    )
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.fields).toEqual(['content'])
  })

  test('caso 14: PATCH /editorial/[id] { status: ARCHIVED } retorna 422', async () => {
    const res = await editorialPATCH(editorialItemReq('n1', { status: 'ARCHIVED' }))
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.fields).toEqual(['status'])
    expect(updateNews).not.toHaveBeenCalled()
  })

  test('caso 15: PATCH /editorial/[id] { ticker, sentiment } segue 200 na linha com assetIds sincronizado', async () => {
    findUniqueAsset.mockResolvedValue({ id: 'asset-pal' })
    updateNews.mockResolvedValue({ id: 'n1' })

    const res = await editorialPATCH(
      editorialItemReq('n1', { ticker: 'pal', sentiment: 'BULLISH' })
    )

    expect(res.status).toBe(200)
    expect(updateManyNews).not.toHaveBeenCalled()
    const arg = updateNews.mock.calls[0][0] as {
      where: Record<string, unknown>
      data: Record<string, unknown>
    }
    expect(arg.where).toEqual({ id: 'n1' })
    expect(arg.data).toMatchObject({
      sentiment: 'BULLISH',
      ticker: 'PAL',
      assetIds: ['asset-pal'],
    })
  })
})

// ---------------------------------------------------------------------------
// Criterio 22 na superficie editorial — soft delete por grupo
// ---------------------------------------------------------------------------

describe('criterio 22 — soft delete editorial por grupo', () => {
  test('caso 16: DELETE /editorial/[id] arquiva o grupo inteiro', async () => {
    findUniqueNews.mockResolvedValue({ groupId: 'g1' })

    const res = await editorialDELETE(editorialItemReq('n1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    const arg = updateManyNews.mock.calls[0][0] as {
      where: Record<string, unknown>
      data: Record<string, unknown>
    }
    expect(arg.where).toEqual({ groupId: 'g1' })
    expect(arg.data).toEqual({ isPublished: false })
    expect(body.data).toEqual({ id: 'n1', groupAffected: 3 })
  })

  test('caso 17 (ST006): DELETE /editorial/[id] de id inexistente retorna 404', async () => {
    findUniqueNews.mockResolvedValue(null)

    const res = await editorialDELETE(editorialItemReq('nao-existe'))

    expect(res.status).toBe(404)
    expect(updateManyNews).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Criterio 17 — retrocompatibilidade do acervo unitario
// ---------------------------------------------------------------------------

describe('criterio 17 — noticia de time unico continua identica', () => {
  test('caso 18: linha com groupId = id e groupRank 0 afeta exatamente 1 linha', async () => {
    findUniqueNews.mockResolvedValue(newsRow({ groupId: 'n1', groupRank: 0 }))
    updateManyNews.mockResolvedValue({ count: 1 })

    const res = await adminNewsPATCH(
      adminPatchReq({ title: 'Titulo novo de noticia unitaria' }),
      adminPatchCtx('n1')
    )
    const body = await res.json()

    const arg = updateManyNews.mock.calls[0][0] as { where: Record<string, unknown> }
    expect(arg.where).toEqual({ groupId: 'n1' })
    expect(body.data.groupAffected).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Item 018 — POST /admin/news cria grupo multi-time (criterios 1, 3, 17)
// ---------------------------------------------------------------------------

// Nota estrutural: esta suite NAO mocka `@/lib/redis` e o caminho multi-time
// passa. Se algum dia precisar do mock, o `writeNewsGroup` vazou dependencia de
// Redis e o helper esta errado — a rota editorial nao publica evento nenhum.
describe('item 018 — POST /admin/news com times adicionais', () => {
  const BASE_BODY = {
    title: 'Transferencia entre dois clubes',
    content: 'Jogador troca de clube nesta janela.',
    impact: 'ESPORTIVA_MAJORITARIA',
    sentiment: 'BULLISH',
    ticker: 'FLA',
    isPublished: true,
  }

  function postReq(body: unknown): NextRequest {
    return { json: async () => body, cookies: { get: () => undefined } } as unknown as NextRequest
  }

  test('caso 21: sem additionalTeams o create e identico ao de antes (criterio 17)', async () => {
    createNews.mockResolvedValue({ id: 'n1', groupId: 'n1', groupRank: 0 })

    const res = await adminNewsPOST(postReq(BASE_BODY))
    expect(res.status).toBe(201)

    expect(transaction).not.toHaveBeenCalled()
    expect(createNews).toHaveBeenCalledTimes(1)
    const data = (createNews.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data.ticker).toBe('FLA')
    expect(data.assetIds).toEqual(['asset-fla'])
    // Sem transacao E sem group_id/group_rank: quem preenche e o trigger
    // news_group_defaults_trg (DB-03).
    expect('groupId' in data).toBe(false)
    expect('groupRank' in data).toBe(false)
  })

  test('caso 22: 3 times gravam 3 linhas irmas com ranks 0,1,2 dentro de $transaction', async () => {
    createNews
      .mockResolvedValueOnce({ id: 'n-anchor', groupRank: 0 })
      .mockResolvedValueOnce({ id: 'n-sib-1' })
      .mockResolvedValueOnce({ id: 'n-sib-2' })
    findUniqueAsset
      .mockResolvedValueOnce({ id: 'asset-fla' })
      .mockResolvedValueOnce({ id: 'asset-pal' })
      .mockResolvedValueOnce({ id: 'asset-cor' })

    const res = await adminNewsPOST(
      postReq({
        ...BASE_BODY,
        additionalTeams: [
          { ticker: 'PAL', sentiment: 'BEARISH' },
          { ticker: 'COR', sentiment: 'NEUTRAL' },
        ],
      })
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(typeof transaction.mock.calls[0][0]).toBe('function')
    expect(createNews).toHaveBeenCalledTimes(3)

    const datas = createNews.mock.calls.map(
      (c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data
    )
    expect(datas.map((d) => d.ticker)).toEqual(['FLA', 'PAL', 'COR'])
    expect(datas.map((d) => d.sentiment)).toEqual(['BULLISH', 'BEARISH', 'NEUTRAL'])
    expect(datas.map((d) => d.assetIds)).toEqual([['asset-fla'], ['asset-pal'], ['asset-cor']])
    expect(datas.map((d) => d.groupRank)).toEqual([0, 1, 2])
    // Ancora sai sem groupId (o update abaixo o afirma); irmas ja nascem com ele.
    expect(datas[0].groupId).toBeUndefined()
    expect(datas.slice(1).map((d) => d.groupId)).toEqual(['n-anchor', 'n-anchor'])
    expect(updateNews).toHaveBeenCalledWith({
      where: { id: 'n-anchor' },
      data: { groupId: 'n-anchor' },
    })

    // Fato unico: titulo, conteudo, impacto e publishedAt sao os MESMOS nas tres.
    for (const d of datas.slice(1)) {
      expect(d.title).toBe(datas[0].title)
      expect(d.content).toBe(datas[0].content)
      expect(d.impact).toBe(datas[0].impact)
      expect(d.publishedAt).toBe(datas[0].publishedAt)
    }

    // A fixture AUTH tem adminRole EDITOR: o caminho multi-time NAO endurece a
    // matriz de roles, e o author gravado prova quem criou.
    expect(AUTH.user.adminRole).toBe('EDITOR')
    expect(datas.every((d) => d.author === 'Editor')).toBe(true)

    // Retorno e a ancora com o groupId ja resolvido: e por ela que o admin lista.
    expect(body.data.id).toBe('n-anchor')
    expect(body.data.groupId).toBe('n-anchor')
  })

  test('caso 23: grupo em rascunho nao recebe publishedAt em nenhuma linha', async () => {
    createNews.mockResolvedValueOnce({ id: 'n-anchor' }).mockResolvedValueOnce({ id: 'n-sib-1' })
    findUniqueAsset.mockResolvedValue({ id: 'asset-fla' })

    const res = await adminNewsPOST(
      postReq({
        ...BASE_BODY,
        isPublished: false,
        additionalTeams: [{ ticker: 'PAL', sentiment: 'BEARISH' }],
      })
    )

    expect(res.status).toBe(201)
    const datas = createNews.mock.calls.map(
      (c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data
    )
    expect(datas).toHaveLength(2)
    expect(datas.every((d) => d.publishedAt === null)).toBe(true)
    expect(datas.every((d) => d.isPublished === false)).toBe(true)
  })

  test('caso 24: irmao com ticker sem Asset grava a linha com assetIds vazio', async () => {
    createNews.mockResolvedValueOnce({ id: 'n-anchor' }).mockResolvedValueOnce({ id: 'n-sib-1' })
    findUniqueAsset
      .mockResolvedValueOnce({ id: 'asset-fla' })
      .mockResolvedValueOnce(null)

    const res = await adminNewsPOST(
      postReq({ ...BASE_BODY, additionalTeams: [{ ticker: 'XPTO', sentiment: 'BEARISH' }] })
    )

    // Endpoint editorial nao publica evento de motor, entao linha sem asset e
    // apenas conteudo — nao derruba a criacao (diferente de /inject).
    expect(res.status).toBe(201)
    const datas = createNews.mock.calls.map(
      (c: unknown[]) => (c[0] as { data: Record<string, unknown> }).data
    )
    expect(datas[1].ticker).toBe('XPTO')
    expect(datas[1].assetIds).toEqual([])
  })

  test('caso 25: 3 times adicionais devolvem 422 com a mensagem do teto, nao a generica', async () => {
    const res = await adminNewsPOST(
      postReq({
        ...BASE_BODY,
        additionalTeams: [
          { ticker: 'PAL', sentiment: 'BEARISH' },
          { ticker: 'COR', sentiment: 'NEUTRAL' },
          { ticker: 'SAO', sentiment: 'BULLISH' },
        ],
      })
    )
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error.code).toBe('VAL-001')
    expect(body.error.message).toContain('no maximo 3 times')
    expect(createNews).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  test('caso 26: ticker repetido devolve 422 legivel — inclusive contra o principal', async () => {
    const contraPrincipal = await adminNewsPOST(
      postReq({ ...BASE_BODY, additionalTeams: [{ ticker: 'fla', sentiment: 'BEARISH' }] })
    )
    const body1 = await contraPrincipal.json()
    expect(contraPrincipal.status).toBe(422)
    expect(body1.error.message).toContain('Ticker repetido no grupo: FLA')

    const entreIrmaos = await adminNewsPOST(
      postReq({
        ...BASE_BODY,
        additionalTeams: [
          { ticker: 'PAL', sentiment: 'BEARISH' },
          { ticker: 'PAL', sentiment: 'NEUTRAL' },
        ],
      })
    )
    expect(entreIrmaos.status).toBe(422)

    // Nenhuma escrita: o 422 chega antes do P2002 do indice unico parcial (DB-05).
    expect(createNews).not.toHaveBeenCalled()
  })

  test('caso 27: time adicional sem ticker devolve 422 com a mensagem da linha vazia', async () => {
    const res = await adminNewsPOST(
      postReq({ ...BASE_BODY, additionalTeams: [{ ticker: '', sentiment: 'BEARISH' }] })
    )
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error.message).toBe(
      'Time adicional sem ticker. Escolha o time ou remova a linha.'
    )
    // Nao cai na generica de titulo/conteudo/impacto: o operador precisa saber que
    // o problema esta na linha de time (Zero Silencio).
    expect(body.error.message).not.toContain('Verifique titulo')
    expect(createNews).not.toHaveBeenCalled()
  })

  test('caso 28: irmao repetindo ticker AUTO-DETECTADO tambem cai em 422, nao em P2002', async () => {
    // Ticker principal ausente no body: quem resolve e a auto-deteccao, depois do
    // superRefine do schema. A recheca pos-resolucao e a unica barreira aqui.
    mockResolveTickerFromText.mockResolvedValue('PAL')

    const res = await adminNewsPOST(
      postReq({
        ...BASE_BODY,
        ticker: '',
        additionalTeams: [{ ticker: 'PAL', sentiment: 'BEARISH' }],
      })
    )
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error.message).toContain('Ticker repetido no grupo: PAL')
    expect(createNews).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Correcoes pos-auditoria do item 017
// ---------------------------------------------------------------------------

describe('correcoes pos-auditoria — teto de grupos e falso sucesso em corrida', () => {
  test('caso 19: filtro por ticker com mais de 200 linhas pagina por grupos DISTINTOS e nao omite grupo recente', async () => {
    findUniqueAsset.mockResolvedValue({ id: 'asset-pal' })

    // 200 linhas (pagina cheia) concentradas em 2 grupos: um `take: 200` cru sobre
    // LINHAS pararia aqui, com apenas 2 grupos resolvidos. A varredura tem que
    // continuar porque o teto e de CHAVES DISTINTAS, nao de linhas.
    const pagina1 = Array.from({ length: 200 }, (_, i) => ({
      id: `linha-${i}`,
      groupId: i % 2 === 0 ? 'g-antigo-a' : 'g-antigo-b',
    }))
    // Grupo recente que so aparece na 2a pagina — era exatamente o que se perdia.
    const pagina2 = [{ id: 'n-novo', groupId: 'g-recente' }]

    findManyNews
      .mockResolvedValueOnce(pagina1)
      .mockResolvedValueOnce(pagina2)
      .mockResolvedValueOnce([
        { id: 'n-novo', groupId: 'g-recente', groupRank: 0, assetIds: ['asset-pal'] },
      ])

    const res = await editorialGET(editorialListReq({ status: 'ALL', ticker: 'PAL' }))
    const body = await res.json()

    expect(res.status).toBe(200)

    // 1a varredura: ordenacao deterministica (recencia + tie-break unico por id).
    const scan1 = findManyNews.mock.calls[0][0] as {
      where: Record<string, unknown>
      orderBy: unknown
      take: number
      cursor?: unknown
    }
    expect(scan1.where).toEqual({ assetIds: { has: 'asset-pal' } })
    expect(scan1.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }])
    expect(scan1.take).toBe(200)
    expect(scan1.cursor).toBeUndefined()

    // 2a varredura: continua da ultima linha da pagina cheia, via cursor.
    const scan2 = findManyNews.mock.calls[1][0] as { cursor: unknown; skip: number }
    expect(scan2.cursor).toEqual({ id: 'linha-199' })
    expect(scan2.skip).toBe(1)

    // A listagem final recebe as 3 chaves de grupo, incluindo a recente.
    const listArg = findManyNews.mock.calls[2][0] as { where: Record<string, unknown> }
    expect(listArg.where.OR).toEqual([
      { groupId: { in: ['g-antigo-a', 'g-antigo-b', 'g-recente'] } },
      { AND: [{ groupId: null }, { id: { in: ['g-antigo-a', 'g-antigo-b', 'g-recente'] } }] },
    ])
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('n-novo')
  })

  test('caso 20: PATCH de grupo com linha removida em corrida devolve 404 NEWS-001, nao 200 vazio', async () => {
    findUniqueNews.mockResolvedValue(newsRow())
    // A linha existia na leitura de escopo e desapareceu antes da escrita:
    // updateMany nao lanca P2025, apenas devolve count 0.
    updateManyNews.mockResolvedValue({ count: 0 })

    const res = await adminNewsPATCH(
      adminPatchReq({ title: 'Titulo novo que nao vai encontrar linha' }),
      adminPatchCtx('n1')
    )
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error.code).toBe('NEWS-001')
  })
})
