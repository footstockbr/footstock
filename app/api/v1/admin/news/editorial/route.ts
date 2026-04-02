// ============================================================================
// Foot Stock — /api/v1/admin/news/editorial
// CRUD editorial para notícias do módulo admin (não injeta no motor).
// Rastreabilidade: INTAKE admin notícias editoriais
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import type { AuthContext } from '@/app/api/middleware'
import type { ImpactCategory, Sentiment } from '@prisma/client'
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

  const where: Record<string, unknown> = {
    ...statusFilter(status),
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
    where.assetIds = { has: asset.id }
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
      updatedAt: true,
      assetIds: true,
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
  const created = await prisma.news.create({
    data: {
      title: payload.title,
      content: payload.content,
      impact: payload.impact as ImpactCategory,
      sentiment: payload.sentiment as Sentiment,
      source: payload.source?.trim() || null,
      assetIds: [asset.id],
      ...statusData,
    },
    select: { id: true },
  })

  return NextResponse.json({ success: true, data: created }, { status: 201 })
}

export const GET = withAdmin('news:read')(getHandler)
export const POST = withAdmin('news:write')(postHandler)

