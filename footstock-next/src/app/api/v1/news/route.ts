import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { list, errors, parsePagination, buildPagination } from '@/lib/api'
import type { ImpactCategory } from '@/types'

const VALID_IMPACTS = [
  'POSITIVE', 'NEGATIVE', 'NEUTRAL',
  'FINANCEIRA_CRITICA', 'ESPORTIVA_MAJORITARIA', 'MERCADO_ATIVOS',
  'INTEGRIDADE_SAUDE', 'INSTITUCIONAL', 'ESPORTIVA_MENOR',
]

// GET /api/v1/news
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { searchParams } = request.nextUrl
  const assetId = searchParams.get('assetId')
  // T-09: suportar filtro por ticker também
  const ticker = searchParams.get('ticker')
  const impact = searchParams.get('impact')
  const { page, limit, skip } = parsePagination(searchParams, 20)

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
      filterAssetId = asset?.id ?? null
    }

    const where = {
      isPublished: true,
      ...(filterAssetId && { assetIds: { has: filterAssetId } }),
      ...(impact && { impact: impact as ImpactCategory }),
    }

    const [news, total] = await Promise.all([
      prisma.news.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: Math.min(limit, 50),
      }),
      prisma.news.count({ where }),
    ])

    const serialized = news.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      source: n.source,
      assetIds: n.assetIds,
      sentiment: n.sentiment,
      impact: n.impact as ImpactCategory,
      isPublished: n.isPublished,
      publishedAt: n.publishedAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }))

    return list(serialized, buildPagination(page, Math.min(limit, 50), total))
  } catch {
    return errors.server()
  }
}
