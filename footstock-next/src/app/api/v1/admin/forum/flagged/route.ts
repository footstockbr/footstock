import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { list, errors, parsePagination, buildPagination } from '@/lib/api'

// GET /api/v1/admin/forum/flagged — MODERADOR+
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'MODERADOR')) {
    return errors.forbidden()
  }

  const { page, limit, skip } = parsePagination(request.nextUrl.searchParams)

  try {
    const where = { isFlagged: true, isDeleted: false }

    const [posts, total] = await Promise.all([
      prisma.globalForumPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          _count: { select: { likes: true } },
        },
      }),
      prisma.globalForumPost.count({ where }),
    ])

    const serialized = posts.map((p) => ({
      id: p.id,
      userId: p.userId,
      content: p.content,
      ticker: p.ticker ?? null,
      isFlagged: p.isFlagged,
      flagCount: p.flagCount,
      likes: p._count.likes,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }))

    return list(serialized, buildPagination(page, limit, total))
  } catch {
    return errors.server()
  }
}
