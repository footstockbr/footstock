/**
 * T-09 - Conferencia REAL (banco de verdade, sem mock de Prisma).
 *
 * `tests/unit/admin-news-pagination.test.ts` mocka `@/lib/prisma` e prova a
 * CONSTRUCAO do argumento (`skip`, `take`, `orderBy`, `where`). Ele nao pode
 * provar o efeito: com mock, `orderBy` e um objeto inerte e a fatia devolvida e
 * a que o proprio teste programou. Os criterios 2 e 3 do runbook do item 010
 * falam do RESULTADO ("sem grupo repetido nem grupo pulado entre paginas
 * consecutivas", "`pagination.total` bate com o `SELECT count(*)` do banco") e
 * so um banco de verdade os decide.
 *
 * Foi esta suite que fechou o gap do listener-recovery de 2026-08-19: ate ela
 * existir, o criterio 2 era so uma alegacao de codigo e o criterio 3 nunca
 * tinha sido comparado com SQL nenhum.
 *
 * O acervo semeado inclui um bloco de ancoras com `created_at` IDENTICO. Esse e
 * o probe do criterio 2: `created_at` nao tem UNIQUE no schema e o
 * `NewsPublisher` grava o grupo dentro de uma transacao (CURRENT_TIMESTAMP e
 * constante nela), entao empate e um estado alcancavel em producao. Com
 * `ORDER BY created_at DESC` sozinho a ordem entre as empatadas e indefinida e
 * o Postgres pode devolver a mesma linha em duas paginas (ou nenhuma) sem
 * violar nada; com `id ASC` atras dele a ordem passa a ser total.
 *
 * Opt-in: so roda com T09_REAL_DB=1 e DATABASE_URL apontando para um banco
 * descartavel. Sem isso a suite e pulada, para nao quebrar `npm test` nem CI
 * em ambiente sem banco.
 *
 *   T09_REAL_DB=1 \
 *   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/footstock_t09_verify?schema=public" \
 *   npx jest tests/integration/admin-news-pagination-real-db.test.ts --no-cov
 */

import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn(),
  hasAdminRole: jest.requireActual('@/lib/utils/admin-roles').hasAdminRole,
}))

import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/v1/admin/news/route'

/**
 * Nome de banco EXIGIDO. `wipe()` roda `deleteMany` SEM filtro (o criterio 3
 * compara com um `count(*)` global, entao o acervo tem que ser exatamente o
 * semeado). Por isso o guard `T09_REAL_DB=1` sozinho seria irresponsavel:
 * bastaria um `DATABASE_URL` de dev/producao no ambiente para apagar a tabela
 * `news` inteira. Fail-closed: so roda contra banco cujo nome contenha
 * `t09verify`, que por definicao e descartavel.
 */
const REQUIRED_DB_MARKER = 't09verify'

function targetDbName(): string {
  const url = process.env.DATABASE_URL
  if (!url) return ''
  try {
    return new URL(url).pathname.slice(1)
  } catch {
    return ''
  }
}

function targetsDisposableDb(): boolean {
  return targetDbName().replace(/[^a-z0-9]/gi, '').toLowerCase().includes(REQUIRED_DB_MARKER)
}

const REAL_DB = process.env.T09_REAL_DB === '1'

if (REAL_DB && !targetsDisposableDb()) {
  throw new Error(
    `[T-09] Recusado: T09_REAL_DB=1 exige DATABASE_URL apontando para um banco ` +
      `descartavel cujo nome contenha "${REQUIRED_DB_MARKER}". Esta suite APAGA a ` +
      `tabela news inteira; rodar contra dev/producao destruiria dados. ` +
      `Banco alvo: "${targetDbName() || '(DATABASE_URL ausente ou ilegivel)'}".`
  )
}

const d = REAL_DB ? describe : describe.skip

const mockGetAuthUser = getAuthUser as jest.Mock

const EDITOR = {
  user: {
    id: 't09-editor',
    name: 'Editor',
    email: 'editor@t09.test',
    planType: 'JOGADOR',
    adminRole: 'SUPER_ADMIN',
  },
}

// Acervo: 250 ancoras visiveis (bem acima dos 100 do default, entao a navegacao
// e observavel de verdade), 17 ancoras em quarentena e 40 irmaos de grupo. Os
// irmaos existem para provar que `total` conta GRUPOS e nao LINHAS.
const VISIBLE_ANCHORS = 250
const QUARANTINED_ANCHORS = 17
const SIBLINGS = 40
const TIED_BLOCK = 30

const BASE_TS = Date.parse('2026-08-19T12:00:00.000Z')
/** Instante compartilhado pelo bloco empatado (o probe do criterio 2). */
const TIE_TS = new Date(BASE_TS + 999_000)

/**
 * `id` embaralhado em relacao a ordem de insercao. Se o desempate por `id` nao
 * existisse, a ordem das empatadas seria a que o heap devolvesse; com ids
 * sequenciais o acaso poderia mascarar isso.
 */
function anchorId(n: number): string {
  return `t09verify-a-${String((n * 7919) % 100000).padStart(6, '0')}-${String(n).padStart(4, '0')}`
}

function seedRows() {
  const base = {
    content: 'corpo da noticia de conferencia T-09',
    impact: 'INSTITUCIONAL' as const,
    sentiment: 'NEUTRAL' as const,
    source: 'conferencia-t09',
    isPublished: true,
    isArchived: false,
  }

  const rows: Array<Record<string, unknown>> = []

  for (let n = 0; n < VISIBLE_ANCHORS; n++) {
    const id = anchorId(n)
    rows.push({
      ...base,
      id,
      title: `T09 ancora ${n}`,
      ticker: `T9${n % 90}`,
      assetIds: [],
      groupId: `t09verify-g-${String(n).padStart(4, '0')}`,
      groupRank: 0,
      editorialBlockReason: null,
      publishedAt: new Date(BASE_TS + n * 1000),
      // As `TIED_BLOCK` primeiras compartilham o MESMO created_at.
      createdAt: n < TIED_BLOCK ? TIE_TS : new Date(BASE_TS + n * 1000),
    })
  }

  for (let n = 0; n < QUARANTINED_ANCHORS; n++) {
    rows.push({
      ...base,
      id: `t09verify-q-${String(n).padStart(4, '0')}`,
      title: `T09 quarentena ${n}`,
      ticker: `T9Q${n}`,
      assetIds: [],
      isPublished: false,
      groupId: `t09verify-qg-${String(n).padStart(4, '0')}`,
      groupRank: 0,
      editorialBlockReason: 'backfill_no_local_team',
      publishedAt: null,
      createdAt: new Date(BASE_TS + 500_000 + n * 1000),
    })
  }

  // Irmaos (group_rank 1) de grupos visiveis: nunca sao ancora, nunca entram no
  // total, nunca viram card proprio.
  for (let n = 0; n < SIBLINGS; n++) {
    rows.push({
      ...base,
      id: `t09verify-s-${String(n).padStart(4, '0')}`,
      title: `T09 irmao ${n}`,
      ticker: `T9S${n}`,
      assetIds: [],
      groupId: `t09verify-g-${String(n).padStart(4, '0')}`,
      groupRank: 1,
      editorialBlockReason: null,
      publishedAt: new Date(BASE_TS + n * 1000),
      createdAt: n < TIED_BLOCK ? TIE_TS : new Date(BASE_TS + n * 1000),
    })
  }

  return rows
}

const EXPECTED_VISIBLE_IDS = new Set(
  Array.from({ length: VISIBLE_ANCHORS }, (_, n) => anchorId(n))
)
const TIED_IDS = new Set(Array.from({ length: TIED_BLOCK }, (_, n) => anchorId(n)))

type Page = {
  status: number
  ids: string[]
  total: number
  totalPages: number
  quarantineHeader: string | null
}

async function listPage(params: Record<string, string>): Promise<Page> {
  const qs = new URLSearchParams(params).toString()
  const res = await GET(
    new NextRequest(`http://localhost:3000/api/v1/admin/news${qs ? `?${qs}` : ''}`)
  )
  const json = (await res.json()) as {
    data?: Array<{ id: string }>
    pagination?: { total: number; totalPages: number }
  }
  return {
    status: res.status,
    ids: (json.data ?? []).map((r) => r.id),
    total: json.pagination?.total ?? -1,
    totalPages: json.pagination?.totalPages ?? -1,
    quarantineHeader: res.headers.get('X-Quarantine-Count'),
  }
}

/** Percorre TODAS as paginas e devolve a sequencia concatenada, na ordem. */
async function walkAllPages(limit: number, extra: Record<string, string> = {}) {
  const first = await listPage({ page: '1', limit: String(limit), ...extra })
  const sequence = [...first.ids]
  const perPage = [first.ids.length]
  for (let page = 2; page <= first.totalPages; page++) {
    const p = await listPage({ page: String(page), limit: String(limit), ...extra })
    expect(p.status).toBe(200)
    expect(p.total).toBe(first.total)
    sequence.push(...p.ids)
    perPage.push(p.ids.length)
  }
  return { sequence, perPage, total: first.total, totalPages: first.totalPages }
}

/** Contagem via SQL cru — o lado direito da comparacao do criterio 3. */
async function rawAnchorCount(includeQuarantine: boolean): Promise<number> {
  const rows = includeQuarantine
    ? await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count FROM news WHERE group_rank = 0`
    : await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*)::bigint AS count FROM news
        WHERE group_rank = 0 AND editorial_block_reason IS NULL`
  return Number(rows[0].count)
}

/** Log de evidencia (opt-in): captura o payload real para registro documental. */
function evidence(label: string, payload: unknown) {
  if (process.env.T09_EVIDENCE === '1') {
    console.log(`[EVIDENCIA T-09] ${label}: ${JSON.stringify(payload)}`)
  }
}

async function wipe() {
  // Sem filtro de proposito: o criterio 3 compara com um count(*) GLOBAL.
  // Protegido pelo guard fail-closed de nome de banco no topo do arquivo.
  await prisma.news.deleteMany({})
}

d('T-09 conferencia real: paginacao da listagem admin (banco de verdade)', () => {
  beforeAll(async () => {
    mockGetAuthUser.mockResolvedValue(EDITOR)
    await wipe()
    await prisma.news.createMany({ data: seedRows() as never })
  }, 120_000)

  afterAll(async () => {
    await wipe()
    await prisma.$disconnect()
  })

  beforeEach(() => {
    mockGetAuthUser.mockResolvedValue(EDITOR)
  })

  // -------------------------------------------------------------------------
  // Criterio 3 — total x SELECT count(*)
  // -------------------------------------------------------------------------

  test('criterio 3: pagination.total bate com o SELECT count(*) real (quarentena oculta)', async () => {
    const p = await listPage({ page: '1', limit: '10' })
    const sql = await rawAnchorCount(false)

    evidence('criterio 3 (quarentena oculta)', {
      api_pagination_total: p.total,
      sql_count: sql,
      sql: 'SELECT count(*) FROM news WHERE group_rank = 0 AND editorial_block_reason IS NULL',
      quarantine_header: p.quarantineHeader,
    })

    expect(p.status).toBe(200)
    expect(sql).toBe(VISIBLE_ANCHORS)
    expect(p.total).toBe(sql)
    expect(p.quarantineHeader).toBe(String(QUARANTINED_ANCHORS))
  })

  test('criterio 3: pagination.total bate com o SELECT count(*) real (includeQuarantine=1)', async () => {
    const p = await listPage({ page: '1', limit: '10', includeQuarantine: '1' })
    const sql = await rawAnchorCount(true)

    evidence('criterio 3 (includeQuarantine=1)', {
      api_pagination_total: p.total,
      sql_count: sql,
      sql: 'SELECT count(*) FROM news WHERE group_rank = 0',
    })

    expect(p.status).toBe(200)
    expect(sql).toBe(VISIBLE_ANCHORS + QUARANTINED_ANCHORS)
    expect(p.total).toBe(sql)
  })

  test('criterio 3: total conta GRUPO e nao LINHA (os irmaos nao entram)', async () => {
    const rows = await prisma.news.count({})
    const p = await listPage({ page: '1', limit: '10' })

    expect(rows).toBe(VISIBLE_ANCHORS + QUARANTINED_ANCHORS + SIBLINGS)
    expect(p.total).toBeLessThan(rows)
    expect(p.total).toBe(VISIBLE_ANCHORS)
  })

  // -------------------------------------------------------------------------
  // Criterio 2 — fatia correta, sem repetir nem pular
  // -------------------------------------------------------------------------

  test('criterio 2: a varredura completa cobre o acervo sem repetir nem pular nenhum grupo', async () => {
    const { sequence, perPage, total, totalPages } = await walkAllPages(10)

    evidence('criterio 2 (varredura completa, limit 10)', {
      paginas: totalPages,
      ids_devolvidos: sequence.length,
      ids_distintos: new Set(sequence).size,
      repetidos: sequence.length - new Set(sequence).size,
      pulados: [...EXPECTED_VISIBLE_IDS].filter((id) => !sequence.includes(id)).length,
    })

    expect(total).toBe(VISIBLE_ANCHORS)
    expect(totalPages).toBe(VISIBLE_ANCHORS / 10)
    expect(perPage.every((n) => n === 10)).toBe(true)

    // Nenhum repetido: o set tem o mesmo tamanho da sequencia.
    expect(new Set(sequence).size).toBe(sequence.length)
    // Nenhum pulado: o set e exatamente o acervo visivel semeado.
    expect(sequence.length).toBe(VISIBLE_ANCHORS)
    const missing = [...EXPECTED_VISIBLE_IDS].filter((id) => !sequence.includes(id))
    expect(missing).toEqual([])
    // Nenhuma linha em quarentena e nenhum irmao vazaram para a listagem.
    expect(sequence.filter((id) => !EXPECTED_VISIBLE_IDS.has(id))).toEqual([])
  }, 120_000)

  test('criterio 2: o bloco com created_at EMPATADO aparece exatamente uma vez cada', async () => {
    const { sequence } = await walkAllPages(10)
    const tied = sequence.filter((id) => TIED_IDS.has(id))

    expect(tied.length).toBe(TIED_BLOCK)
    expect(new Set(tied).size).toBe(TIED_BLOCK)
    // Ordem total: dentro do empate, `id ASC` decide.
    expect(tied).toEqual([...tied].sort())
  }, 120_000)

  test('criterio 2: duas varreduras identicas devolvem a MESMA sequencia (fatia reproduzivel)', async () => {
    const a = await walkAllPages(10)
    const b = await walkAllPages(10)
    expect(b.sequence).toEqual(a.sequence)
  }, 180_000)

  test('criterio 2: limites diferentes cobrem o mesmo conjunto (limit 7 x limit 10)', async () => {
    const a = await walkAllPages(10)
    const b = await walkAllPages(7)

    expect(new Set(b.sequence).size).toBe(VISIBLE_ANCHORS)
    expect([...new Set(b.sequence)].sort()).toEqual([...new Set(a.sequence)].sort())
    // A ordem tambem e a mesma: o corte de pagina nao pode reordenar o acervo.
    expect(b.sequence).toEqual(a.sequence)
  }, 180_000)

  test('pagina fora do intervalo responde 200 com lista vazia e pagination coerente', async () => {
    const p = await listPage({ page: '999', limit: '10' })

    expect(p.status).toBe(200)
    expect(p.ids).toEqual([])
    expect(p.total).toBe(VISIBLE_ANCHORS)
    expect(p.totalPages).toBe(VISIBLE_ANCHORS / 10)
  })
})
