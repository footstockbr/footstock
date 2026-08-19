/**
 * Testes de rota — item 009 / T-08 do loop
 * 08-18-foot-stock-motor-noticias-analise:
 * filtrar a quarentena editorial por default na listagem admin.
 *
 * O GET admin nao filtrava por `editorialBlockReason`, entao a janela de 100
 * grupos era dividida com o passivo `backfill_no_local_team` (10.872 linhas
 * despublicadas em 2026-08-03) e com tudo que o gate do motor barra ao vivo.
 * O fix esconde a quarentena por default e a devolve com `?includeQuarantine=1`,
 * sempre acompanhada do header `X-Quarantine-Count`.
 *
 * A suite mocka `@/lib/prisma` e `@/lib/auth`: nao precisa de banco real.
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

const findManyNews = jest.fn()
const countNews = jest.fn()
// Metodos de escrita EXPOSTOS de proposito: sem eles o teste de nao-escrita
// provaria apenas que o mock e incompleto, nao que a rota nao escreve.
const updateNews = jest.fn()
const updateManyNews = jest.fn()
const deleteNews = jest.fn()
const deleteManyNews = jest.fn()
const createNews = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    news: {
      findMany: (...a: unknown[]) => findManyNews(...a),
      count: (...a: unknown[]) => countNews(...a),
      update: (...a: unknown[]) => updateNews(...a),
      updateMany: (...a: unknown[]) => updateManyNews(...a),
      delete: (...a: unknown[]) => deleteNews(...a),
      deleteMany: (...a: unknown[]) => deleteManyNews(...a),
      create: (...a: unknown[]) => createNews(...a),
    },
  },
}))

import { getAuthUser } from '@/lib/auth'
import { GET as adminNewsGET } from '@/app/api/v1/admin/news/route'

const mockGetAuthUser = getAuthUser as jest.Mock

const AUTH = {
  user: { id: 'u1', name: 'Editor', email: 'e@t.com', adminRole: 'EDITOR' },
  userId: 'u1',
}

/** Request de listagem com query string, no shape que o runtime entrega. */
function listReq(params: Record<string, string> = {}): NextRequest {
  return { nextUrl: { searchParams: new URLSearchParams(params) } } as unknown as NextRequest
}

const CLEAN_ANCHOR = {
  id: 'ok-1',
  groupId: 'g-ok-1',
  groupRank: 0,
  isPublished: true,
  editorialBlockReason: null,
  ticker: 'FLA',
  title: 'Noticia valida',
}

const QUARANTINED_ANCHOR = {
  id: 'blocked-1',
  groupId: 'g-blocked-1',
  groupRank: 0,
  isPublished: false,
  editorialBlockReason: 'backfill_no_local_team',
  ticker: null,
  title: 'Passivo sem time',
}

function listArg() {
  return findManyNews.mock.calls[0][0] as {
    where: Record<string, unknown>
    orderBy: Record<string, unknown>
    take: number
  }
}

/** Argumento da 2a chamada: hidratacao de irmaos por groupId. */
function siblingArg() {
  return findManyNews.mock.calls[1][0] as { where: Record<string, unknown> }
}

const SIBLING_GROUP_WHERE = {
  OR: [
    { groupId: { in: ['g-ok-1'] } },
    { AND: [{ groupId: null }, { id: { in: ['g-ok-1'] } }] },
  ],
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAuthUser.mockResolvedValue(AUTH)
  countNews.mockResolvedValue(0)
})

// ---------------------------------------------------------------------------
// T-08 — variante default: quarentena fora
// ---------------------------------------------------------------------------

describe('T-08 — default esconde a quarentena editorial', () => {
  test('sem parametro, o where exclui linha com editorialBlockReason', async () => {
    findManyNews.mockResolvedValueOnce([CLEAN_ANCHOR]).mockResolvedValueOnce([])
    countNews.mockResolvedValue(3)

    const res = await adminNewsGET(listReq())
    const body = await res.json()

    expect(listArg().where).toEqual({ groupRank: 0, editorialBlockReason: null })
    // O T-06 (orderBy createdAt desc) e a janela de 100 grupos ficam intactos.
    expect(listArg().orderBy).toEqual({ createdAt: 'desc' })
    expect(listArg().take).toBe(100)

    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('ok-1')
    expect(res.headers.get('X-Quarantine-Count')).toBe('3')
  })

  test('valor falsy explicito (0) tambem esconde e mantem o contador', async () => {
    findManyNews.mockResolvedValueOnce([CLEAN_ANCHOR]).mockResolvedValueOnce([])
    countNews.mockResolvedValue(4)

    const res = await adminNewsGET(listReq({ includeQuarantine: '0' }))

    expect(listArg().where).toEqual({ groupRank: 0, editorialBlockReason: null })
    // O contador acompanha TODA variante do parametro, nao so a ausencia dele.
    expect(res.headers.get('X-Quarantine-Count')).toBe('4')
  })

  test('valor irreconhecivel cai no default e loga, sem 500', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    findManyNews.mockResolvedValueOnce([CLEAN_ANCHOR]).mockResolvedValueOnce([])

    const res = await adminNewsGET(listReq({ includeQuarantine: 'sim' }))

    expect(res.status).toBe(200)
    expect(listArg().where).toEqual({ groupRank: 0, editorialBlockReason: null })
    // Assercao especifica: o log tem que nomear o parametro e o valor recusado,
    // senao qualquer warn alheio do runtime satisfaria o teste.
    expect(warn).toHaveBeenCalledTimes(1)
    const warned = String(warn.mock.calls[0][0])
    expect(warned).toContain('includeQuarantine="sim"')
    expect(warned).toContain('quarentena oculta')
    warn.mockRestore()
  })

  test('lista vazia ainda devolve o contador (contrato do controle sempre visivel)', async () => {
    findManyNews.mockResolvedValueOnce([])
    countNews.mockResolvedValue(7)

    const res = await adminNewsGET(listReq())
    const body = await res.json()

    expect(body.data).toEqual([])
    expect(res.headers.get('X-Quarantine-Count')).toBe('7')
  })

  test('zero em quarentena devolve 0 explicito, nunca header ausente', async () => {
    findManyNews.mockResolvedValueOnce([CLEAN_ANCHOR]).mockResolvedValueOnce([])
    countNews.mockResolvedValue(0)

    const res = await adminNewsGET(listReq())

    expect(res.headers.get('X-Quarantine-Count')).toBe('0')
  })
})

// ---------------------------------------------------------------------------
// T-08 — variante includeQuarantine=1: quarentena volta
// ---------------------------------------------------------------------------

describe('T-08 — includeQuarantine=1 reexibe a quarentena', () => {
  test('com o parametro ligado, o where volta a ser so groupRank 0', async () => {
    findManyNews
      .mockResolvedValueOnce([CLEAN_ANCHOR, QUARANTINED_ANCHOR])
      .mockResolvedValueOnce([])
    countNews.mockResolvedValue(1)

    const res = await adminNewsGET(listReq({ includeQuarantine: '1' }))
    const body = await res.json()

    expect(listArg().where).toEqual({ groupRank: 0 })
    expect(body.data).toHaveLength(2)
    expect(body.data.map((n: { id: string }) => n.id)).toEqual(['ok-1', 'blocked-1'])
    // O contador continua vindo mesmo quando nada esta oculto.
    expect(res.headers.get('X-Quarantine-Count')).toBe('1')
  })

  test('true tambem liga', async () => {
    findManyNews.mockResolvedValueOnce([QUARANTINED_ANCHOR]).mockResolvedValueOnce([])

    await adminNewsGET(listReq({ includeQuarantine: 'true' }))

    expect(listArg().where).toEqual({ groupRank: 0 })
  })
})

// ---------------------------------------------------------------------------
// T-08 — o filtro nao escreve nada
// ---------------------------------------------------------------------------

describe('T-08 — nenhuma linha e apagada ou despublicada', () => {
  test('o GET so le: count + findMany, nenhuma escrita', async () => {
    findManyNews.mockResolvedValueOnce([CLEAN_ANCHOR]).mockResolvedValueOnce([])

    await adminNewsGET(listReq())

    // Duas contagens e a listagem sao as unicas queries. A segunda contagem
    // entrou com o T-09 (item 010): e o `total` do bloco `pagination`, contado
    // sobre o MESMO where da listagem. O contador da quarentena continua sendo o
    // primeiro do `Promise.all` e nao mudou de shape.
    // Os metodos de escrita estao disponiveis no mock: se a rota chamasse
    // qualquer um, os expects abaixo falhariam em vez de estourar TypeError por
    // metodo ausente.
    expect(countNews).toHaveBeenCalledTimes(2)
    expect(countNews.mock.calls[0][0]).toEqual({
      where: { groupRank: 0, editorialBlockReason: { not: null } },
    })
    expect(countNews.mock.calls[1][0]).toEqual({
      where: { groupRank: 0, editorialBlockReason: null },
    })
    expect(findManyNews).toHaveBeenCalledTimes(2)
    expect(updateNews).not.toHaveBeenCalled()
    expect(updateManyNews).not.toHaveBeenCalled()
    expect(deleteNews).not.toHaveBeenCalled()
    expect(deleteManyNews).not.toHaveBeenCalled()
    expect(createNews).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// T-08 — o filtro tambem vale para a hidratacao de irmaos
// ---------------------------------------------------------------------------

describe('T-08 — irmaos herdam o filtro da ancora', () => {
  test('no default, a query de irmaos exige editorialBlockReason null', async () => {
    findManyNews.mockResolvedValueOnce([CLEAN_ANCHOR]).mockResolvedValueOnce([])

    await adminNewsGET(listReq())

    expect(siblingArg().where).toEqual({
      AND: [SIBLING_GROUP_WHERE, { editorialBlockReason: null }],
    })
  })

  test('com includeQuarantine=1, a query de irmaos volta a ser so por grupo', async () => {
    findManyNews.mockResolvedValueOnce([CLEAN_ANCHOR]).mockResolvedValueOnce([])

    await adminNewsGET(listReq({ includeQuarantine: '1' }))

    expect(siblingArg().where).toEqual(SIBLING_GROUP_WHERE)
  })
})
