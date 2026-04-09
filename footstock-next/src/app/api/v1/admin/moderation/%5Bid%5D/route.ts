import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { User, AdminRole } from '@/types'

interface PostParams {
  params: {
    id: string
  }
}

// Aprovar post (remover flag)
export async function POST(request: NextRequest, { params }: PostParams) {
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
        userType: 'INVESTIDOR',
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
      return ok({ message: 'Post aprovado', postId: params.id })
    } else if (action === 'remove') {
      await prisma.globalForumPost.update({
        where: { id: params.id },
        data: { isDeleted: true },
      })
      return ok({ message: 'Post removido', postId: params.id })
    }

    return errors.badRequest('Ação inválida')
  } catch (error: any) {
    if (error.code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'MODERATION-001', message: 'Post não encontrado' } },
        { status: 404 }
      )
    }
    console.error('[moderation] Error:', error)
    return errors.server()
  }
}
