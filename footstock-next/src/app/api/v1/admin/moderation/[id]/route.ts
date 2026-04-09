import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { recordModerationAction } from '@/lib/moderation'
import type { User, AdminRole } from '@/types'

// Aprovar post (remover flag)
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params
  let auth = await getAuthUser()

  // Dev mode fallback
  if (!auth && process.env.NODE_ENV === 'development') {
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

  const action = request.nextUrl.searchParams.get('action') || 'approve'

  try {
    if (action === 'approve') {
      await prisma.globalForumPost.update({
        where: { id: params.id },
        data: { isFlagged: false, flagCount: 0 },
      })

      // Record in history
      await recordModerationAction(params.id, auth.user.id, 'APPROVED')

      return ok({ message: 'Post aprovado', postId: params.id })
    } else if (action === 'remove') {
      await prisma.globalForumPost.update({
        where: { id: params.id },
        data: { isDeleted: true },
      })

      // Record in history
      await recordModerationAction(params.id, auth.user.id, 'REMOVED')

      return ok({ message: 'Post removido', postId: params.id })
    }

    return errors.validation('Ação inválida')
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'MODERATION-001', message: 'Post não encontrado' } },
        { status: 404 }
      )
    }
    console.error('[moderation] Error:', error)
    return errors.server()
  }
}
