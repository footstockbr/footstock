/**
 * Testes de rota — item 010 / T-09 do loop
 * 08-18-foot-stock-motor-noticias-analise: paginar a listagem admin de noticias.
 *
 * Antes deste item o GET servia uma janela fixa (`take: 100`, sem `skip`) e nao
 * devolvia o tamanho do acervo: grupo 101 em diante era inalcancavel por qualquer
 * caminho de UI. O fix adota o mesmo contrato de lista que o resto de `/api/v1`
 * (`page`/`limit` via `parsePagination`, body `{ data, pagination }` via `list`),
 * com `total` contado sobre o MESMO `where` da listagem.
 *
 * A suite mocka `@/lib/prisma` e `@/lib/auth`: nao precisa de banco real. O mock
 * de `prisma.news` EXPOE os metodos de escrita de proposito — sem eles o teste de
 * nao-escrita provaria apenas que o mock e incompleto (licao do item 009).
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

function anchor(n: number) {
  return {
    id: `n-${n}`,
    groupId: `g-${n}`,
    groupRank: 0,
    isPublished: true,
    editorialBlockReason: null,
    ticker: 'FLA',
    title: `Noticia ${n}`,
  }
}

/** Argumento do findMany das ancoras (1a chamada). */
function listArg() {
  return findManyNews.mock.calls[0][0] as {
    where: Record<string, unknown>
    orderBy: Record<string, unknown>
    skip: number
    take: number
  }
}

/**
 * `where` de cada `count`. A rota dispara os dois em `Promise.all`: o da
 * quarentena primeiro, o do total depois. Buscar pelo shape (e nao pelo indice)
 * mantem o teste honesto se a ordem mudar.
 */
function countWheres() {
  return countNews.mock.calls.map((c) => (c[0] as { where: Record<string, unknown> }).where)
}

function totalCountWhere() {
  return countWheres().find(
    (w) => !(w.editorialBlockReason && typeof w.editorialBlockReason === 'object')
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAuthUser.mockResolvedValue(AUTH)
  // Default: nada em quarentena, acervo vazio. Cada teste sobrescreve o total.
  countNews.mockResolvedValue(0)
})

// ---------------------------------------------------------------------------
// T-09 — default preserva o conjunto de antes da task
// ---------------------------------------------------------------------------

describe('T-09 — requisicao sem parametro', () => {
  test('usa skip 0 e take 100, e devolve pagination na pagina 1', async () => {
    findManyNews.mockResolvedValueOnce([anchor(1)]).mockResolvedValueOnce([])
    // Quarentena 0, total 1 (o `where` distingue as duas chamadas).
    countNews.mockResolvedValueOnce(0).mockResolvedValueOnce(1)

    const res = await adminNewsGET(listReq())
    const body = await res.json()

    expect(listArg().skip).toBe(0)
    expect(listArg().take).toBe(100)
    // O T-06 (orderBy createdAt desc) e o filtro de quarentena do T-08 ficam intactos.
    expect(listArg().orderBy).toEqual({ createdAt: 'desc' })
    expect(listArg().where).toEqual({ groupRank: 0, editorialBlockReason: null })

    expect(body.data).toHaveLength(1)
    expect(body.pagination.page).toBe(1)
    expect(body.pagination.limit).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// T-09 — fatia correta em acervo maior que uma pagina
// ---------------------------------------------------------------------------

describe('T-09 — acervo de 25 grupos com limit 10', () => {
  test('page=2 pede skip 10 / take 10 e reporta 3 paginas com hasNext', async () => {
    findManyNews.mockResolvedValueOnce([anchor(11)]).mockResolvedValueOnce([])
    countNews.mockResolvedValueOnce(0).mockResolvedValueOnce(25)

    const res = await adminNewsGET(listReq({ page: '2', limit: '10' }))
    const body = await res.json()

    expect(listArg().skip).toBe(10)
    expect(listArg().take).toBe(10)
    expect(body.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
      hasNext: true,
    })
  })

  test('ultima pagina fecha hasNext', async () => {
    findManyNews.mockResolvedValueOnce([anchor(21)]).mockResolvedValueOnce([])
    countNews.mockResolvedValueOnce(0).mockResolvedValueOnce(25)

    const res = await adminNewsGET(listReq({ page: '3', limit: '10' }))
    const body = await res.json()

    expect(listArg().skip).toBe(20)
    expect(body.pagination.hasNext).toBe(false)
    expect(body.pagination.totalPages).toBe(3)
  })

  test('pagina fora do intervalo responde 200 com lista vazia, nao erro', async () => {
    // Banco real devolveria [] com skip alem do acervo; o mock reproduz isso.
    findManyNews.mockResolvedValueOnce([])
    countNews.mockResolvedValueOnce(0).mockResolvedValueOnce(25)

    const res = await adminNewsGET(listReq({ page: '99', limit: '10' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual([])
    expect(body.pagination.page).toBe(99)
    expect(body.pagination.totalPages).toBe(3)
    expect(body.pagination.hasNext).toBe(false)
    // Contrato do T-08 preservado tambem na pagina vazia.
    expect(res.headers.get('X-Quarantine-Count')).toBe('0')
  })
})

// ---------------------------------------------------------------------------
// T-09 — o total respeita a quarentena (decisao 4)
// ---------------------------------------------------------------------------

describe('T-09 — total conta o mesmo recorte da listagem', () => {
  test('sem includeQuarantine, o total exclui a quarentena', async () => {
    findManyNews.mockResolvedValueOnce([anchor(1)]).mockResolvedValueOnce([])
    countNews.mockResolvedValueOnce(4).mockResolvedValueOnce(7)

    const res = await adminNewsGET(listReq())
    const body = await res.json()

    expect(countNews).toHaveBeenCalledTimes(2)
    expect(totalCountWhere()).toEqual({ groupRank: 0, editorialBlockReason: null })
    // O total e o where do findMany sao o MESMO recorte: senao a ultima pagina
    // prometida por totalPages nao existiria.
    expect(totalCountWhere()).toEqual(listArg().where)
    expect(body.pagination.total).toBe(7)
    expect(res.headers.get('X-Quarantine-Count')).toBe('4')
  })

  test('com includeQuarantine=1, o total passa a ser o acervo inteiro', async () => {
    findManyNews.mockResolvedValueOnce([anchor(1)]).mockResolvedValueOnce([])
    countNews.mockResolvedValueOnce(4).mockResolvedValueOnce(11)

    const res = await adminNewsGET(listReq({ includeQuarantine: '1' }))
    const body = await res.json()

    expect(totalCountWhere()).toEqual({ groupRank: 0 })
    expect(totalCountWhere()).toEqual(listArg().where)
    expect(body.pagination.total).toBe(11)
    expect(res.headers.get('X-Quarantine-Count')).toBe('4')
  })
})

// ---------------------------------------------------------------------------
// T-09 — paginar continua sendo leitura pura
// ---------------------------------------------------------------------------

describe('T-09 — o GET paginado nao escreve nada', () => {
  test('nenhum metodo de escrita do prisma e chamado', async () => {
    findManyNews.mockResolvedValueOnce([anchor(1)]).mockResolvedValueOnce([])
    countNews.mockResolvedValueOnce(0).mockResolvedValueOnce(1)

    await adminNewsGET(listReq({ page: '2', limit: '10' }))

    // Os metodos de escrita existem no mock: se a rota chamasse qualquer um, os
    // expects abaixo falhariam em vez de estourar TypeError por metodo ausente.
    expect(updateNews).not.toHaveBeenCalled()
    expect(updateManyNews).not.toHaveBeenCalled()
    expect(deleteNews).not.toHaveBeenCalled()
    expect(deleteManyNews).not.toHaveBeenCalled()
    expect(createNews).not.toHaveBeenCalled()
  })
})
