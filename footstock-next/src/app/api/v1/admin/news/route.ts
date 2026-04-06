import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, created, errors, parsePagination, buildPagination } from '@/lib/api'
import { redisPublisher, REDIS_CHANNELS } from '@/lib/redis'
import type { ImpactCategory, Sentiment } from '@prisma/client'

const PAGE_SIZE = 20

// Mapeamento de sentimento enum → label legível
function sentimentToLabel(value: Sentiment): 'positive' | 'negative' | 'neutral' {
  if (value === 'BULLISH') return 'positive'
  if (value === 'BEARISH') return 'negative'
  return 'neutral'
}

function sentimentFilterEnum(sentiment: string | null): Sentiment | undefined {
  if (!sentiment) return undefined
  if (sentiment === 'positive') return 'BULLISH'
  if (sentiment === 'negative') return 'BEARISH'
  if (sentiment === 'neutral') return 'NEUTRAL'
  return undefined
}

function serializeNews(n: {
  id: string
  title: string
  content: string
  source: string | null
  assetIds: string[]
  sentiment: Sentiment
  impact: ImpactCategory
  isPublished: boolean
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    source: n.source,
    assetIds: n.assetIds,
    sentiment: sentimentToLabel(n.sentiment),
    sentimentRaw: n.sentiment,
    impact: n.impact,
    // status é o campo lido pelo NewsStatusToggle e AdminNewsItem
    status: n.isPublished ? 'published' : 'archived',
    isPublished: n.isPublished,
    publishedAt: n.publishedAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
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
    const sentimentEnum = sentimentFilterEnum(sentiment)
    const where = {
      ...(fonte && { source: { contains: fonte, mode: 'insensitive' as const } }),
      ...(ticker && { assetIds: { has: ticker.toUpperCase() } }),
      ...(sentimentEnum && { sentiment: sentimentEnum }),
      ...(status === 'published' && { isPublished: true }),
      ...(status === 'archived' && { isPublished: false }),
    }

    const [items, total, totalPublished, totalArchived, classifiedToday] = await Promise.all([
      prisma.news.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.news.count({ where }),
      prisma.news.count({ where: { isPublished: true } }),
      prisma.news.count({ where: { isPublished: false } }),
      prisma.news.count({
        where: {
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
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
// Aceita o formato enviado pelo NewsInjector (ticker, impactCategory, sentiment numérico)
const InjectNewsSchema = z.object({
  title: z.string().min(5).max(255),
  content: z.string().min(1).optional(),
  ticker: z.string().min(1).max(20),
  impactCategory: z.enum([
    'FINANCEIRA_CRITICA', 'ESPORTIVA_MAJORITARIA', 'MERCADO_ATIVOS',
    'INTEGRIDADE_SAUDE', 'INSTITUCIONAL', 'ESPORTIVA_MENOR',
  ]),
  sentiment: z.number().min(-1).max(1),
})

function numericSentimentToEnum(value: number): Sentiment {
  if (value >= 0.3) return 'BULLISH'
  if (value <= -0.3) return 'BEARISH'
  return 'NEUTRAL'
}

export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) {
    return errors.forbidden()
  }

  try {
    const body = await request.json()
    const parsed = InjectNewsSchema.safeParse(body)
    if (!parsed.success) return errors.validation()

    const { title, content, ticker, impactCategory, sentiment: sentimentNum } = parsed.data

    const asset = await prisma.asset.findFirst({
      where: { ticker: ticker.toUpperCase() },
    })
    if (!asset) return errors.notFound('Ativo não encontrado.')

    const sentiment = numericSentimentToEnum(sentimentNum)
    const impact = impactCategory as ImpactCategory

    const news = await prisma.news.create({
      data: {
        title,
        content: content ?? title,
        source: 'ADMIN_MANUAL',
        assetIds: [asset.id],
        sentiment,
        impact,
        isPublished: true,
        publishedAt: new Date(),
      },
    })

    await prisma.adminMarketAction.create({
      data: {
        adminId: auth.user.id,
        action: 'INJECT_NEWS',
        ticker: asset.ticker,
        assetId: asset.id,
        details: { newsId: news.id, sentiment, impact },
      },
    })

    // Publicar no motor via Redis para impactar o preço imediatamente
    // Falha aqui não cancela a notícia — já foi salva no DB e auditada
    try {
      const durationTicks = sentimentNum >= 0.7 || sentimentNum <= -0.7 ? 10 : sentimentNum >= 0.3 || sentimentNum <= -0.3 ? 6 : 3
      await Promise.all([
        redisPublisher.publish(REDIS_CHANNELS.NEWS_INJECT, JSON.stringify({
          ticker: asset.ticker,
          title,
          sentiment: sentimentNum,
          impactCategory: impactCategory,
          source: 'ADMIN_MANUAL',
          durationTicks,
        })),
        redisPublisher.publish(REDIS_CHANNELS.MOTOR_CONTROL, JSON.stringify({
          type: 'INJECT_NEWS',
          assetId: asset.id,
          adminId: auth.user.id,
          payload: {
            impact: sentimentNum < 0 ? 'NEGATIVE' : 'POSITIVE',
            magnitude: Math.min(Math.abs(sentimentNum), 1),
            durationTicks,
            sentiment: sentimentNum,
          },
        })),
      ])
    } catch (err) {
      console.error('[admin/news] Falha ao publicar no motor via Redis:', err)
    }

    return created(serializeNews(news))
  } catch {
    return errors.server()
  }
}
