import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { User, AdminRole } from '@/types'

// GET /api/v1/admin/subscriptions/metrics
// Retorna churn rate real por plano e outras métricas
export async function GET(request: NextRequest) {
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
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, userId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) {
    return errors.forbidden()
  }

  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // Métricas por plano
    const activeByPlan = await prisma.subscription.groupBy({
      by: ['planType'],
      where: {
        status: 'ACTIVE',
        user: { adminRole: null },
      },
      _count: { id: true },
    })

    const cancelledThisMonthByPlan = await prisma.subscription.groupBy({
      by: ['planType'],
      where: {
        status: 'CANCELLED',
        cancelledAt: { gte: startOfMonth },
        user: { adminRole: null },
      },
      _count: { id: true },
    })

    const activeAtStartOfMonthByPlan = await prisma.subscription.groupBy({
      by: ['planType'],
      where: {
        status: 'ACTIVE',
        createdAt: { lt: startOfMonth },
        user: { adminRole: null },
      },
      _count: { id: true },
    })

    // Calcula churn rate por plano
    const churnByPlan: Record<string, number> = {}
    for (const plan of ['CRAQUE', 'LENDA']) {
      const cancelled = cancelledThisMonthByPlan.find(r => r.planType === plan)?._count.id ?? 0
      const active = activeAtStartOfMonthByPlan.find(r => r.planType === plan)?._count.id ?? 0
      churnByPlan[plan] = active > 0 ? parseFloat(((cancelled / active) * 100).toFixed(2)) : 0
    }

    return ok({
      byPlan: {
        CRAQUE: {
          active: activeByPlan.find(r => r.planType === 'CRAQUE')?._count.id ?? 0,
          churnRate: churnByPlan['CRAQUE'],
        },
        LENDA: {
          active: activeByPlan.find(r => r.planType === 'LENDA')?._count.id ?? 0,
          churnRate: churnByPlan['LENDA'],
        },
      },
    })
  } catch {
    return errors.server()
  }
}
