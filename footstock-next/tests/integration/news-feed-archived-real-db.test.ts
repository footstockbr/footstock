/**
 * T-05 - Conferencia REAL (banco de verdade, sem mock de Prisma).
 *
 * Prova end-to-end que arquivar uma noticia real a remove dos TRES caminhos do
 * feed publico, e que arquivar NAO zera `isPublished` (premissa central da T-05).
 *
 * Diferenca para `tests/unit/news-feed-archived-filter.test.ts`: aquele mocka
 * `@/lib/prisma` e prova a construcao do `where`/predicado. ESTE roda contra
 * PostgreSQL real, com o client Prisma real, e executa o PATCH admin de
 * arquivamento de verdade. So `getAuthUser` e substituido (autenticacao nao e o
 * objeto da conferencia); `hasAdminRole` continua sendo a implementacao real.
 *
 * Opt-in: so roda com T05_REAL_DB=1 e DATABASE_URL apontando para um banco
 * descartavel. Sem isso a suite e pulada, para nao quebrar `npm test` nem CI
 * em ambiente sem banco.
 *
 *   T05_REAL_DB=1 \
 *   DATABASE_URL="postgresql://user:pass@127.0.0.1:5432/footstock_t05_verify?schema=public" \
 *   npx jest tests/integration/news-feed-archived-real-db.test.ts --no-cov
 */

import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn(),
  hasAdminRole: jest.requireActual('@/lib/utils/admin-roles').hasAdminRole,
}))

import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/v1/news/route'
import { PATCH } from '@/app/api/v1/admin/news/[id]/route'

/**
 * Nome de banco EXIGIDO. `wipe()` roda `deleteMany` de verdade, entao o guard
 * `T05_REAL_DB=1` sozinho e fraco: bastaria um `DATABASE_URL` de dev/producao
 * no ambiente para o teste apagar linhas fora do escopo. Aqui a execucao e
 * fail-closed — so roda contra um banco cujo nome contenha `t05verify`, que por
 * definicao e descartavel e criado para esta conferencia.
 */
const REQUIRED_DB_MARKER = 't05verify'

/** Nome do banco no DSN, sem credenciais nem querystring. '' se ilegivel. */
function targetDbName(): string {
  const url = process.env.DATABASE_URL
  if (!url) return ''
  try {
    // pathname = "/<database>"; ignora querystring (?schema=public) e credenciais.
    return new URL(url).pathname.slice(1)
  } catch {
    return ''
  }
}

function targetsDisposableDb(): boolean {
  // Normaliza separadores: `footstock_t05_verify` e `footstock-t05-verify`
  // devem casar com o marcador `t05verify`.
  return targetDbName().replace(/[^a-z0-9]/gi, '').toLowerCase().includes(REQUIRED_DB_MARKER)
}

const REAL_DB = process.env.T05_REAL_DB === '1'

if (REAL_DB && !targetsDisposableDb()) {
  throw new Error(
    `[T-05] Recusado: T05_REAL_DB=1 exige DATABASE_URL apontando para um banco ` +
      `descartavel cujo nome contenha "${REQUIRED_DB_MARKER}". Este teste apaga ` +
      `linhas; rodar contra dev/producao destruiria dados. ` +
      `Banco alvo: "${targetDbName() || '(DATABASE_URL ausente ou ilegivel)'}".`
  )
}

const d = REAL_DB ? describe : describe.skip

const mockGetAuthUser = getAuthUser as jest.Mock

const TAG = 't05verify'
const TICKER = 'T5V1'
const CLUB_SLUG = 't05-verify-fc'
const ASSET_ID = `${TAG}-asset`
const G1_ANCHOR = `${TAG}-g1-anchor`
const G1_SIBLING = `${TAG}-g1-sibling`
const G1 = `${TAG}-g1`
const CONTROL = `${TAG}-control`
const UNPUB_LIVE = `${TAG}-unpub-live`
const UNPUB_ARCH = `${TAG}-unpub-arch`

const PUBLISHED_AT = new Date('2026-08-19T12:00:00.000Z')

const READER = {
  user: { id: `${TAG}-reader`, name: 'Leitor', email: 'leitor@t05.test', planType: 'JOGADOR' },
}
const EDITOR = {
  user: {
    id: `${TAG}-editor`,
    name: 'Editor',
    email: 'editor@t05.test',
    planType: 'JOGADOR',
    adminRole: 'SUPER_ADMIN',
  },
}

async function feed(qs = '') {
  const res = await GET(new NextRequest(`http://localhost:3000/api/v1/news${qs}`))
  const json = (await res.json()) as {
    data?: Array<{ id: string; teams?: Array<{ id: string }> }>
    pagination?: { total: number }
  }
  return { status: res.status, items: json.data ?? [], total: json.pagination?.total ?? 0 }
}

/** Todos os ids visiveis: topo do grupo + linhas de time (hidratacao de irmaos). */
function visibleIds(items: Array<{ id: string; teams?: Array<{ id: string }> }>): string[] {
  const out: string[] = []
  for (const it of items) {
    out.push(it.id)
    for (const t of it.teams ?? []) out.push(t.id)
  }
  return out
}

/** Log de evidencia (opt-in): captura o payload real para registro documental. */
function evidence(label: string, payload: unknown) {
  if (process.env.T05_EVIDENCE === '1') {
    console.log(`[EVIDENCIA T-05] ${label}: ${JSON.stringify(payload)}`)
  }
}

async function wipe() {
  await prisma.news.deleteMany({ where: { id: { startsWith: TAG } } })
  await prisma.asset.deleteMany({ where: { id: ASSET_ID } })
}

d('T-05 conferencia real: arquivar remove do feed publico (banco de verdade)', () => {
  beforeAll(async () => {
    await wipe()
    await prisma.asset.create({
      data: {
        id: ASSET_ID,
        ticker: TICKER,
        displayName: 'T05 Verify FC',
        clubSlug: CLUB_SLUG,
        division: 'SERIE_A',
        cluster: 'A_TOP',
        currentPrice: 10,
        openPrice: 10,
        closePrice: 10,
        marketCap: 1000000,
        colorPrimary: '#000000',
        colorSecondary: '#ffffff',
      },
    })

    const base = {
      content: 'corpo da noticia de conferencia T-05',
      impact: 'INSTITUCIONAL' as const,
      sentiment: 'NEUTRAL' as const,
      source: 'conferencia-t05',
      publishedAt: PUBLISHED_AT,
    }

    await prisma.news.createMany({
      data: [
        // Combinacao 1: publicada + nao arquivada -> DEVE aparecer (ancora do grupo).
        {
          ...base,
          id: G1_ANCHOR,
          title: 'T05 alvo - ancora do grupo',
          ticker: TICKER,
          assetIds: [ASSET_ID],
          isPublished: true,
          isArchived: false,
          groupId: G1,
          groupRank: 0,
        },
        // Irmao do mesmo grupo: prova o caminho de hidratacao.
        {
          ...base,
          id: G1_SIBLING,
          title: 'T05 alvo - irmao do grupo',
          ticker: 'T5V2',
          assetIds: [ASSET_ID],
          isPublished: true,
          isArchived: false,
          groupId: G1,
          groupRank: 1,
        },
        // Controle: publicada + nao arquivada, outro grupo. Nunca pode sumir.
        {
          ...base,
          id: CONTROL,
          title: 'T05 controle - permanece visivel',
          ticker: 'T5V9',
          assetIds: [ASSET_ID],
          isPublished: true,
          isArchived: false,
          groupId: CONTROL,
          groupRank: 0,
        },
        // Combinacao 3: nao publicada + nao arquivada -> nunca aparece.
        {
          ...base,
          id: UNPUB_LIVE,
          title: 'T05 rascunho vivo',
          ticker: 'T5V3',
          assetIds: [ASSET_ID],
          isPublished: false,
          isArchived: false,
          groupId: UNPUB_LIVE,
          groupRank: 0,
        },
        // Combinacao 4: nao publicada + arquivada -> nunca aparece.
        {
          ...base,
          id: UNPUB_ARCH,
          title: 'T05 rascunho arquivado',
          ticker: 'T5V4',
          assetIds: [ASSET_ID],
          isPublished: false,
          isArchived: true,
          archivedAt: PUBLISHED_AT,
          groupId: UNPUB_ARCH,
          groupRank: 0,
        },
      ],
    })
  })

  afterAll(async () => {
    await wipe()
    await prisma.$disconnect()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAuthUser.mockResolvedValue(READER)
  })

  it('ANTES de arquivar: alvo visivel nos tres caminhos; nao publicadas nunca aparecem', async () => {
    const anchors = await feed()
    expect(anchors.status).toBe(200)
    evidence('ANTES / feed sem filtro', { total: anchors.total, ids: visibleIds(anchors.items) })
    expect(visibleIds(anchors.items)).toEqual(expect.arrayContaining([G1_ANCHOR, G1_SIBLING, CONTROL]))
    // Combinacoes 3 e 4 (isPublished=false) invisiveis contra banco real.
    expect(visibleIds(anchors.items)).not.toContain(UNPUB_LIVE)
    expect(visibleIds(anchors.items)).not.toContain(UNPUB_ARCH)

    const filtered = await feed(`?assetId=${ASSET_ID}`)
    expect(filtered.status).toBe(200)
    evidence('ANTES / feed com assetId', { total: filtered.total, ids: visibleIds(filtered.items) })
    expect(visibleIds(filtered.items)).toContain(G1_ANCHOR)

    // Hidratacao: o grupo alvo chega com as duas linhas de time.
    const target = anchors.items.find((i) => i.id === G1_ANCHOR)
    expect(target?.teams?.map((t) => t.id).sort()).toEqual([G1_ANCHOR, G1_SIBLING].sort())
  })

  it('ARQUIVAR pelo PATCH admin real nao zera isPublished (premissa da T-05)', async () => {
    mockGetAuthUser.mockResolvedValue(EDITOR)
    const res = await PATCH(
      new NextRequest(`http://localhost:3000/api/v1/admin/news/${G1_ANCHOR}`, {
        method: 'PATCH',
        body: JSON.stringify({ isArchived: true }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: G1_ANCHOR }) }
    )
    expect(res.status).toBe(200)

    const rows = await prisma.news.findMany({
      where: { groupId: G1 },
      select: { id: true, isPublished: true, isArchived: true },
      orderBy: { id: 'asc' },
    })
    evidence('PATCH admin / estado do grupo apos arquivar', rows)
    // Grupo inteiro arquivado...
    expect(rows.every((r) => r.isArchived)).toBe(true)
    // ...e AINDA publicado. E exatamente por isso que o feed precisa do filtro.
    expect(rows.every((r) => r.isPublished)).toBe(true)
  })

  it('DEPOIS de arquivar: alvo some dos tres caminhos; controle permanece', async () => {
    // Este caso depende do anterior (que arquiva). A pre-condicao e afirmada
    // explicitamente para que rodar fora de ordem (`-t`) falhe dizendo o motivo,
    // em vez de falhar como se o filtro do handler estivesse quebrado.
    const pre = await prisma.news.findMany({
      where: { groupId: G1 },
      select: { isArchived: true },
    })
    expect(pre.length).toBeGreaterThan(0)
    expect(pre.every((r) => r.isArchived)).toBe(true)

    const anchors = await feed()
    expect(anchors.status).toBe(200)
    evidence('DEPOIS / feed sem filtro', { total: anchors.total, ids: visibleIds(anchors.items) })
    expect(visibleIds(anchors.items)).not.toContain(G1_ANCHOR)
    expect(visibleIds(anchors.items)).not.toContain(G1_SIBLING)
    expect(visibleIds(anchors.items)).toContain(CONTROL)

    const filtered = await feed(`?assetId=${ASSET_ID}`)
    evidence('DEPOIS / feed com assetId', { total: filtered.total, ids: visibleIds(filtered.items) })
    expect(visibleIds(filtered.items)).not.toContain(G1_ANCHOR)
    expect(visibleIds(filtered.items)).not.toContain(G1_SIBLING)
    expect(visibleIds(filtered.items)).toContain(CONTROL)

    const byTicker = await feed(`?ticker=${TICKER}`)
    evidence('DEPOIS / feed com ticker', { total: byTicker.total, ids: visibleIds(byTicker.items) })
    expect(visibleIds(byTicker.items)).not.toContain(G1_ANCHOR)
    // Sem esta linha, uma regressao que zerasse o feed inteiro passaria
    // despercebida: "o alvo sumiu" tambem e verdade quando NADA sobra.
    expect(visibleIds(byTicker.items)).toContain(CONTROL)
  })
})
