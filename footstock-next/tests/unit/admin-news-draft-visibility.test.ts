/**
 * Testes de integracao — item 007 / T-06 do loop
 * 08-18-foot-stock-motor-noticias-analise:
 * tornar visivel o rascunho criado no admin.
 *
 * O GET admin ordenava por `publishedAt desc nulls last`, entao rascunhos
 * (publishedAt null) nasciam fora da janela de 100 grupos quando o acervo
 * tinha mais de 100 grupos publicados. O fix ordena por `createdAt desc`.
 *
 * A suite mocka `@/lib/prisma` e `@/lib/auth` para nao precisar de banco real.
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
// T-08: o GET conta as ancoras em quarentena na mesma requisicao da listagem.
const countNews = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    news: {
      findMany: (...a: unknown[]) => findManyNews(...a),
      count: (...a: unknown[]) => countNews(...a),
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

function adminListReq(params: Record<string, string> = {}): NextRequest {
  // Sem params o objeto e nu de proposito (a rota tem de sobreviver a request
  // sem `nextUrl`); com params entra o mesmo shape que o runtime entrega.
  if (Object.keys(params).length === 0) return {} as unknown as NextRequest
  return { nextUrl: { searchParams: new URLSearchParams(params) } } as unknown as NextRequest
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAuthUser.mockResolvedValue(AUTH)
  countNews.mockResolvedValue(0)
})

// --- simulador de findMany -------------------------------------------------
//
// Sem ele esta suite seria tautologica: o mock devolvia o array JA na ordem
// desejada, entao `data[0] === rascunho` passaria mesmo se a rota voltasse a
// ordenar por `publishedAt desc nulls last` — exatamente o bug que originou o
// T-06. Aqui o dataset entra DESORDENADO e a ordem do resultado e produzida
// pelo `orderBy` que a rota realmente enviou, com `skip`/`take` aplicados
// depois. O teste passa a falhar se o fix for revertido.

type Row = Record<string, unknown>

type OrderTerm = Record<string, 'asc' | 'desc' | { sort: 'asc' | 'desc'; nulls?: 'first' | 'last' }>

type FindManyArgs = {
  where?: Row
  orderBy?: OrderTerm[]
  skip?: number
  take?: number
}

function matchesWhere(row: Row, where: Row | undefined): boolean {
  if (!where) return true
  return Object.entries(where).every(([field, expected]) => {
    const actual = row[field] ?? null
    if (expected !== null && typeof expected === 'object' && 'not' in expected) {
      return actual !== (expected as { not: unknown }).not
    }
    return actual === (expected ?? null)
  })
}

// Semantica de nulos do Postgres — o provider real desta aplicacao
// (`datasource db { provider = "postgresql" }`), nao uma escolha arbitraria do
// simulador: DESC ordena NULLS FIRST e ASC NULLS LAST por default; `nulls`
// explicito no orderBy do Prisma sobrescreve. Reproduzir isso
// e o que torna o teste capaz de detectar a volta do `publishedAt desc nulls
// last` (o rascunho tem publishedAt null e afundaria para fora da janela).
function compareBy(a: Row, b: Row, term: OrderTerm): number {
  const [field, spec] = Object.entries(term)[0]
  const direction = typeof spec === 'string' ? spec : spec.sort
  const nulls =
    typeof spec === 'string'
      ? direction === 'desc'
        ? 'first'
        : 'last'
      : (spec.nulls ?? (direction === 'desc' ? 'first' : 'last'))

  const av = a[field] ?? null
  const bv = b[field] ?? null

  if (av === null && bv === null) return 0
  if (av === null) return nulls === 'first' ? -1 : 1
  if (bv === null) return nulls === 'first' ? 1 : -1

  const an = av instanceof Date ? av.getTime() : av
  const bn = bv instanceof Date ? bv.getTime() : bv
  const cmp = an < bn ? -1 : an > bn ? 1 : 0
  return direction === 'desc' ? -cmp : cmp
}

function simulateFindMany(rows: Row[], args: FindManyArgs): Row[] {
  const filtered = rows.filter((row) => matchesWhere(row, args.where))
  const ordered = [...filtered].sort((a, b) => {
    for (const term of args.orderBy ?? []) {
      const cmp = compareBy(a, b, term)
      if (cmp !== 0) return cmp
    }
    return 0
  })
  const from = args.skip ?? 0
  const to = typeof args.take === 'number' ? from + args.take : undefined
  return ordered.slice(from, to)
}

// `orderBy` que a rota usava ANTES do fix do T-06, mantido aqui como oraculo
// negativo: o teste de contra-prova roda o simulador com ele para mostrar que a
// assercao principal e discriminante, e nao um acerto por construcao do mock.
const ORDER_BY_ANTES_DO_FIX: OrderTerm[] = [
  { publishedAt: { sort: 'desc', nulls: 'last' } },
  { id: 'asc' },
]

let anchorDataset: Row[] = []

// ---------------------------------------------------------------------------
// T-06 — rascunho visivel no topo do admin
// ---------------------------------------------------------------------------

describe('T-06 — rascunho recem-criado aparece no topo do admin', () => {
  const now = new Date('2026-08-19T12:00:00.000Z')
  const yesterday = new Date('2026-08-18T10:00:00.000Z')

  function buildDataset(): Row[] {
    // 101 grupos publicados, com createdAt escalonado para que a ordenacao seja
    // total e verificavel.
    const publicadas: Row[] = Array.from({ length: 101 }, (_, i) => ({
      id: `pub-${String(i).padStart(3, '0')}`,
      groupId: `g-pub-${i}`,
      groupRank: 0,
      isPublished: true,
      editorialBlockReason: null,
      publishedAt: new Date(yesterday.getTime() - i * 60_000),
      createdAt: new Date(yesterday.getTime() - i * 60_000),
      ticker: 'FLA',
      title: `Publicada ${i}`,
    }))

    const rascunho: Row = {
      id: 'draft-1',
      groupId: 'g-draft-1',
      groupRank: 0,
      isPublished: false,
      editorialBlockReason: null,
      publishedAt: null,
      createdAt: now,
      ticker: 'PAL',
      title: 'Rascunho recente',
    }

    // O rascunho entra NO MEIO do array, nao no topo: a posicao final tem de vir
    // do orderBy da rota, nunca da ordem de insercao do fixture.
    return [...publicadas.slice(0, 60), rascunho, ...publicadas.slice(60)]
  }

  beforeEach(() => {
    anchorDataset = buildDataset()
    let call = 0
    findManyNews.mockImplementation((args: FindManyArgs) => {
      call += 1
      // 1a chamada: ancoras (ordenadas/paginadas de verdade).
      // 2a chamada: hidratacao de irmaos, irrelevante para estas assercoes.
      if (call === 1) return Promise.resolve(simulateFindMany(anchorDataset, args))
      return Promise.resolve([])
    })
    // 1a contagem: quarentena (zero). 2a: total do acervo navegavel.
    countNews.mockResolvedValueOnce(0).mockResolvedValueOnce(anchorDataset.length)
  })

  test('com mais de 100 grupos publicados, rascunho e o primeiro item da pagina', async () => {
    const res = await adminNewsGET(adminListReq())
    const body = await res.json()

    // A rota faz duas chamadas: ancoras + irmaos.
    expect(findManyNews).toHaveBeenCalledTimes(2)

    const listArg = findManyNews.mock.calls[0][0] as FindManyArgs

    // O fix: ordenacao do admin por createdAt desc. O `where` ganhou
    // `editorialBlockReason: null` no T-08 (quarentena oculta por default);
    // T-06 continua sendo o primeiro termo do `orderBy`. O T-09 acrescentou
    // `id: 'asc'` ATRAS dele como desempate — nao muda o topo da lista, so
    // torna a ordem total.
    expect(listArg.where).toEqual({ groupRank: 0, editorialBlockReason: null })
    expect(listArg.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }])
    expect(listArg.take).toBe(100)

    // O contador da quarentena viaja na mesma resposta (T-08) e o dataset nao
    // tem linha barrada: `0` explicito, nunca header ausente.
    expect(res.headers.get('X-Quarantine-Count')).toBe('0')

    // O simulador aplica o `take`: a pagina tem 100 dos 102 registros.
    expect(body.data).toHaveLength(100)
    expect(body.data[0].id).toBe('draft-1')
    expect(body.data[0].isPublished).toBe(false)

    // Todas as demais da pagina sao publicadas.
    expect(body.data.slice(1).every((n: { isPublished: boolean }) => n.isPublished)).toBe(true)
  })

  test('contra-prova: com o orderBy anterior ao fix o rascunho cai fora da pagina', () => {
    // Mesmo dataset, mesmo simulador, so muda o orderBy. Se este teste falhasse
    // (rascunho ainda visivel), a assercao do teste acima nao provaria nada.
    const antes = simulateFindMany(anchorDataset, {
      where: { groupRank: 0, editorialBlockReason: null },
      orderBy: ORDER_BY_ANTES_DO_FIX,
      skip: 0,
      take: 100,
    })

    expect(antes).toHaveLength(100)
    expect(antes.some((row) => row.id === 'draft-1')).toBe(false)

    const depois = simulateFindMany(anchorDataset, {
      where: { groupRank: 0, editorialBlockReason: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: 0,
      take: 100,
    })

    expect(depois[0].id).toBe('draft-1')
  })

  test('rascunho sem publicacao nao some mesmo com acervo grande', async () => {
    const res = await adminNewsGET(adminListReq())
    const body = await res.json()

    // Presente na pagina e no topo, com o dataset entregue desordenado.
    expect(body.data.some((n: { id: string }) => n.id === 'draft-1')).toBe(true)
    expect(body.data[0].id).toBe('draft-1')
    expect(body.data[0].isPublished).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// T-06 criterio 3 — o contador de rascunhos fala do acervo, nao da pagina
// ---------------------------------------------------------------------------

describe('T-06 criterio 3 — contador de rascunhos reflete o acervo', () => {
  const yesterday = new Date('2026-08-18T10:00:00.000Z')

  // Pagina 2 de um acervo de 102 grupos (101 publicadas + 1 rascunho), com o
  // rascunho no topo da pagina 1. A pagina pedida aqui nao tem rascunho nenhum:
  // se o contador fosse derivado dela, mostraria zero — que e literalmente o
  // sintoma reportado no M12 ("o contador de rascunhos fica em zero"). Por isso
  // as contagens sao do servidor e viajam em header.
  beforeEach(() => {
    const paginaDois: Row[] = [
      {
        id: 'pub-100',
        groupId: 'g-pub-100',
        groupRank: 0,
        isPublished: true,
        isArchived: false,
        editorialBlockReason: null,
        publishedAt: yesterday,
        createdAt: yesterday,
        ticker: 'FLA',
        title: 'Publicada 100',
      },
      {
        id: 'pub-101',
        groupId: 'g-pub-101',
        groupRank: 0,
        isPublished: true,
        isArchived: false,
        editorialBlockReason: null,
        publishedAt: yesterday,
        createdAt: yesterday,
        ticker: 'FLA',
        title: 'Publicada 101',
      },
    ]
    findManyNews.mockResolvedValueOnce(paginaDois).mockResolvedValueOnce([])
    // Ordem do `Promise.all` da rota: quarentena, total, publicadas, rascunhos,
    // arquivadas.
    countNews
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(102)
      .mockResolvedValueOnce(101)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
  })

  test('numa pagina sem rascunho, o header ainda reporta o rascunho do acervo', async () => {
    const res = await adminNewsGET(adminListReq({ page: '2' }))
    const body = await res.json()

    // Contra-prova: a pagina realmente nao tem rascunho. Derivar o contador dela
    // (o que a tela fazia antes) daria 0.
    const rascunhosNaPagina = body.data.filter(
      (n: { isPublished: boolean; isArchived: boolean }) => !n.isPublished && !n.isArchived
    ).length
    expect(body.data).toHaveLength(2)
    expect(rascunhosNaPagina).toBe(0)

    // A ordem do `Promise.all` da rota fica travada aqui tambem: sem isto o
    // mapeamento valor->header vem da sequencia de `mockResolvedValueOnce` e uma
    // reordem futura silenciosa trocaria os numeros de lugar sem quebrar nada.
    const statusWheres = countNews.mock.calls
      .slice(2)
      .map((c) => (c[0] as { where: Record<string, unknown> }).where)
    expect(statusWheres).toEqual([
      { groupRank: 0, editorialBlockReason: null, isPublished: true, isArchived: false },
      { groupRank: 0, editorialBlockReason: null, isPublished: false, isArchived: false },
      { groupRank: 0, editorialBlockReason: null, isArchived: true },
    ])

    // O que o servidor manda e do acervo inteiro.
    expect(res.headers.get('X-Draft-Count')).toBe('1')
    expect(res.headers.get('X-Published-Count')).toBe('101')
    expect(res.headers.get('X-Archived-Count')).toBe('0')
    expect(res.headers.get('X-Quarantine-Count')).toBe('0')

    // Os tres somam o `total` do bloco de paginacao: nenhum grupo fica fora de
    // categoria, entao a linha do header nao esconde uma quarta fatia.
    const soma =
      Number(res.headers.get('X-Published-Count')) +
      Number(res.headers.get('X-Draft-Count')) +
      Number(res.headers.get('X-Archived-Count'))
    expect(soma).toBe(body.pagination.total)
  })
})
