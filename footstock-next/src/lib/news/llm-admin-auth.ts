// ============================================================================
// FootStock — Gate SUPER_ADMIN das rotas de provider de LLM (G-IA)
// Fonte unica do guard usado por /api/v1/admin/news/llm-providers/**.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { errors } from '@/lib/api'
import type { User, AdminRole } from '@/types'

export type SuperAdminGate = { error: NextResponse } | { user: User }

/**
 * Resolve a sessao e exige SUPER_ADMIN.
 * Em `development` aceita o bypass por cookie `fs-admin-role` (mesma semantica
 * das demais rotas admin) — nunca em producao.
 */
export async function resolveSuperAdmin(request: NextRequest): Promise<SuperAdminGate> {
  let auth = await getAuthUser()

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
        adminRole: adminRole as AdminRole,
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, userId: 'dev-user' }
    }
  }

  if (!auth) return { error: errors.unauthorized() }

  if (!hasAdminRole(auth.user.adminRole, 'SUPER_ADMIN' as AdminRole)) {
    return {
      error: NextResponse.json(
        {
          error: {
            code: 'ADMIN-050',
            message: 'Permissão insuficiente. Apenas SUPER_ADMIN pode acessar.',
          },
        },
        { status: 403 },
      ),
    }
  }

  return { user: auth.user }
}
