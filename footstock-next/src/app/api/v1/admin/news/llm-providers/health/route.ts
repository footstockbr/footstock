// GET /api/v1/admin/news/llm-providers/health — SUPER_ADMIN only
// Snapshot sanitizado (sem token). Sem probe pago.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { ok, errors, error as apiError } from '@/lib/api'
import type { User, AdminRole } from '@/types'
import { listProvidersAndConfig, sanitizeErrorMessage, getErrorCode } from '@/lib/news/llm-providers-service'

async function resolveSuperAdmin(request: NextRequest) {
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
        { error: { code: 'ADMIN-050', message: 'Permissão insuficiente. Apenas SUPER_ADMIN pode acessar.' } },
        { status: 403 },
      ),
    }
  }

  return { user: auth.user }
}

export async function GET(request: NextRequest) {
  const auth = await resolveSuperAdmin(request)
  if ('error' in auth) return auth.error

  try {
    const data = await listProvidersAndConfig()
    return ok({ health: data.health, configVersion: data.config.configVersion })
  } catch (err) {
    return apiError(getErrorCode(err), sanitizeErrorMessage(err), 500)
  }
}
