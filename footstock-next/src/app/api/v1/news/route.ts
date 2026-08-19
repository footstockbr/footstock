import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { list, errors, parsePagination, buildPagination } from '@/lib/api'
import type { AssetSentiment, ImpactCategory } from '@/types'
import type { NewsFeedItem, NewsTeamLine } from '@/lib/types/news'

const VALID_IMPACTS = [
  'POSITIVE', 'NEGATIVE', 'NEUTRAL',
  'FINANCEIRA_CRITICA', 'ESPORTIVA_MAJORITARIA', 'MERCADO_ATIVOS',
  'INTEGRIDADE_SAUDE', 'INSTITUCIONAL', 'ESPORTIVA_MENOR',
]

// M067/item 015: teto de grupos por pagina. O mesmo numero governa o `take` da
// consulta e o `IN` da hidratacao de irmaos — se um mudar, o outro muda na
// MESMA entrega, senao a pagina passa a devolver grupo sem `teams[]`.
const MAX_PAGE_SIZE = 50
const HYDRATION_MAX_GROUPS = MAX_PAGE_SIZE

// Colunas lidas da linha de noticia (topo do payload e linhas de time).
type NewsRow = {
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

/** Fallback do grupo unitario: acervo backfillado tem group_id = id (item 008). */
function groupKey(row: { id: string; groupId: string | null }): string {
  return row.groupId ?? row.id
}

function rankOf(row: { groupRank: number | null }): number {
  return row.groupRank ?? 0
}

function toTeamLine(row: NewsRow): NewsTeamLine {
  return {
    id: row.id,
    ticker: row.ticker,
    assetIds: row.assetIds,
    sentiment: row.sentiment as AssetSentiment,
    impact: row.impact as ImpactCategory,
    groupRank: rankOf(row),
  }
}

function toFeedItem(top: NewsRow, siblings: NewsRow[]): NewsFeedItem {
  return {
    id: top.id,
    title: top.title,
    content: top.content,
    source: top.source,
    assetIds: top.assetIds,
    sentiment: top.sentiment as AssetSentiment,
    impact: top.impact as ImpactCategory,
    isPublished: top.isPublished,
    publishedAt: top.publishedAt?.toISOString() ?? null,
    createdAt: top.createdAt.toISOString(),
    groupId: groupKey(top),
    groupRank: rankOf(top),
    ticker: top.ticker,
    teams: siblings.map(toTeamLine),
  }
}

// GET /api/v1/news
//
// DECISAO T-05: arquivar uma noticia (PATCH admin) grava isArchived=true no
// grupo, mas NAO zera isPublished. O feed publico filtra por isPublished=true
// E isArchived=false em todos os caminhos (selecao de ancoras, SQL raw filtrado
// e hidratacao de irmaos). Se um dia a regra de negocio mudar para "arquivar
// tambem despublica", sera necessario migrar o passivo (UPDATE noticias
// arquivadas para isPublished=false) e simplificar estes filtros.
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { searchParams } = request.nextUrl
  const assetId = searchParams.get('assetId')
  // T-09: suportar filtro por ticker também
  const ticker = searchParams.get('ticker')
  const impact = searchParams.get('impact')
  const { page, limit } = parsePagination(searchParams, 20)
  const take = Math.min(limit, MAX_PAGE_SIZE)
  // O `skip` de `parsePagination` e derivado de `limit` (cap 100), mas esta rota
  // pagina por `take` (cap 50, = HYDRATION_MAX_GROUPS). Usar os dois juntos abre
  // um buraco: com `?limit=100&page=2` o skip seria 100 e o take 50, entao as
  // linhas 50..99 nunca sao devolvidas por pagina nenhuma. O offset tem que sair
  // do MESMO tamanho de pagina que o `take`.
  const skip = (page - 1) * take

  if (impact && !VALID_IMPACTS.includes(impact)) {
    return errors.validation('Categoria de impacto inválida.')
  }

  try {
    let filterAssetId = assetId
    // Se ticker foi fornecido, resolver para assetId
    if (ticker && !assetId) {
      const asset = await prisma.asset.findUnique({
        where: { ticker: ticker.toUpperCase() },
        select: { id: true },
      })
      // Criterio 43: ticker desconhecido NAO pode cair no where sem filtro e
      // devolver 200 com o feed inteiro. Responde 4xx com motivo explicito — o
      // payload de lista (`ApiListResponse`) so tem `data` e `pagination` e nao
      // carrega motivo, entao lista vazia com 200 seria silencio.
      if (!asset) {
        return errors.validation(`Ticker desconhecido: ${ticker.toUpperCase()}.`)
      }
      filterAssetId = asset.id
    }

    const hasFilter = Boolean(filterAssetId || impact)

    // ─── Selecao da pagina: uma entrada por grupo ────────────────────────────
    // Sem filtro: branch ancorado (`group_rank = 0`), servido pelo indice
    // parcial news_feed_anchor_visible_idx da M067.
    // Com filtro: o grupo entra na pagina se QUALQUER linha dele casar o filtro
    // (P11) — por isso a ancora nao vai para o `where` aqui; ela so ordena.
    // `distinct` do Prisma nao serve: e aplicado depois do `take`/`skip`, o que
    // encolheria a pagina e partiria grupo entre paginas (criterios 9 e 10).
    let groupIds: string[]
    let total: number

    if (!hasFilter) {
      const where = { isPublished: true, isArchived: false, groupRank: 0 }
      const [anchors, anchorTotal] = await Promise.all([
        prisma.news.findMany({
          where,
          select: { id: true, groupId: true },
          // `id` fecha a ordenacao (W-03, override humano do listener-recovery de
          // 2026-07-29). Sem ele, duas ancoras com group_id NULL e published_at
          // empatado ficam em ordem indefinida, e o mesmo grupo podia aparecer em
          // duas paginas ou sumir entre elas (criterios 9 e 10). Como `id` e unico,
          // a ordem passa a ser total. Para essas linhas COALESCE(group_id, id) = id,
          // entao o desempate agora casa a chave efetiva usada pelo ramo filtrado.
          // Os dois primeiros termos seguem intactos: news_feed_anchor_visible_idx
          // continua servindo (published_at DESC, group_id); o `id` so resolve empate
          // residual dentro do que o indice ja entregou ordenado.
          orderBy: [{ publishedAt: 'desc' }, { groupId: 'asc' }, { id: 'asc' }],
          skip,
          take,
        }),
        prisma.news.count({ where }),
      ])
      groupIds = anchors.map(groupKey)
      total = anchorTotal
    } else {
      // Predicado parametrizado (nunca interpolacao de string): assetId e ticker
      // vem da query string; impact ja foi validado contra VALID_IMPACTS.
      const conditions: Prisma.Sql[] = [Prisma.sql`n.is_published = true`]
      conditions.push(Prisma.sql`n.is_archived = false`)
      if (filterAssetId) {
        // Espelha o `assetIds: { has: ... }` do filtro legado.
        conditions.push(Prisma.sql`n.asset_ids @> ARRAY[${filterAssetId}]::text[]`)
      }
      if (impact) {
        conditions.push(Prisma.sql`n.impact = ${impact}::"ImpactCategory"`)
      }
      const predicate = Prisma.join(conditions, ' AND ')

      // MAX(published_at) e o published_at do grupo: DB-02 obriga irmaos a
      // compartilhar o instante. COUNT(DISTINCT ...) conta GRUPOS — `news.count`
      // contaria linhas e inflaria o total quando dois irmaos casam o filtro.
      const [rows, counted] = await Promise.all([
        prisma.$queryRaw<{ group_id: string }[]>`
          SELECT COALESCE(n.group_id, n.id) AS group_id
          FROM news n
          WHERE ${predicate}
          GROUP BY COALESCE(n.group_id, n.id)
          ORDER BY MAX(n.published_at) DESC NULLS LAST, COALESCE(n.group_id, n.id) ASC
          LIMIT ${take} OFFSET ${skip}
        `,
        prisma.$queryRaw<{ count: number }[]>`
          SELECT COUNT(DISTINCT COALESCE(n.group_id, n.id))::int AS count
          FROM news n
          WHERE ${predicate}
        `,
      ])
      groupIds = rows.map((r) => r.group_id)
      total = Number(counted[0]?.count ?? 0)
    }

    const pagination = buildPagination(page, take, total)

    // Guarda: `IN ()` vazio nao vai ao banco.
    if (groupIds.length === 0) {
      return list<NewsFeedItem>([], pagination)
    }

    // ─── Hidratacao de irmaos: SEGUNDA e ultima query de dados ───────────────
    // Servida por news_group_siblings_visible_idx. O segundo ramo do OR cobre a
    // janela D1, em que uma linha pode ter group_id NULL e o grupo e o proprio id.
    const hydrateIds = groupIds.slice(0, HYDRATION_MAX_GROUPS)
    const siblingRows = (await prisma.news.findMany({
      where: {
        isPublished: true,
        isArchived: false,
        OR: [
          { groupId: { in: hydrateIds } },
          { AND: [{ groupId: null }, { id: { in: hydrateIds } }] },
        ],
      },
      orderBy: [{ groupId: 'asc' }, { groupRank: 'asc' }],
    })) as unknown as NewsRow[]

    const byGroup = new Map<string, NewsRow[]>()
    for (const row of siblingRows) {
      const key = groupKey(row)
      const bucket = byGroup.get(key)
      if (bucket) bucket.push(row)
      else byGroup.set(key, [row])
    }
    for (const bucket of byGroup.values()) {
      bucket.sort((a, b) => rankOf(a) - rankOf(b))
    }

    // Mesmo predicado do filtro, agora em memoria, para escolher a linha de topo
    // do grupo (D-E). Sem isso, `?ticker=URU3` devolveria o topo da ancora.
    const matchesFilter = (row: NewsRow): boolean =>
      (!filterAssetId || row.assetIds.includes(filterAssetId)) &&
      (!impact || row.impact === impact)

    const serialized: NewsFeedItem[] = []
    for (const groupId of groupIds) {
      const rows = byGroup.get(groupId)
      // Grupo que deixou de ser visivel entre a selecao e a hidratacao (ou que
      // caiu fora do teto HYDRATION_MAX_GROUPS) nao vira card fantasma.
      if (!rows || rows.length === 0) continue

      const top = hasFilter
        ? (rows.find(matchesFilter) ?? rows[0])
        : (rows.find((r) => rankOf(r) === 0) ?? rows[0])

      serialized.push(toFeedItem(top, rows))
    }

    return list(serialized, pagination)
  } catch {
    return errors.server()
  }
}
