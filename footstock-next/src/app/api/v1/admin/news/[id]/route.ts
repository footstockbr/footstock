import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { ImpactCategory } from '@/types'

const UpdateNewsSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(200, 'Máximo 200 caracteres').optional(),
  ticker: z.string().max(10, 'Máximo 10 caracteres').optional().or(z.literal('')),
  sentiment: z.enum(['positive', 'negative', 'neutral'], {
    error: () => ({ message: 'Sentimento inválido' }),
  }).optional(),
  category: z.string().min(1, 'Categoria é obrigatória').optional(),
  status: z.enum(['published', 'archived']).optional(),
})

// Mapeamento sentimento string → decimal
const SENTIMENT_MAP: Record<string, number> = {
  positive: 0.75,
  negative: -0.75,
  neutral: 0.0,
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
  const raw = n.sentiment.toNumber()
  return {
    id: n.id,
    title: n.title,
    source: n.source,
    url: n.url,
    ticker: n.ticker,
    sentiment: raw > 0.1 ? 'positive' : raw < -0.1 ? 'negative' : 'neutral',
    sentimentRaw: raw,
    category: n.impactCategory,
    status: n.status,
    publishedAt: n.publishedAt.toISOString(),
    injectedAt: n.injectedAt.toISOString(),
    createdAt: n.createdAt.toISOString(),
  }
}

// PUT /api/v1/admin/news/:id — EDITOR+
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'EDITOR')) {
    return errors.forbidden()
  }

  const { id } = await params

  try {
    const body = await request.json()
    const parsed = UpdateNewsSchema.safeParse(body)
    if (!parsed.success) return errors.validation()

    const existing = await prisma.news.findUnique({ where: { id } })
    if (!existing) return errors.notFound('Notícia não encontrada.')

    const { title, ticker, sentiment, category, status } = parsed.data

    const updateData: Record<string, unknown> = {}
    if (title !== undefined) updateData.title = title
    if (ticker !== undefined && ticker !== '') updateData.ticker = ticker.toUpperCase()
    if (category !== undefined) updateData.impactCategory = category as ImpactCategory
    if (status !== undefined) updateData.status = status
    if (sentiment !== undefined) updateData.sentiment = SENTIMENT_MAP[sentiment]

    const updated = await prisma.news.update({
      where: { id },
      data: updateData,
    })

    const tickerChanged = ticker !== undefined && ticker !== '' && ticker.toUpperCase() !== existing.ticker
    const sentimentChanged = sentiment !== undefined && SENTIMENT_MAP[sentiment] !== existing.sentiment.toNumber()

    await prisma.adminMarketAction.create({
      data: {
        adminId: auth.user.id,
        action: 'EDIT_NEWS',
        targetTicker: updated.ticker,
        details: {
          newsId: id,
          changes: parsed.data,
          redisEvent: tickerChanged || sentimentChanged,
        },
      },
    })

    // Redis event news:updated — deferred to module-29-integration (requires Redis client setup)
    // When implemented: if (tickerChanged || sentimentChanged) redis.publish('news:updated', { newsId: id, ticker: updated.ticker })

    return ok(serializeNews(updated))
  } catch {
    return errors.server()
  }
}

// DELETE /api/v1/admin/news/:id — EDITOR+ (soft delete: status = 'archived')
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'EDITOR')) {
    return errors.forbidden()
  }

  const { id } = await params

  try {
    const existing = await prisma.news.findUnique({ where: { id } })
    if (!existing) return errors.notFound('Notícia não encontrada.')

    const updated = await prisma.news.update({
      where: { id },
      data: { status: 'archived' },
    })

    await prisma.adminMarketAction.create({
      data: {
        adminId: auth.user.id,
        action: 'ARCHIVE_NEWS',
        targetTicker: existing.ticker,
        details: { newsId: id },
      },
    })

    return ok({ id: updated.id, status: updated.status })
  } catch {
    return errors.server()
  }
}
