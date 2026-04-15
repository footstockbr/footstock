import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { AdminRole, User } from '@/types'

export interface ModerationStatsDTO {
  newsCount: number        // notícias publicadas e não arquivadas
  suspiciousPosts: number  // posts flagged sem nenhuma ação de moderação ainda
  moderatedPosts: number   // posts distintos que receberam ao menos uma ação de moderação
  deletedPosts: number     // posts com isDeleted=true
  updatedAt: string
}

// GET /api/v1/admin/moderation/stats — MONITOR+
export async function GET(request: NextRequest) {
  let auth = await getAuthUser()

  if (!auth && process.env.NODE_ENV === 'development') {
    const adminRole = request.cookies.get('fs-admin-role')?.value
    if (adminRole) {
      const dummyUser = {
        id: 'dev-user', email: 'dev@foot-stock.test', name: 'Dev User',
        adminRole: adminRole as AdminRole,
      } as unknown as User
      auth = { user: dummyUser, supabaseId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'MONITOR')) return errors.forbidden()

  try {
    const [newsCount, suspiciousPosts, moderatedPosts, deletedPosts] = await Promise.all([
      // Notícias publicadas e não arquivadas
      prisma.news.count({
        where: { isPublished: true, isArchived: false },
      }),
      // Posts flagged que ainda não receberam nenhuma ação de revisão
      prisma.globalForumPost.count({
        where: {
          isFlagged: true,
          isDeleted: false,
          moderationActions: { none: {} },
        },
      }),
      // Posts distintos que receberam ao menos uma ação de moderação
      prisma.globalForumPost.count({
        where: { moderationActions: { some: {} } },
      }),
      // Posts excluídos
      prisma.globalForumPost.count({
        where: { isDeleted: true },
      }),
    ])

    const dto: ModerationStatsDTO = {
      newsCount,
      suspiciousPosts,
      moderatedPosts,
      deletedPosts,
      updatedAt: new Date().toISOString(),
    }

    return ok(dto)
  } catch {
    return errors.server()
  }
}
