/**
 * Testes de integracao — T-05: impedir que o feed publico sirva noticia arquivada.
 *
 * Cobre as quatro combinacoes de isPublished x isArchived no GET /api/v1/news,
 * verificando os tres caminhos de consulta: ancora sem filtro, SQL raw com
 * filtro e hidratacao de irmaos.
 *
 * `@/lib/prisma` e mockado por completo para isolar o handler.
 */

import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn(),
}))

const findUniqueAsset = jest.fn()
const findManyNews = jest.fn()
const countNews = jest.fn()
const queryRaw = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: { findUnique: (...a: unknown[]) => findUniqueAsset(...a) },
    news: {
      findMany: (...a: unknown[]) => findManyNews(...a),
      count: (...a: unknown[]) => countNews(...a),
    },
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
  },
}))

import { getAuthUser } from '@/lib/auth'
import { GET } from '@/app/api/v1/news/route'

const mockGetAuthUser = getAuthUser as jest.Mock

const AUTH = { user: { id: 'u1', name: 'Tester', email: 't@t.com', planType: 'JOGADOR' } }

type Row = {
  id: string
  title: string
  content: string | null
  source: string | null
  assetIds: string[]
  sentiment: string
  impact: string
  isPublished: boolean
  isArchived: boolean
  publishedAt: Date | null
  createdAt: Date
  groupId: string | null
  groupRank: number | null
  ticker: string | null
}

function row(over: Partial<Row> & { id: string }): Row {
  return {
    title: `Noticia ${over.id}`,
    content: 'corpo',
    source: 'ge.globo',
    assetIds: ['asset-default'],
    sentiment: 'NEUTRAL',
    impact: 'INSTITUCIONAL',
    isPublished: true,
    isArchived: false,
    publishedAt: new Date('2026-08-18T12:00:00.000Z'),
    createdAt: new Date('2026-08-18T12:00:00.000Z'),
    groupId: over.groupId ?? over.id,
    groupRank: 0,
    ticker: null,
    ...over,
  }
}

function request(qs = '') {
  return new NextRequest(`http://localhost:3000/api/v1/news${qs}`)
}

/**
 * Avalia o `where` REALMENTE enviado ao banco contra o estado da linha da
 * fixture. Sem isto os casos 3 e 4 seriam tautologicos: o mock devolve `[]`
 * para o caminho ancora, entao `data.length === 0` passaria mesmo se o handler
 * nao filtrasse nada. Aqui a exclusao e provada pelo predicado, nao pelo mock.
 */
function rowPassesWhere(
  state: { isPublished: boolean; isArchived: boolean },
  where: { isPublished?: boolean; isArchived?: boolean }
): boolean {
  if (where.isPublished !== undefined && where.isPublished !== state.isPublished) return false
  if (where.isArchived !== undefined && where.isArchived !== state.isArchived) return false
  return true
}

async function body(res: Response) {
  return (await res.json()) as {
    data?: Array<Record<string, unknown>>
    pagination?: { total: number; page: number; limit: number }
    error?: { code: string; message: string }
  }
}

function reconstructRawSql(call: unknown[]): string {
  const strings = call[0] as string[]
  let out = strings[0]
  for (let i = 1; i < call.length; i++) {
    const val = call[i]
    if (val && typeof val === 'object' && 'strings' in (val as Record<string, unknown>)) {
      out += ((val as { strings: string[] }).strings).join('')
    } else {
      out += String(val)
    }
    out += strings[i]
  }
  return out
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAuthUser.mockResolvedValue(AUTH)
})

describe('T-05: feed publico exclui noticias arquivadas', () => {
  it('1. publicada e nao arquivada -> retorna no feed (caminho ancora)', async () => {
    findManyNews.mockImplementation((args: { select?: unknown }) =>
      Promise.resolve(
        args?.select
          ? [{ id: 'n1', groupId: 'g1' }]
          : [row({ id: 'n1', groupId: 'g1', isPublished: true, isArchived: false })]
      )
    )
    countNews.mockResolvedValue(1)

    const res = await GET(request())
    const json = await body(res)

    expect(res.status).toBe(200)
    expect(json.data).toHaveLength(1)
    expect(findManyNews.mock.calls[0][0].where).toEqual({
      isPublished: true,
      isArchived: false,
      groupRank: 0,
    })
  })

  it('2. publicada e arquivada -> NAO retorna no feed (caminho ancora)', async () => {
    findManyNews.mockImplementation((args: { select?: unknown }) =>
      Promise.resolve(
        args?.select
          ? []
          : [row({ id: 'n1', groupId: 'g1', isPublished: true, isArchived: true })]
      )
    )
    countNews.mockResolvedValue(0)

    const res = await GET(request())
    const json = await body(res)

    expect(res.status).toBe(200)
    expect(json.data).toHaveLength(0)
    expect(findManyNews.mock.calls[0][0].where).toEqual({
      isPublished: true,
      isArchived: false,
      groupRank: 0,
    })
  })

  it('3. nao publicada e nao arquivada -> NAO retorna no feed (caminho ancora)', async () => {
    findManyNews.mockImplementation((args: { select?: unknown }) =>
      Promise.resolve(
        args?.select
          ? []
          : [row({ id: 'n1', groupId: 'g1', isPublished: false, isArchived: false })]
      )
    )
    countNews.mockResolvedValue(0)

    const res = await GET(request())
    const json = await body(res)

    expect(res.status).toBe(200)
    expect(json.data).toHaveLength(0)
    const where3 = findManyNews.mock.calls[0][0].where
    expect(where3).toEqual({ isPublished: true, isArchived: false, groupRank: 0 })
    expect(rowPassesWhere({ isPublished: false, isArchived: false }, where3)).toBe(false)
  })

  it('4. nao publicada e arquivada -> NAO retorna no feed (caminho ancora)', async () => {
    findManyNews.mockImplementation((args: { select?: unknown }) =>
      Promise.resolve(
        args?.select
          ? []
          : [row({ id: 'n1', groupId: 'g1', isPublished: false, isArchived: true })]
      )
    )
    countNews.mockResolvedValue(0)

    const res = await GET(request())
    const json = await body(res)

    expect(res.status).toBe(200)
    expect(json.data).toHaveLength(0)
    const where4 = findManyNews.mock.calls[0][0].where
    expect(where4).toEqual({ isPublished: true, isArchived: false, groupRank: 0 })
    expect(rowPassesWhere({ isPublished: false, isArchived: true }, where4)).toBe(false)
  })

  it('filtro por assetId tambem exclui arquivadas (caminho SQL raw)', async () => {
    findUniqueAsset.mockResolvedValue({ id: 'asset-abc' })
    queryRaw
      .mockResolvedValueOnce([{ group_id: 'g1' }])
      .mockResolvedValueOnce([{ count: 1 }])
    findManyNews.mockResolvedValue([
      row({ id: 'n1', groupId: 'g1', isPublished: true, isArchived: false }),
    ])

    const res = await GET(request('?assetId=asset-abc'))
    const json = await body(res)

    expect(res.status).toBe(200)
    expect(json.data).toHaveLength(1)
    expect(queryRaw).toHaveBeenCalledTimes(2)
    const rawSql = reconstructRawSql(queryRaw.mock.calls[0])
    expect(rawSql).toContain('is_published = true')
    expect(rawSql).toContain('is_archived = false')
  })

  it('hidratacao de irmaos tambem aplica isArchived=false', async () => {
    findManyNews.mockImplementation((args: { select?: unknown }) =>
      Promise.resolve(
        args?.select
          ? [{ id: 'n1', groupId: 'g1' }]
          : [row({ id: 'n1', groupId: 'g1', isPublished: true, isArchived: false })]
      )
    )
    countNews.mockResolvedValue(1)

    await GET(request())

    const hydrateWhere = findManyNews.mock.calls[1][0].where
    expect(hydrateWhere.isPublished).toBe(true)
    expect(hydrateWhere.isArchived).toBe(false)
    expect(hydrateWhere.OR).toBeDefined()
  })
})
