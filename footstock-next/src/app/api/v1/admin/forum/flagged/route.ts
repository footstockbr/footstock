import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { list, errors, parsePagination, buildPagination } from '@/lib/api'

// GET /api/v1/admin/forum/flagged — MODERADOR+
// Retorna posts com status=FLAGGED aguardando revisão
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'MODERADOR')) {
    return errors.forbidden()
  }

  const { page, limit, skip } = parsePagination(request.nextUrl.searchParams)

  try {
    const where = { status: 'FLAGGED' as const, isDeleted: false }

    const [posts, total] = await Promise.all([
      prisma.globalForumPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, planType: true } },
          _count: { select: { likes: true } },
        },
      }),
      prisma.globalForumPost.count({ where }),
    ])

    const serialized = posts.map((p) => ({
      id: p.id,
      userId: p.userId,
      content: p.content,
      contentRaw: p.contentRaw, // admin vê original com PII
      ticker: p.ticker ?? null,
      isFlagged: p.isFlagged,
      flaggedBy: p.flaggedBy, // regras que ativaram
      flagCount: p.flagCount,
      status: p.status,
      likes: p._count.likes,
      author: {
        id: p.user.id,
        name: p.user.name,
        plan: p.user.planType,
      },
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }))

    return list(serialized, buildPagination(page, limit, total))
  } catch {
    return errors.server()
  }
}
