// ============================================================================
// /api/v1/admin/auth-metrics — NXAUTH-08A
// ----------------------------------------------------------------------------
// Lista contadores de chamadas residuais a Supabase Auth na janela 24h
// (default) e cumulativo all-time. Usado para validar instrumentação e
// destravar o sunset gate de NXAUTH-09 (≥7d zero traffic via window=168).
//
// Acesso: ADMIN (qualquer adminRole).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'

import { errors, ok } from '@/lib/api'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { getLegacyAuthMetrics } from '@/lib/observability/legacy-auth-counter'
import type { AdminRole, User } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
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
        ageVerificationPending: false,
        adminRole: adminRole as AdminRole,
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, supabaseId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'MONITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Permissão insuficiente para esta ação administrativa.' } },
      { status: 403 },
    )
  }

  const url = new URL(request.url)
  const windowParam = url.searchParams.get('window')
  const windowHours = windowParam ? Math.max(1, parseInt(windowParam, 10) || 24) : 24

  const metrics = await getLegacyAuthMetrics(windowHours)
  return ok(metrics)
}
