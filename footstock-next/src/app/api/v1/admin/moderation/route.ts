import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { fetchBlockedWords, checkContentAgainstWords, recordModerationAction } from '@/lib/moderation'
import type { User, AdminRole } from '@/types'

export async function GET(request: NextRequest) {
  let auth = await getAuthUser()

  // Dev mode fallback
  if (!auth && process.env.NODE_ENV === 'development') {
    const adminRole = request.cookies.get('fs-admin-role')?.value
    const validRoles = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MODERADOR', 'EDITOR', 'MONITOR', 'CLUB_PARTNER']
    if (adminRole && validRoles.includes(adminRole)) {
      const dummyUser: User = {
        id: 'dev-user',
        email: 'dev@foot-stock.test',
        name: 'Dev User',
        phone: null,
        birthDate: '',
        favoriteClub: '',
        favoriteClubDisplayName: null,
        userType: 'NORMAL',
        investorProfile: 'INICIANTE',
        planType: 'JOGADOR',
        fsBalance: 0,
        marginBlocked: 0,
        tourCompleted: false,
        ageVerificationPending: false,
        adminRole: adminRole as AdminRole,
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, userId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'MODERADOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Permissão insuficiente para esta ação administrativa.' } },
      { status: 403 }
    )
  }

  const filter = request.nextUrl.searchParams.get('filter') || 'flagged'

  try {
    let where: Record<string, unknown> = {}

    // Suporte a filtro por status (novo) e isFlagged (legado)
    if (filter === 'flagged') {
      where = { status: 'FLAGGED', isDeleted: false }
    } else if (filter === 'approved') {
      where = { status: 'APPROVED', isDeleted: false }
    } else if (filter === 'rejected') {
      where = { status: 'REJECTED', isDeleted: false }
    } else if (filter === 'ok') {
      where = { status: { in: ['PUBLISHED', 'APPROVED'] }, isDeleted: false }
    } else if (filter === 'removed') {
      where = { isDeleted: true }
    } else if (filter === 'todos') {
      where = { isDeleted: false }
    }

    const posts = await prisma.globalForumPost.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            planType: true,
          },
        },
        moderationActions: {
          include: {
            moderator: {
              select: {
                name: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: filter === 'removed' ? { updatedAt: 'desc' } : { flagCount: 'desc' },
      take: 50,
    })

    // Auto-detect blocked words (skip for removed filter — all posts are already deleted)
    if (filter !== 'removed') {
      const [blockedWordsList, superAdmin] = await Promise.all([
        fetchBlockedWords(),
        prisma.user.findFirst({ where: { adminRole: 'SUPER_ADMIN' }, select: { id: true } }),
      ])

      for (const post of posts) {
        if (!post.isDeleted && !post.isFlagged) {
          const hasBlockedWords = checkContentAgainstWords(post.content, blockedWordsList)
          if (hasBlockedWords) {
            await prisma.globalForumPost.update({
              where: { id: post.id },
              data: { isFlagged: true, flagCount: 1 },
            })

            if (superAdmin) {
              await recordModerationAction(post.id, superAdmin.id, 'FLAGGED', 'Auto-detected blocked words')
            }

            post.isFlagged = true
            post.flagCount = 1
          }
        }
      }
    }

    const postsWithBadge = posts.map((post) => ({
      ...post,
      badge: post.isFlagged ? 'SUSPEITO' : post.isDeleted ? 'REMOVIDO' : 'APROVADO',
    }))

    return ok(postsWithBadge)
  } catch (error) {
    console.error('[moderation] Error:', error)
    return errors.server()
  }
}
