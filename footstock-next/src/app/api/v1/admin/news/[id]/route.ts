import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { ImpactCategory } from '@/types'

const UpdateNewsSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(200, 'Máximo 200 caracteres').optional(),
  sentiment: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL'], {
    error: () => ({ message: 'Sentimento inválido' }),
  }).optional(),
  category: z.string().min(1, 'Categoria é obrigatória').optional(),
  isPublished: z.boolean().optional(),
})

function serializeNews(n: {
  id: string
  title: string
  content: string
  source: string | null
  sentiment: string
  impact: string
  assetIds: string[]
  isPublished: boolean
  publishedAt: Date | null
  createdAt: Date
}) {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    source: n.source,
    sentiment: n.sentiment,
    category: n.impact,
    isPublished: n.isPublished,
    publishedAt: n.publishedAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    assetIds: n.assetIds,
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

    const { title, sentiment, category, isPublished } = parsed.data

    const updateData: Record<string, unknown> = {}
    if (title !== undefined) updateData.title = title
    if (category !== undefined) updateData.impact = category as ImpactCategory
    if (sentiment !== undefined) updateData.sentiment = sentiment
    if (isPublished !== undefined) {
      updateData.isPublished = isPublished
      if (isPublished && !existing.publishedAt) updateData.publishedAt = new Date()
    }

    const updated = await prisma.news.update({
      where: { id },
      data: updateData,
    })

    const sentimentChanged = sentiment !== undefined && sentiment !== existing.sentiment

    await prisma.adminMarketAction.create({
      data: {
        adminId: auth.user.id,
        action: 'EDIT_NEWS',
        ticker: existing.assetIds[0] ?? null,
        details: {
          newsId: id,
          changes: parsed.data,
          redisEvent: sentimentChanged,
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
      data: { isPublished: false },
    })

    await prisma.adminMarketAction.create({
      data: {
        adminId: auth.user.id,
        action: 'ARCHIVE_NEWS',
        ticker: existing.assetIds[0] ?? null,
        details: { newsId: id },
      },
    })

    return ok({ id: updated.id, isPublished: updated.isPublished })
  } catch {
    return errors.server()
  }
}
