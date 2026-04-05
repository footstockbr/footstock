// ============================================================================
// Foot Stock — GET /api/v1/admin/moderation/flagged
// Fila de posts sinalizados para moderação manual.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

async function getHandler(req: NextRequest): Promise<NextResponse> {
  const parsed = querySchema.safeParse({
    page: req.nextUrl.searchParams.get('page') ?? 1,
    limit: req.nextUrl.searchParams.get('limit') ?? 20,
  })
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Parâmetros inválidos.' }, { status: 400 })
  }

  const { page, limit } = parsed.data
  const skip = (page - 1) * limit

  const where = { isDeleted: false, isFlagged: true }

  const [rows, total] = await Promise.all([
    prisma.globalForumPost.findMany({
      where,
      orderBy: [{ flagCount: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            adminRole: true,
          },
        },
        _count: { select: { likes: true } },
      },
    }),
    prisma.globalForumPost.count({ where }),
  ])

  return NextResponse.json({
    success: true,
    data: {
      items: rows.map(row => ({
        id: row.id,
        content: row.content,
        ticker: row.ticker,
        flagCount: row.flagCount,
        likesCount: row._count.likes,
        createdAt: row.createdAt,
        user: row.user,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    },
  })
}

export const GET = withAdmin('forum:moderate')(getHandler)

