import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { list, errors, parsePagination, buildPagination } from '@/lib/api'
import type { PostStatus } from '@/types'

// GET /api/v1/admin/forum/flagged — MODERADOR+
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'MODERADOR')) {
    return errors.forbidden()
  }

  const { page, limit, skip } = parsePagination(request.nextUrl.searchParams)

  try {
    const where = { flagged: true, status: 'FLAGGED' as PostStatus }

    const [posts, total] = await Promise.all([
      prisma.forumPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.forumPost.count({ where }),
    ])

    const serialized = posts.map((p) => ({
      id: p.id,
      userId: p.userId,
      content: p.content,
      ticker: p.ticker ?? null,
      status: p.status as PostStatus,
      likes: p.likes,
      flagged: p.flagged,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }))

    return list(serialized, buildPagination(page, limit, total))
  } catch {
    return errors.server()
  }
}
