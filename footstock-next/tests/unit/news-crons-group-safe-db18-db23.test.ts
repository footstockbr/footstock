/**
 * Testes unitarios — item 020 do loop 07-28-noticias-multi-time-linha-por-time:
 * DB-18 metade (b) (source.md:1100) e DB-23 (source.md:1105), segunda metade da
 * condicao C9 (source.md:882).
 *
 * Eixo desta suite: nenhum caminho AUTOMATICO nem o DELETE do admin achata grupo
 * multi-time. Suite nova em vez de crescer `admin-news-assetids-db19.test.ts`
 * porque o eixo e outro (DB-18 e DB-23, nao DB-19) e a de 019 ja e longa.
 *
 * Harness reusado das suites de 017 e 019: mock total de `@/lib/prisma`, mock de
 * `@/lib/auth` com `hasAdminRole` como `jest.fn()` que por default devolve `true`
 * (mock fixo em `() => true` deixaria o CASO 6 inexecutavel, porque o gate nunca
 * negaria), mock de `@/lib/utils/resolve-ticker`, `$transaction` que aceita array
 * e callback. `delete` e `deleteMany` entram no mock de `prisma.news` — nenhuma
 * das duas suites existentes mocka delete.
 *
 * Nota de localizacao: o `testMatch` do jest.config.ts cobre APENAS `tests/**`.
 * Suite em `src/**` nunca roda ("No tests found"), por isso ela vive aqui.
 *
 * Regra do harness herdada de 019: cada caso asserta o ARGUMENTO enviado ao
 * Prisma, nao apenas o status HTTP. E o argumento que prova o escopo.
 *
 * Limite de ambiente declarado (F-020-07): os criterios 37, 38 e 39 pedem
 * literalmente SELECT/DELETE sobre seed real. Nao ha DB de dev (F-020-09), entao
 * o predicado do criterio 39 (`count(*) <> max(group_rank) + 1`) e provado sobre
 * o argumento enviado ao `deleteMany`, nao sobre linhas de banco.
 */

import type { NextRequest } from 'next/server'

// --- mocks -----------------------------------------------------------------

jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn(),
  hasAdminRole: jest.fn(),
}))

jest.mock('@/app/api/middleware', () => ({
  withAdmin: () => (handler: unknown) => handler,
}))

jest.mock('@/lib/utils/resolve-ticker', () => ({
  resolveTickerFromTitle: jest.fn(),
  resolveTickerFromText: jest.fn(),
}))

// `@/lib/env` valida o process.env inteiro no import (Zod) e derrubaria a suite;
// os crons daqui so consomem `CRON_SECRET`.
jest.mock('@/lib/env', () => ({
  env: { CRON_SECRET: 'test-cron-secret' },
}))

jest.mock('@/lib/services/NewsSentimentClassifier', () => ({
  classifyNewsSentiment: jest.fn(),
}))

const findUniqueNews = jest.fn()
const findFirstNews = jest.fn()
const findManyNews = jest.fn()
const createNews = jest.fn()
const updateNews = jest.fn()
const updateManyNews = jest.fn()
const deleteNews = jest.fn()
const deleteManyNews = jest.fn()
const countNews = jest.fn()
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
      delete: (...a: unknown[]) => deleteNews(...a),
      deleteMany: (...a: unknown[]) => deleteManyNews(...a),
      count: (...a: unknown[]) => countNews(...a),
    },
    asset: {
      findUnique: (...a: unknown[]) => findUniqueAsset(...a),
      findMany: (...a: unknown[]) => findManyAsset(...a),
    },
    $transaction: (...a: unknown[]) => transaction(a[0]),
  },
}))

import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { resolveTickerFromTitle, resolveTickerFromText } from '@/lib/utils/resolve-ticker'
import { classifyNewsSentiment } from '@/lib/services/NewsSentimentClassifier'
import { DELETE as adminNewsDELETE } from '@/app/api/v1/admin/news/[id]/route'
import { GET as sentimentCronGET } from '@/app/api/cron/classify-news-sentiment/route'
import { GET as reconcileCronGET } from '@/app/api/cron/reconcile-null-tickers/route'
import { POST as batchResolvePOST } from '@/app/api/v1/admin/news/batch-resolve/route'

const mockGetAuthUser = getAuthUser as jest.Mock
const mockHasAdminRole = hasAdminRole as jest.Mock
const mockResolveTickerFromTitle = resolveTickerFromTitle as jest.Mock
const mockResolveTickerFromText = resolveTickerFromText as jest.Mock
const mockClassify = classifyNewsSentiment as jest.Mock

const AUTH = {
  user: { id: 'u1', name: 'Super', email: 's@t.com', adminRole: 'SUPER_ADMIN' },
  userId: 'u1',
}

// --- helpers de request ----------------------------------------------------

function adminDeleteReq(): NextRequest {
  return { cookies: { get: () => undefined } } as unknown as NextRequest
}

function adminDeleteCtx(id: string) {
  return { params: Promise.resolve({ id }) }
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

/** Linha que o findUnique de escopo do DELETE le (`select: { id, groupId }`). */
function deleteContextRow(over: Partial<Record<string, unknown>> = {}) {
  return { id: 'n1', groupId: 'g1', ...over }
}

/** Linha do scan do cron de sentimento (shape do select real de ST002). */
function sentimentRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'n1',
    title: 'Titulo com tamanho suficiente para o classificador',
    content: 'conteudo da noticia',
    groupId: 'g1',
    groupRank: 0,
    ...over,
  }
}

let warnSpy: jest.SpyInstance
let logSpy: jest.SpyInstance
let errorSpy: jest.SpyInstance

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAuthUser.mockResolvedValue(AUTH)
  mockHasAdminRole.mockReturnValue(true)
  mockResolveTickerFromTitle.mockResolvedValue(null)
  mockResolveTickerFromText.mockResolvedValue(null)
  mockClassify.mockResolvedValue('BULLISH')
  updateNews.mockResolvedValue({ id: 'n1' })
  updateManyNews.mockResolvedValue({ count: 2 })
  deleteNews.mockResolvedValue({ id: 'n1' })
  deleteManyNews.mockResolvedValue({ count: 3 })
  countNews.mockResolvedValue(0)
  findManyNews.mockResolvedValue([])
  findUniqueAsset.mockResolvedValue({ id: 'asset-fla' })
  findManyAsset.mockResolvedValue([])
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
  logSpy.mockRestore()
  errorSpy.mockRestore()
})

// ---------------------------------------------------------------------------
// DB-23 / criterio 39 — DELETE e operacao de grupo
// ---------------------------------------------------------------------------

describe('DB-23 / criterio 39 — DELETE de escopo de grupo em admin/news/[id]', () => {
  it('CASO 1: DELETE em IRMAO apaga o grupo inteiro, nunca via delete de linha', async () => {
    findUniqueNews.mockResolvedValue(deleteContextRow({ id: 'n2', groupId: 'g1' }))

    const res = await adminNewsDELETE(adminDeleteReq(), adminDeleteCtx('n2'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(deleteManyNews).toHaveBeenCalledTimes(1)
    expect(deleteManyNews.mock.calls[0][0]).toEqual({ where: { groupId: 'g1' } })
    // `delete` de linha unica e exatamente o que DB-23 remove: ele deixaria o
    // grupo com count(*) <> max(group_rank) + 1.
    expect(deleteNews).not.toHaveBeenCalled()
    expect(body.data.deletedCount).toBe(3)
  })

  it('CASO 2: DELETE na ANCORA apaga o grupo inteiro com o mesmo argumento', async () => {
    findUniqueNews.mockResolvedValue(deleteContextRow({ id: 'n1', groupId: 'g1' }))

    const res = await adminNewsDELETE(adminDeleteReq(), adminDeleteCtx('n1'))

    expect(res.status).toBe(200)
    expect(deleteManyNews.mock.calls[0][0]).toEqual({ where: { groupId: 'g1' } })
    expect(deleteNews).not.toHaveBeenCalled()
  })

  it('CASO 3: [criterio 39] o where do deleteMany nao seleciona SUBCONJUNTO do grupo', async () => {
    // Reescrita do predicado `count(*) <> max(group_rank) + 1` sobre o ARGUMENTO:
    // enquanto nao ha banco, "grupo nao fica mutilado" equivale a "o where nao
    // restringe o grupo a um subconjunto". Qualquer clausula de linha
    // (`id`, `groupRank`, `AND`, `NOT`) reintroduziria a mutilacao.
    findUniqueNews.mockResolvedValue(deleteContextRow({ id: 'n2', groupId: 'g1' }))

    await adminNewsDELETE(adminDeleteReq(), adminDeleteCtx('n2'))

    const where = deleteManyNews.mock.calls[0][0].where as Record<string, unknown>
    expect(Object.keys(where)).toEqual(['groupId'])
    expect(where).not.toHaveProperty('id')
    expect(where).not.toHaveProperty('groupRank')
    expect(where).not.toHaveProperty('AND')
    expect(where).not.toHaveProperty('NOT')
    expect(where).not.toHaveProperty('OR')
  })

  it('CASO 4: linha SEM grupo apaga somente ela e registra o fallback de escopo', async () => {
    findUniqueNews.mockResolvedValue(deleteContextRow({ id: 'n9', groupId: null }))
    deleteManyNews.mockResolvedValue({ count: 1 })

    const res = await adminNewsDELETE(adminDeleteReq(), adminDeleteCtx('n9'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(deleteManyNews.mock.calls[0][0]).toEqual({ where: { id: 'n9' } })
    expect(body.data.deletedCount).toBe(1)
    expect(warnSpy).toHaveBeenCalledWith(
      'admin_news_group_scope_fallback',
      expect.objectContaining({ newsId: 'n9', reason: 'null_group_id' })
    )
  })

  it('CASO 5: linha inexistente devolve 404 NEWS-001 e nao apaga nada', async () => {
    // `deleteMany` nao lanca P2025: sem a leitura previa isto seria 200 com count 0.
    findUniqueNews.mockResolvedValue(null)

    const res = await adminNewsDELETE(adminDeleteReq(), adminDeleteCtx('nope'))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error.code).toBe('NEWS-001')
    expect(deleteManyNews).not.toHaveBeenCalled()
    expect(deleteNews).not.toHaveBeenCalled()
  })

  it('CASO 5b: grupo apagado na janela entre a leitura e o deleteMany devolve 404 (F020-R3)', async () => {
    // TOCTOU real: o findUnique achou a linha, outra requisicao apagou o grupo antes
    // do deleteMany. `deleteMany` nao lanca P2025, entao sem a guarda a rota respondia
    // 200 "deletada com sucesso" com deletedCount 0 — regressao contra o
    // `prisma.news.delete` anterior ao item 020, que caia em P2025 -> 404.
    findUniqueNews.mockResolvedValue(deleteContextRow({ id: 'n2', groupId: 'g1' }))
    deleteManyNews.mockResolvedValueOnce({ count: 0 })

    const res = await adminNewsDELETE(adminDeleteReq(), adminDeleteCtx('n2'))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error.code).toBe('NEWS-001')
    expect(deleteManyNews).toHaveBeenCalledTimes(1)
  })

  it('CASO 6: sem SUPER_ADMIN devolve 403 ADMIN-051 sem ler nem escrever', async () => {
    mockHasAdminRole.mockReturnValueOnce(false)

    const res = await adminNewsDELETE(adminDeleteReq(), adminDeleteCtx('n1'))
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error.code).toBe('ADMIN-051')
    expect(findUniqueNews).not.toHaveBeenCalled()
    expect(deleteManyNews).not.toHaveBeenCalled()
    expect(deleteNews).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// DB-18 metade (b) / criterio 24 — o cron de sentimento exclui linha de grupo
// ---------------------------------------------------------------------------

describe('DB-18(b) / criterio 24 — classify-news-sentiment exclui irmao de grupo', () => {
  it('CASO 7: o where do scan carrega a clausula de grupo e nao alcanca groupRank > 0', async () => {
    findManyNews.mockResolvedValue([])

    const res = await sentimentCronGET(cronReq())
    expect(res.status).toBe(200)

    const where = findManyNews.mock.calls[0][0].where as Record<string, unknown>
    expect(where.sentimentClassifiedAt).toBeNull()
    expect(where.OR).toEqual([{ groupRank: null }, { groupRank: 0 }])
    // Nenhum ramo do predicado admite rank positivo: o unico literal numerico
    // aceito e 0, e nao existe clausula `gt`.
    expect(JSON.stringify(where)).not.toContain('gt')
    const ranks = (where.OR as Array<{ groupRank: number | null }>).map(c => c.groupRank)
    expect(ranks.filter(r => typeof r === 'number' && r > 0)).toHaveLength(0)
  })

  it('CASO 8: linha legada com groupRank NULL continua elegivel (OR, nunca NOT)', async () => {
    findManyNews.mockResolvedValue([])

    await sentimentCronGET(cronReq())

    const where = findManyNews.mock.calls[0][0].where as Record<string, unknown>
    // `NOT: { groupRank: { gt: 0 } }` avalia para NULL em linha com group_rank
    // NULL e a excluiria do cron — quebrando o backfill do acervo RSS (F-020-06).
    expect(where).not.toHaveProperty('NOT')
    expect(where.OR).toContainEqual({ groupRank: null })
  })

  it('CASO 9: remaining usa o MESMO predicado do scan (metrica nao mente)', async () => {
    findManyNews.mockResolvedValue([])
    countNews.mockResolvedValue(42)

    const res = await sentimentCronGET(cronReq())
    const body = await res.json()

    expect(countNews).toHaveBeenCalledTimes(1)
    expect(countNews.mock.calls[0][0].where).toEqual(findManyNews.mock.calls[0][0].where)
    expect(body.remaining).toBe(42)
  })

  it('CASO 13: o log de irmao tocado condiciona em groupRank > 0, nao em groupId != null', async () => {
    // Regressao futura do `where`: um irmao vaza para o scan.
    findManyNews.mockResolvedValueOnce([sentimentRow({ id: 'n2', groupRank: 2 })])

    const res1 = await sentimentCronGET(cronReq())
    const body1 = await res1.json()

    expect(warnSpy).toHaveBeenCalledWith(
      'cron_sentiment_group_row_touched',
      expect.objectContaining({ newsId: 'n2', groupId: 'g1', groupRank: 2 })
    )
    // Criterio 24: o sentimento gravado pelo motor permanece — nada e escrito.
    expect(updateNews).not.toHaveBeenCalled()
    expect(body1.classified).toBe(0)
    expect(body1.skipped_group).toBe(1)

    // Ancora de grupo (groupRank 0) com groupId NAO nulo: o trigger da M067 torna
    // `groupId` sempre preenchido, entao condicionar nele dispararia aqui tambem e
    // cegaria a metrica de source.md:1069 por ruido (F-020-10).
    warnSpy.mockClear()
    findManyNews.mockResolvedValueOnce([sentimentRow({ id: 'n1', groupRank: 0, groupId: 'n1' })])

    const res2 = await sentimentCronGET(cronReq())
    const body2 = await res2.json()

    expect(warnSpy).not.toHaveBeenCalledWith(
      'cron_sentiment_group_row_touched',
      expect.anything()
    )
    expect(updateNews).toHaveBeenCalledTimes(1)
    expect(updateNews.mock.calls[0][0].where).toEqual({ id: 'n1' })
    expect(body2.classified).toBe(1)
    // Ausente quando nao houve skip: mesmo padrao de shape do item 019.
    expect(body2).not.toHaveProperty('skipped_group')
  })
})

// ---------------------------------------------------------------------------
// Criterios 37 e 38 — preservacao de assetIds nos dois reconciliadores (item 019
// entregou o codigo; a prova executavel e do Aceite de 020)
// ---------------------------------------------------------------------------

/**
 * Grupo de 3 (g1) com a linha `n1` sem ticker. `n2` ja e do Palmeiras: se o
 * reconciliador carimbar `asset-pal` em `n1`, o grupo achata (F24).
 */
function installGroupOfThree() {
  findManyNews.mockImplementation((args: { where?: Record<string, unknown> }) => {
    const where = args?.where ?? {}
    // Leitura de irmaos em lote: `where: { groupId: { in: [...] } }`.
    if (where.groupId) {
      return Promise.resolve([
        { id: 'n1', groupId: 'g1', assetIds: ['asset-fla'] },
        { id: 'n2', groupId: 'g1', assetIds: ['asset-pal'] },
        { id: 'n3', groupId: 'g1', assetIds: ['asset-vas'] },
      ])
    }
    // Scan de linhas sem ticker.
    return Promise.resolve([
      {
        id: 'n1',
        title: 'Classico com titulo suficiente para o resolver',
        content: 'conteudo',
        groupId: 'g1',
        groupRank: 0,
        assetIds: ['asset-fla'],
      },
    ])
  })
}

describe('criterios 37 e 38 — reconciliadores preservam assetIds multi-time', () => {
  it('CASO 10: [criterio 37] reconcile-null-tickers escreve por linha e nao achata o grupo', async () => {
    installGroupOfThree()
    mockResolveTickerFromTitle.mockResolvedValue('PAL')
    findUniqueAsset.mockResolvedValue({ id: 'asset-pal' })

    const res = await reconcileCronGET(cronReq())
    expect(res.status).toBe(200)

    expect(updateNews).toHaveBeenCalledTimes(1)
    const call = updateNews.mock.calls[0][0] as { where: unknown; data: Record<string, unknown> }
    // I-linha: escrita nunca cruza group_id (clausula 2 de DB-19).
    expect(call.where).toEqual({ id: 'n1' })
    expect(updateManyNews).not.toHaveBeenCalled()
    // `asset-pal` pertence a um irmao: `assetIds` e OMITIDO, nao trocado por
    // array de um elemento e nao zerado.
    expect(call.data).not.toHaveProperty('assetIds')
    expect(call.data.ticker).toBe('PAL')
  })

  it('CASO 11: [criterio 38] batch-resolve preserva assetIds no mesmo padrao', async () => {
    installGroupOfThree()
    mockResolveTickerFromText.mockResolvedValue('PAL')
    findUniqueAsset.mockResolvedValue({ id: 'asset-pal' })

    const res = await batchResolvePOST(batchResolveReq())
    expect(res.status).toBe(200)

    expect(updateNews).toHaveBeenCalledTimes(1)
    const call = updateNews.mock.calls[0][0] as { where: unknown; data: Record<string, unknown> }
    expect(call.where).toEqual({ id: 'n1' })
    expect(updateManyNews).not.toHaveBeenCalled()
    expect(call.data).not.toHaveProperty('assetIds')
    expect(call.data.ticker).toBe('PAL')
  })
})

// ---------------------------------------------------------------------------
// CASO 12 — varredura transversal (vale mais que os onze anteriores juntos)
// ---------------------------------------------------------------------------

describe('CASO 12 — varredura transversal dos escritores de massa', () => {
  it('nenhuma escrita de massa combina where de grupo com assetIds, e nenhum delete de linha sobrevive', async () => {
    installGroupOfThree()
    mockResolveTickerFromTitle.mockResolvedValue('PAL')
    mockResolveTickerFromText.mockResolvedValue('PAL')
    findUniqueAsset.mockResolvedValue({ id: 'asset-pal' })

    // Os quatro caminhos deste item na mesma varredura. O status de cada um e
    // assertado (F020-R4): se uma rota quebrasse antes de escrever, os lacos abaixo
    // iterariam sobre arrays vazios e a varredura passaria por VACUIDADE.
    const r1 = await reconcileCronGET(cronReq())
    expect(r1.status).toBe(200)
    const r2 = await batchResolvePOST(batchResolveReq())
    expect(r2.status).toBe(200)
    findManyNews.mockResolvedValueOnce([sentimentRow({ id: 'n2', groupRank: 3 })])
    const r3 = await sentimentCronGET(cronReq())
    expect(r3.status).toBe(200)
    findUniqueNews.mockResolvedValue(deleteContextRow({ id: 'n2', groupId: 'g1' }))
    const r4 = await adminNewsDELETE(adminDeleteReq(), adminDeleteCtx('n2'))
    expect(r4.status).toBe(200)

    // Pisos de vacuidade dos lacos 2 e 3: os dois iteram sobre o que foi gravado, e
    // array vazio satisfaz `for` trivialmente. Sem piso para `updateManyNews` (bloco
    // 1) nem para a escrita de sentimento (bloco 4): nos dois o esperado e ZERO
    // chamadas, e a assercao negativa ja e o piso correto.
    expect(deleteManyNews).toHaveBeenCalled()
    expect(updateNews.mock.calls.length).toBeGreaterThan(0)

    // 1. Nenhum updateMany carregando assetIds (clausula 2 de DB-19).
    for (const [arg] of updateManyNews.mock.calls) {
      expect((arg as { data?: Record<string, unknown> }).data ?? {}).not.toHaveProperty('assetIds')
    }
    // 2. Todo update que carrega assetIds usa where de LINHA.
    for (const [arg] of updateNews.mock.calls) {
      const call = arg as { where: Record<string, unknown>; data: Record<string, unknown> }
      if ('assetIds' in (call.data ?? {})) {
        expect(Object.keys(call.where)).toEqual(['id'])
      }
    }
    // 3. `delete` de linha unica esta extinto neste eixo; todo delete e deleteMany
    //    com where de grupo (ou de linha, quando group_id e nulo).
    expect(deleteNews).not.toHaveBeenCalled()
    for (const [arg] of deleteManyNews.mock.calls) {
      const where = (arg as { where: Record<string, unknown> }).where
      expect(Object.keys(where).length).toBe(1)
      expect(['groupId', 'id']).toContain(Object.keys(where)[0])
    }
    // 4. Nenhuma escrita de sentimento em linha de grupo (criterio 24).
    for (const [arg] of updateNews.mock.calls) {
      const call = arg as { data: Record<string, unknown> }
      if ('sentimentClassifiedAt' in (call.data ?? {})) {
        expect(call.data.sentiment).toBeDefined()
        expect(Object.keys((arg as { where: Record<string, unknown> }).where)).toEqual(['id'])
      }
    }
  })
})
