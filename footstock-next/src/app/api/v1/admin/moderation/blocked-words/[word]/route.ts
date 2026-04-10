import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { User, AdminRole } from '@/types'

export async function DELETE(request: NextRequest, context: { params: Promise<{ word: string }> }) {
  const params = await context.params
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
    const decodedWord = decodeURIComponent(params.word).toLowerCase().trim()

    const deleted = await prisma.blockedWord.delete({
      where: { word: decodedWord },
    })

    return ok({ message: 'Palavra removida da lista bloqueada', word: deleted.word })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'MODERATION-003', message: 'Palavra não encontrada' } },
        { status: 404 }
      )
    }
    console.error('[moderation] Error:', error)
    return errors.server()
  }
}
