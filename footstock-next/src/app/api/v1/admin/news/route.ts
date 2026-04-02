import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, created, errors, parsePagination, buildPagination } from '@/lib/api'
import type { ImpactCategory } from '@/types'

const PAGE_SIZE = 20

// Mapeamento de sentimento string → range decimal
function sentimentFilter(sentiment: string | null) {
  if (!sentiment) return undefined
  if (sentiment === 'positive') return { gt: 0.1 }
  if (sentiment === 'negative') return { lt: -0.1 }
  if (sentiment === 'neutral') return { gte: -0.1, lte: 0.1 }
  return undefined
}

function sentimentToLabel(value: number): 'positive' | 'negative' | 'neutral' {
  if (value > 0.1) return 'positive'
  if (value < -0.1) return 'negative'
  return 'neutral'
}

function serializeNews(n: {
  id: string
  title: string
  source: string
  url: string
  ticker: string
  sentiment: { toNumber: () => number }
  impactCategory: string
  status: string
  publishedAt: Date
  injectedAt: Date
  createdAt: Date
}) {
  return {
    id: n.id,
    title: n.title,
    source: n.source,
    url: n.url,
    ticker: n.ticker,
    sentiment: sentimentToLabel(n.sentiment.toNumber()),
    sentimentRaw: n.sentiment.toNumber(),
    impactCategory: n.impactCategory,
    status: n.status,
    publishedAt: n.publishedAt.toISOString(),
    injectedAt: n.injectedAt.toISOString(),
    createdAt: n.createdAt.toISOString(),
  }
}

// GET /api/v1/admin/news — EDITOR+
// Lista notícias com filtros (fonte, ticker, sentiment, status) e paginação
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'EDITOR')) {
    return errors.forbidden()
  }

  const { searchParams } = request.nextUrl
  const fonte = searchParams.get('fonte')
  const ticker = searchParams.get('ticker')
  const sentiment = searchParams.get('sentiment')
  const status = searchParams.get('status')
  const { page, limit, skip } = parsePagination(searchParams, PAGE_SIZE)

  try {
    const where = {
      ...(fonte && { source: { contains: fonte, mode: 'insensitive' as const } }),
      ...(ticker && { ticker: ticker.toUpperCase() }),
      ...(sentiment && { sentiment: sentimentFilter(sentiment) }),
      ...(status && { status }),
    }

    const [items, total, totalPublished, totalArchived, classifiedToday] = await Promise.all([
      prisma.news.findMany({
        where,
        orderBy: { injectedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.news.count({ where }),
      prisma.news.count({ where: { status: 'published' } }),
      prisma.news.count({ where: { status: 'archived' } }),
      prisma.news.count({
        where: {
          injectedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ])

    return ok({
      items: items.map(serializeNews),
      pagination: buildPagination(page, limit, total),
      meta: {
        totalPublished,
        totalArchived,
        classifiedToday,
      },
    })
  } catch {
    return errors.server()
  }
}

// POST /api/v1/admin/news — ADMIN+
// Injeta notícia manual no motor via Redis news:inject
const InjectNewsSchema = z.object({
  title: z.string().min(5).max(255),
  ticker: z.string().max(10),
  impactCategory: z.enum([
    'RESULTADO_ESPORTIVO', 'CONTRATACAO', 'FINANCEIRO',
    'LESAO', 'SUSPENSAO', 'INSTITUCIONAL',
  ]),
  sentiment: z.number().min(-1.0).max(1.0),
})

export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'ADMIN')) {
    return errors.forbidden()
  }

  try {
    const body = await request.json()
    const parsed = InjectNewsSchema.safeParse(body)
    if (!parsed.success) return errors.validation()

    const { title, ticker, impactCategory, sentiment } = parsed.data

    const asset = await prisma.asset.findUnique({ where: { ticker: ticker.toUpperCase() } })
    if (!asset) return errors.notFound('Ativo não encontrado.')

    const news = await prisma.news.create({
      data: {
        title,
        source: 'ADMIN_MANUAL',
        url: '#',
        ticker: ticker.toUpperCase(),
        sentiment,
        impactCategory: impactCategory as ImpactCategory,
        status: 'published',
        publishedAt: new Date(),
      },
    })

    await prisma.adminMarketAction.create({
      data: {
        adminId: auth.user.id,
        action: 'INJECT_NEWS',
        targetTicker: ticker.toUpperCase(),
        details: { newsId: news.id, sentiment, impactCategory },
      },
    })

    return created(serializeNews(news))
  } catch {
    return errors.server()
  }
}
