import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { created, errors } from '@/lib/api'
import type { ImpactCategory } from '@/types'

const InjectNewsSchema = z.object({
  title: z.string().min(5).max(255),
  ticker: z.string().max(10),
  impactCategory: z.enum([
    'RESULTADO_ESPORTIVO', 'CONTRATACAO', 'FINANCEIRO',
    'LESAO', 'SUSPENSAO', 'INSTITUCIONAL',
  ]),
  sentiment: z.number().min(-1.0).max(1.0),
})

// POST /api/v1/admin/news — ADMIN+
// Injeta notícia manual no motor via Redis news:inject
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
        publishedAt: new Date(),
      },
    })

    // TODO: Implementar via /auto-flow execute
    // Publicar no Redis canal news:inject para o motor processar
    // Motor aplica: 10 ticks spread + 40 ticks absorção na Pressure Queue

    await prisma.adminMarketAction.create({
      data: {
        adminId: auth.user.id,
        action: 'INJECT_NEWS',
        targetTicker: ticker.toUpperCase(),
        details: { newsId: news.id, sentiment, impactCategory },
      },
    })

    return created({
      id: news.id,
      title: news.title,
      source: news.source,
      url: news.url,
      ticker: news.ticker,
      sentiment: news.sentiment.toNumber(),
      impactCategory: news.impactCategory as ImpactCategory,
      publishedAt: news.publishedAt.toISOString(),
      injectedAt: news.injectedAt.toISOString(),
      createdAt: news.createdAt.toISOString(),
    })
  } catch {
    return errors.server()
  }
}
