import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { recordModerationAction } from '@/lib/moderation'
import type { User, AdminRole } from '@/types'

function getDevAuthFromCookie(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') return null
  const adminRole = request.cookies.get('fs-admin-role')?.value
  if (!adminRole) return null
  const validRoles = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MODERADOR', 'EDITOR', 'MONITOR', 'CLUB_PARTNER']
  if (!validRoles.includes(adminRole)) return null
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
  return { user: dummyUser, supabaseId: 'dev-user' }
}

// POST bulk moderation actions (approve / remove)
export async function POST(request: NextRequest) {
  let auth = await getAuthUser()
  if (!auth) auth = getDevAuthFromCookie(request)

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

    if (postIds.length > 100) {
      return errors.validation('Máximo de 100 posts por operação')
    }

    if (!postIds.every((id: unknown) => typeof id === 'string')) {
      return errors.validation('postIds deve conter apenas strings')
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

    const updated = await prisma.globalForumPost.updateMany({
      where: { id: { in: postIds } },
      data: updateData,
    })

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

// DELETE bulk permanent delete — apenas ADMINISTRADOR/SUPER_ADMIN
export async function DELETE(request: NextRequest) {
  let auth = await getAuthUser()
  if (!auth) auth = getDevAuthFromCookie(request)

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Apenas ADMINISTRADOR ou SUPER_ADMIN podem deletar permanentemente.' } },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const { postIds } = body

    if (!Array.isArray(postIds) || postIds.length === 0) {
      return errors.validation('postIds deve ser um array não-vazio')
    }

    if (postIds.length > 100) {
      return errors.validation('Máximo de 100 posts por operação')
    }

    if (!postIds.every((id: unknown) => typeof id === 'string')) {
      return errors.validation('postIds deve conter apenas strings')
    }

    // Only allow permanent delete of already soft-deleted posts
    const postsToDelete = await prisma.globalForumPost.findMany({
      where: { id: { in: postIds }, isDeleted: true },
      select: { id: true, userId: true, content: true },
    })

    if (postsToDelete.length === 0) {
      return NextResponse.json(
        { error: { code: 'MODERATION-003', message: 'Nenhum post removido encontrado para deletar.' } },
        { status: 400 }
      )
    }

    const idsToDelete = postsToDelete.map(p => p.id)

    // Hard delete — cascade handles likes and moderation actions
    const deleted = await prisma.globalForumPost.deleteMany({
      where: { id: { in: idsToDelete } },
    })

    // Log audit server-side (cascade destroys ModerationAction FK rows)
    for (const post of postsToDelete) {
      console.log(
        `[moderation] PERMANENTLY_DELETED postId=${post.id} userId=${post.userId} by=${auth.user.id} content="${post.content.substring(0, 80)}"`
      )
    }

    return ok({
      message: `${deleted.count} posts deletados permanentemente`,
      count: deleted.count,
    })
  } catch (error) {
    console.error('[moderation] Error bulk permanent delete:', error)
    return errors.server()
  }
}
