import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { recordModerationAction } from '@/lib/moderation'
import type { User, AdminRole } from '@/types'

// POST bulk moderation actions
export async function POST(request: NextRequest) {
  let auth = await getAuthUser()

  // Dev mode fallback
  if (!auth) {
    const adminRole = request.cookies.get('fs-admin-role')?.value
    if (adminRole) {
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, supabaseId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'MODERADOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const { postIds, action } = body

    if (!Array.isArray(postIds) || postIds.length === 0) {
      return errors.validation('postIds deve ser um array não-vazio')
    }

    if (!['approve', 'remove'].includes(action)) {
      return errors.validation('action deve ser "approve" ou "remove"')
    }

    let updateData: Record<string, unknown> = {}
    let moderationAction: 'APPROVED' | 'REMOVED' = 'APPROVED'

    if (action === 'approve') {
      updateData = { isFlagged: false, flagCount: 0 }
      moderationAction = 'APPROVED'
    } else if (action === 'remove') {
      updateData = { isDeleted: true }
      moderationAction = 'REMOVED'
    }

    // Update all posts in bulk
    const updated = await prisma.globalForumPost.updateMany({
      where: { id: { in: postIds } },
      data: updateData,
    })

    // Record moderation actions
    for (const postId of postIds) {
      await recordModerationAction(postId, auth.user.id, moderationAction)
    }

    return ok({
      message: `${updated.count} posts ${action === 'approve' ? 'aprovados' : 'removidos'}`,
      count: updated.count,
    })
  } catch (error) {
    console.error('[moderation] Error:', error)
    return errors.server()
  }
}
