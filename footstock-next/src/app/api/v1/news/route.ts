import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { list, errors, parsePagination, buildPagination } from '@/lib/api'
import type { ImpactCategory } from '@/types'

const VALID_CATEGORIES = [
  'RESULTADO_ESPORTIVO', 'CONTRATACAO', 'FINANCEIRO',
  'LESAO', 'SUSPENSAO', 'INSTITUCIONAL',
]

// GET /api/v1/news
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { searchParams } = request.nextUrl
  const ticker = searchParams.get('ticker')
  const impactCategory = searchParams.get('impactCategory')
  const { page, limit, skip } = parsePagination(searchParams, 20)

  if (impactCategory && !VALID_CATEGORIES.includes(impactCategory)) {
    return errors.validation('Categoria de impacto inválida.')
  }

  try {
    const where = {
      ...(ticker && { ticker: ticker.toUpperCase() }),
      ...(impactCategory && { impactCategory: impactCategory as ImpactCategory }),
    }

    const [news, total] = await Promise.all([
      prisma.news.findMany({
        where,
        orderBy: { injectedAt: 'desc' },
        skip,
        take: Math.min(limit, 50),
      }),
      prisma.news.count({ where }),
    ])

    const serialized = news.map((n) => ({
      id: n.id,
      title: n.title,
      source: n.source,
      url: n.url,
      ticker: n.ticker,
      sentiment: n.sentiment.toNumber(),
      impactCategory: n.impactCategory as ImpactCategory,
      publishedAt: n.publishedAt.toISOString(),
      injectedAt: n.injectedAt.toISOString(),
      createdAt: n.createdAt.toISOString(),
    }))

    return list(serialized, buildPagination(page, Math.min(limit, 50), total))
  } catch {
    return errors.server()
  }
}
