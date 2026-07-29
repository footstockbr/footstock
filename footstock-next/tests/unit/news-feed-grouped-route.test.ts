/**
 * Testes unitarios — M067 / item 015: GET /api/v1/news com consulta agrupada.
 *
 * Cobre os criterios 7, 8, 9, 10, 11, 12 e 43 do loop
 * 07-28-noticias-multi-time-linha-por-time, mais retrocompatibilidade com o
 * acervo unitario (backfill do item 008) e o teto de hidratacao de 50 ids.
 *
 * Nota de localizacao: o runbook do item pedia
 * `src/app/api/v1/news/__tests__/route.test.ts`, mas o `testMatch` do
 * jest.config.ts cobre APENAS `tests/**`. Uma suite em `src/**` nunca roda
 * (`npx jest src/app/api/v1/news` responde "No tests found"), entao a suite
 * vive aqui, onde executa de verdade.
 *
 * `@/lib/prisma` e mockado por completo: o arquivo real importa 'server-only' e
 * abre conexao no import. Aqui isolamos o handler e verificamos exatamente o
 * que ele manda ao banco.
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
  publishedAt: Date | null
  createdAt: Date
  groupId: string | null
  groupRank: number | null
  ticker: string | null
}

const TIE = new Date('2026-07-28T12:00:00.000Z')

function row(over: Partial<Row> & { id: string }): Row {
  return {
    title: `Noticia ${over.id}`,
    content: 'corpo',
    source: 'ge.globo',
    assetIds: ['asset-default'],
    sentiment: 'NEUTRAL',
    impact: 'INSTITUCIONAL',
    isPublished: true,
    publishedAt: TIE,
    createdAt: TIE,
    groupId: over.groupId ?? over.id,
    groupRank: 0,
    ticker: null,
    ...over,
  }
}

/** Anchors (1a query, com `select`) e hidratacao (2a query) no mesmo mock. */
function wireFindMany(anchors: { id: string; groupId: string | null }[], siblings: Row[]) {
  findManyNews.mockImplementation((args: { select?: unknown }) =>
    Promise.resolve(args?.select ? anchors : siblings)
  )
}

function request(qs = '') {
  return new NextRequest(`http://localhost:3000/api/v1/news${qs}`)
}

async function body(res: Response) {
  return (await res.json()) as {
    data?: Array<Record<string, unknown>>
    pagination?: { total: number; page: number; limit: number }
    error?: { code: string; message: string }
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAuthUser.mockResolvedValue(AUTH)
})

describe('[CRITERIO 7] sem filtro, o feed devolve cards (grupos), nao linhas', () => {
  it('ancora o where em groupRank 0 e respeita o take', async () => {
    // 25 grupos visiveis, 5 deles multi-time; a pagina pede 20.
    const anchors = Array.from({ length: 20 }, (_, i) => ({
      id: `n${i}`,
      groupId: `g${i}`,
    }))
    const siblings: Row[] = []
    anchors.forEach((a, i) => {
      siblings.push(row({ id: a.id, groupId: a.groupId, groupRank: 0, ticker: `T${i}` }))
      if (i < 5) {
        siblings.push(
          row({ id: `${a.id}-b`, groupId: a.groupId, groupRank: 1, ticker: `S${i}` })
        )
      }
    })
    wireFindMany(anchors, siblings)
    countNews.mockResolvedValue(25)

    const res = await GET(request())
    const json = await body(res)

    expect(res.status).toBe(200)
    // 25 linhas ancora + 5 irmas = 30 linhas, mas 20 cards na pagina.
    expect(json.data).toHaveLength(20)
    expect(findManyNews.mock.calls[0][0].where).toEqual({ isPublished: true, groupRank: 0 })
    expect(findManyNews.mock.calls[0][0].take).toBe(20)
    // Multi-time nao vira dois cards: o irmao viaja em teams[].
    expect(json.data![0].teams).toHaveLength(2)
    expect(queryRaw).not.toHaveBeenCalled()
  })
})

describe('[CRITERIO 8] pagination.total conta grupos visiveis', () => {
  it('total vem do count do MESMO where ancorado (sem is_archived)', async () => {
    wireFindMany(
      [{ id: 'n1', groupId: 'g1' }],
      [row({ id: 'n1', groupId: 'g1', groupRank: 0 })]
    )
    countNews.mockResolvedValue(7)

    const json = await body(await GET(request('?page=1')))

    expect(json.pagination!.total).toBe(7)
    expect(countNews).toHaveBeenCalledWith({ where: { isPublished: true, groupRank: 0 } })
    // F21: a rota nao filtra is_archived; o teste espelha a query que existe.
    expect(countNews.mock.calls[0][0].where).not.toHaveProperty('isArchived')
  })
})

describe('[CRITERIO 9] ordenacao estavel sob empate de published_at', () => {
  it('orderBy e exatamente [{ publishedAt: desc }, { groupId: asc }]', async () => {
    wireFindMany(
      [{ id: 'n1', groupId: 'g1' }],
      [row({ id: 'n1', groupId: 'g1', groupRank: 0 })]
    )
    countNews.mockResolvedValue(1)

    await GET(request())

    expect(findManyNews.mock.calls[0][0].orderBy).toEqual([
      { publishedAt: 'desc' },
      { groupId: 'asc' },
    ])
  })
})

describe('[CRITERIO 10] nenhum grupo aparece em duas paginas', () => {
  it('particiona grupos empatados sem repetir nem pular', async () => {
    const all = [
      { id: 'n1', groupId: 'g1' },
      { id: 'n2', groupId: 'g2' },
      { id: 'n3', groupId: 'g3' },
    ]
    const siblings = [
      row({ id: 'n1', groupId: 'g1', groupRank: 0 }),
      row({ id: 'n1b', groupId: 'g1', groupRank: 1 }),
      row({ id: 'n2', groupId: 'g2', groupRank: 0 }),
      row({ id: 'n3', groupId: 'g3', groupRank: 0 }),
    ]

    // Pagina 1 (limit=2): grupos g1 e g2.
    wireFindMany(all.slice(0, 2), siblings)
    countNews.mockResolvedValue(3)
    const p1 = await body(await GET(request('?page=1&limit=2')))
    expect(findManyNews.mock.calls[0][0].skip).toBe(0)

    jest.clearAllMocks()

    // Pagina 2 (mesmo empate de published_at): grupo g3.
    wireFindMany(all.slice(2), siblings)
    countNews.mockResolvedValue(3)
    const p2 = await body(await GET(request('?page=2&limit=2')))
    expect(findManyNews.mock.calls[0][0].skip).toBe(2)

    const g1 = p1.data!.map((d) => d.groupId)
    const g2 = p2.data!.map((d) => d.groupId)
    expect(g1).toEqual(['g1', 'g2'])
    expect(g2).toEqual(['g3'])
    expect(g1.filter((g) => g2.includes(g))).toHaveLength(0)
    // g1 tem duas linhas e mesmo assim ocupa UM card, na pagina 1 apenas.
    expect(p1.data![0].teams).toHaveLength(2)
  })
})

describe('[CRITERIO 11] ?ticker=URU3 devolve a linha do URU3 com os irmaos', () => {
  it('topo vem da linha que casou o filtro, teams traz o grupo visivel', async () => {
    findUniqueAsset.mockResolvedValue({ id: 'asset-uru' })
    queryRaw
      .mockResolvedValueOnce([{ group_id: 'g1' }])
      .mockResolvedValueOnce([{ count: 1 }])
    const siblings = [
      row({
        id: 'anchor',
        groupId: 'g1',
        groupRank: 0,
        ticker: 'SEP3',
        assetIds: ['asset-sep'],
        sentiment: 'BULLISH',
      }),
      row({
        id: 'uru',
        groupId: 'g1',
        groupRank: 1,
        ticker: 'URU3',
        assetIds: ['asset-uru'],
        sentiment: 'BEARISH',
      }),
      row({
        id: 'ter',
        groupId: 'g1',
        groupRank: 2,
        ticker: 'TER3',
        assetIds: ['asset-ter'],
        sentiment: 'NEUTRAL',
      }),
    ]
    findManyNews.mockResolvedValue(siblings)

    const json = await body(await GET(request('?ticker=URU3')))

    expect(findUniqueAsset).toHaveBeenCalledWith({
      where: { ticker: 'URU3' },
      select: { id: true },
    })
    expect(json.data).toHaveLength(1)
    expect(json.data![0].ticker).toBe('URU3')
    expect(json.data![0].sentiment).toBe('BEARISH')
    expect(json.data![0].groupId).toBe('g1')
    expect(json.data![0].groupRank).toBe(1)
    // 3 badges: as tres linhas visiveis do grupo, ordenadas por groupRank.
    const teams = json.data![0].teams as Array<{ ticker: string; groupRank: number }>
    expect(teams.map((t) => t.ticker)).toEqual(['SEP3', 'URU3', 'TER3'])
    expect(teams.map((t) => t.groupRank)).toEqual([0, 1, 2])
    // Branch filtrado nao usa a ancora no where: a selecao e por grupo (raw).
    expect(queryRaw).toHaveBeenCalledTimes(2)
    expect(findManyNews).toHaveBeenCalledTimes(1)
    expect(findManyNews.mock.calls[0][0].where.isPublished).toBe(true)
    expect(countNews).not.toHaveBeenCalled()
  })
})

describe('[CRITERIO 12] filtro por impact que casa so no irmao nao perde o grupo', () => {
  it('devolve o grupo com a ancora INSTITUCIONAL em teams[]', async () => {
    queryRaw
      .mockResolvedValueOnce([{ group_id: 'g9' }])
      .mockResolvedValueOnce([{ count: 1 }])
    findManyNews.mockResolvedValue([
      row({ id: 'anchor', groupId: 'g9', groupRank: 0, ticker: 'SEP3', impact: 'INSTITUCIONAL' }),
      row({
        id: 'irmao',
        groupId: 'g9',
        groupRank: 1,
        ticker: 'URU3',
        impact: 'ESPORTIVA_MAJORITARIA',
      }),
    ])

    const json = await body(await GET(request('?impact=ESPORTIVA_MAJORITARIA')))

    expect(json.data).toHaveLength(1)
    expect(json.data![0].impact).toBe('ESPORTIVA_MAJORITARIA')
    expect(json.data![0].ticker).toBe('URU3')
    const teams = json.data![0].teams as Array<{ impact: string }>
    expect(teams.map((t) => t.impact)).toEqual(['INSTITUCIONAL', 'ESPORTIVA_MAJORITARIA'])
    // total do branch filtrado vem do COUNT(DISTINCT group_id), nao de count de linhas.
    expect(json.pagination!.total).toBe(1)
  })

  it('impact invalido continua 422 antes de qualquer query', async () => {
    const res = await GET(request('?impact=NAO_EXISTE'))
    expect(res.status).toBe(422)
    expect(queryRaw).not.toHaveBeenCalled()
    expect(findManyNews).not.toHaveBeenCalled()
  })
})

describe('[CRITERIO 43] ticker desconhecido nao devolve o feed inteiro', () => {
  it('responde 4xx com motivo explicito e nao consulta noticias', async () => {
    findUniqueAsset.mockResolvedValue(null)

    const res = await GET(request('?ticker=ZZZ9'))
    const json = await body(res)

    expect(res.status).toBe(422)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(json.error!.message).toBe('Ticker desconhecido: ZZZ9.')
    expect(json.data).toBeUndefined()
    expect(findManyNews).not.toHaveBeenCalled()
    expect(queryRaw).not.toHaveBeenCalled()
    expect(countNews).not.toHaveBeenCalled()
  })
})

describe('[RETROCOMPAT] grupo unitario do backfill do item 008', () => {
  it('devolve teams com 1 elemento e preserva os campos que o front le', async () => {
    wireFindMany(
      [{ id: 'solo', groupId: 'solo' }],
      [
        row({
          id: 'solo',
          groupId: 'solo',
          groupRank: 0,
          ticker: 'SEP3',
          assetIds: ['asset-sep'],
          sentiment: 'BULLISH',
        }),
      ]
    )
    countNews.mockResolvedValue(1)

    const json = await body(await GET(request()))
    const item = json.data![0]

    expect(item.teams).toHaveLength(1)
    // Contrato consumido hoje por noticias-content.tsx.
    expect(item.id).toBe('solo')
    expect(item.title).toBe('Noticia solo')
    expect(item.content).toBe('corpo')
    expect(item.assetIds).toEqual(['asset-sep'])
    expect(item.sentiment).toBe('BULLISH')
    expect(item.source).toBe('ge.globo')
    expect(item.publishedAt).toBe(TIE.toISOString())
    // Campos novos do grupo.
    expect(item.groupId).toBe('solo')
    expect(item.groupRank).toBe(0)
  })

  it('linha com group_id NULL (janela D1) ainda e hidratada pelo proprio id', async () => {
    wireFindMany(
      [{ id: 'legado', groupId: null }],
      [row({ id: 'legado', groupId: null, groupRank: null })]
    )
    countNews.mockResolvedValue(1)

    const json = await body(await GET(request()))

    expect(json.data).toHaveLength(1)
    expect(json.data![0].groupId).toBe('legado')
    expect(json.data![0].groupRank).toBe(0)
    const orTerms = findManyNews.mock.calls[1][0].where.OR
    expect(orTerms[0]).toEqual({ groupId: { in: ['legado'] } })
    expect(orTerms[1]).toEqual({ AND: [{ groupId: null }, { id: { in: ['legado'] } }] })
  })
})

describe('[LIMITE] hidratacao com no maximo 50 ids', () => {
  it('take maximo e 50 e o IN da hidratacao nao passa de 50 ids', async () => {
    const anchors = Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, groupId: `g${i}` }))
    const siblings = anchors.map((a) => row({ id: a.id, groupId: a.groupId, groupRank: 0 }))
    wireFindMany(anchors, siblings)
    countNews.mockResolvedValue(60)

    await GET(request('?limit=100'))

    expect(findManyNews.mock.calls[0][0].take).toBe(50)
    const hydrateIn = findManyNews.mock.calls[1][0].where.OR[0].groupId.in as string[]
    expect(hydrateIn).toHaveLength(50)
  })

  it('pagina vazia nao emite a query de hidratacao', async () => {
    wireFindMany([], [])
    countNews.mockResolvedValue(0)

    const json = await body(await GET(request('?page=99')))

    expect(json.data).toEqual([])
    expect(findManyNews).toHaveBeenCalledTimes(1)
  })
})

describe('[AUTH] rota segue protegida', () => {
  it('401 sem sessao, sem tocar o banco', async () => {
    mockGetAuthUser.mockResolvedValue(null)

    const res = await GET(request())

    expect(res.status).toBe(401)
    expect(findManyNews).not.toHaveBeenCalled()
  })
})
