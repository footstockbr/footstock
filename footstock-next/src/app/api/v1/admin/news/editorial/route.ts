// ============================================================================
// FootStock — /api/v1/admin/news/editorial
// CRUD editorial para notícias do módulo admin (não injeta no motor).
// Rastreabilidade: INTAKE admin notícias editoriais
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import type { AuthContext } from '@/app/api/middleware'
import { NEWS_STATUS } from '@/lib/enums'

const querySchema = z.object({
  status: z.enum(['ALL', 'PUBLISHED', 'DRAFT', 'ARCHIVED']).default('ALL'),
  ticker: z.string().min(2).max(5).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})

const createSchema = z.object({
  title: z.string().min(5).max(255),
  content: z.string().min(10).max(4000),
  impact: z.enum(['FINANCEIRA_CRITICA', 'ESPORTIVA_MAJORITARIA', 'MERCADO_ATIVOS', 'INTEGRIDADE_SAUDE', 'INSTITUCIONAL', 'ESPORTIVA_MENOR']),
  sentiment: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']),
  ticker: z.string().min(2).max(5),
  source: z.string().max(255).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
})

// Item 017 (correcao pos-auditoria): teto de CHAVES DE GRUPO distintas usadas na
// resolucao do filtro por ticker, mais os limites da varredura paginada que as
// coleta. O teto de grupos acompanha o `take` da listagem final (200); o teto de
// paginas limita o trabalho por request (no pior caso 2000 linhas varridas).
const GROUP_KEY_LIMIT = 200
const GROUP_SCAN_PAGE_SIZE = 200
const GROUP_SCAN_MAX_PAGES = 10

function parseDate(raw?: string): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function statusFilter(status: 'ALL' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED') {
  if (status === NEWS_STATUS.PUBLISHED) return { isPublished: true as const }
  if (status === NEWS_STATUS.DRAFT) return { isPublished: false as const, publishedAt: null }
  if (status === NEWS_STATUS.ARCHIVED) return { isPublished: false as const, NOT: { publishedAt: null } }
  return {}
}

function statusToPersist(status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
  if (status === NEWS_STATUS.PUBLISHED) {
    return { isPublished: true, publishedAt: new Date() }
  }
  if (status === NEWS_STATUS.ARCHIVED) {
    return { isPublished: false, publishedAt: new Date() }
  }
  return { isPublished: false, publishedAt: null }
}

async function getHandler(req: NextRequest): Promise<NextResponse> {
  const parsed = querySchema.safeParse({
    status: req.nextUrl.searchParams.get('status') ?? 'ALL',
    ticker: req.nextUrl.searchParams.get('ticker') ?? undefined,
    from: req.nextUrl.searchParams.get('from') ?? undefined,
    to: req.nextUrl.searchParams.get('to') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Parâmetros inválidos.' }, { status: 400 })
  }

  const { status, ticker, from, to } = parsed.data
  const fromDate = parseDate(from)
  const toDate = parseDate(to)

  if ((from && !fromDate) || (to && !toDate)) {
    return NextResponse.json({ success: false, error: 'Filtro de data inválido.' }, { status: 400 })
  }

  // Item 017 / ST004: a listagem editorial tambem conta GRUPOS, nao linhas — so a
  // ancora (group_rank 0) entra. Acervo unitario pos-backfill (item 008) tem
  // group_rank 0 em toda linha, entao o resultado nao muda (criterio 17).
  const where: Record<string, unknown> = {
    ...statusFilter(status),
    groupRank: 0,
  }

  if (fromDate || toDate) {
    where.createdAt = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: new Date(toDate.getTime() + 24 * 60 * 60 * 1000 - 1) } : {}),
    }
  }

  if (ticker) {
    const asset = await prisma.asset.findUnique({
      where: { ticker: ticker.toUpperCase() },
      select: { id: true },
    })
    if (!asset) {
      return NextResponse.json({ success: true, data: [] })
    }
    // Item 017 / ST004: o ticker filtrado pode estar num IRMAO (group_rank > 0).
    // Combinar `assetIds has X` direto com `groupRank: 0` esconderia o grupo
    // inteiro. Padrao do item 015: resolver primeiro os group_id que tem alguma
    // linha casando no ticker, depois filtrar a ancora DENTRO desses grupos.
    //
    // Correcao pos-auditoria: um `take` cru sobre LINHAS nao serve de teto de
    // GRUPOS. Varias linhas cabem no mesmo grupo, entao 200 linhas podem valer
    // poucos grupos e — sem `orderBy` — a janela era arbitraria, podendo omitir
    // grupos recentes que ainda cabiam na listagem. A varredura agora e ORDENADA
    // (createdAt desc, id desc como tie-break unico) e PAGINADA por cursor, com
    // teto em CHAVES DISTINTAS. Se a varredura estourar o teto de paginas, o que
    // sobra sao sempre os grupos mais RECENTES, mesma semantica do
    // `orderBy createdAt desc` da listagem final.
    const groupKeys: string[] = []
    const seenGroupKeys = new Set<string>()
    let scanCursor: string | null = null
    let scanPages = 0

    while (seenGroupKeys.size < GROUP_KEY_LIMIT && scanPages < GROUP_SCAN_MAX_PAGES) {
      // Anotacao explicita: o spread condicional do cursor deixa o arg como uniao,
      // e sem o tipo aqui o TS entra em inferencia circular (TS7022).
      const page: { id: string; groupId: string | null }[] = await prisma.news.findMany({
        where: { assetIds: { has: asset.id } },
        select: { id: true, groupId: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: GROUP_SCAN_PAGE_SIZE,
        ...(scanCursor ? { cursor: { id: scanCursor }, skip: 1 } : {}),
      })
      scanPages += 1
      if (page.length === 0) break

      for (const row of page) {
        // Grupo unitario D1 pode ter group_id nulo; nesse caso a chave do grupo e o id.
        const key = row.groupId ?? row.id
        if (seenGroupKeys.has(key)) continue
        seenGroupKeys.add(key)
        groupKeys.push(key)
        if (seenGroupKeys.size >= GROUP_KEY_LIMIT) break
      }

      if (page.length < GROUP_SCAN_PAGE_SIZE) break
      scanCursor = page[page.length - 1].id
    }

    if (groupKeys.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }
    where.OR = [
      { groupId: { in: groupKeys } },
      { AND: [{ groupId: null }, { id: { in: groupKeys } }] },
    ]
  }

  const rows = await prisma.news.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      title: true,
      content: true,
      impact: true,
      sentiment: true,
      source: true,
      isPublished: true,
      publishedAt: true,
      createdAt: true,
      assetIds: true,
      // Item 017: o item 018 precisa do groupId para o badge de grupo na tela.
      groupId: true,
      groupRank: true,
    },
  })

  const allAssetIds = Array.from(new Set(rows.flatMap(item => item.assetIds)))
  const assets = allAssetIds.length
    ? await prisma.asset.findMany({
        where: { id: { in: allAssetIds } },
        select: { id: true, ticker: true },
      })
    : []
  const tickerByAssetId = new Map(assets.map(a => [a.id, a.ticker]))

  const data = rows.map(item => {
    const tickers = item.assetIds.map(id => tickerByAssetId.get(id)).filter(Boolean) as string[]
    const statusComputed = item.isPublished
      ? 'PUBLISHED'
      : item.publishedAt
      ? 'ARCHIVED'
      : 'DRAFT'
    return {
      ...item,
      status: statusComputed,
      tickers,
      ticker: tickers[0] ?? null,
    }
  })

  return NextResponse.json({ success: true, data })
}

async function postHandler(req: NextRequest, _ctx: AuthContext): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido.' }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Dados inválidos.' }, { status: 422 })
  }

  const payload = parsed.data
  const asset = await prisma.asset.findUnique({
    where: { ticker: payload.ticker.toUpperCase() },
    select: { id: true },
  })

  if (!asset) {
    return NextResponse.json({ success: false, error: 'Ticker inválido.' }, { status: 422 })
  }

  const statusData = statusToPersist(payload.status)
  const newsData = {
    title: payload.title,
    content: payload.content,
    impact: payload.impact as import("@prisma/client").ImpactCategory,
    sentiment: payload.sentiment as import("@prisma/client").Sentiment,
    source: payload.source?.trim() || null,
    // BUGFIX 2026-06-23: persistir o ticker validado (antes só assetIds era
    // gravado → coluna ticker ficava null → badge "Sem time"). ticker e assetIds
    // são mantidos em sincronia (ADR Opcao A).
    ticker: payload.ticker.toUpperCase(),
    assetIds: [asset.id],
    ...statusData,
  }
  const created = await prisma.news.create({
    data: newsData as Parameters<typeof prisma.news.create>[0]['data'],
    select: { id: true },
  })

  return NextResponse.json({ success: true, data: created }, { status: 201 })
}

export const GET = withAdmin('news:read')(getHandler)
export const POST = withAdmin('news:write')(postHandler)

