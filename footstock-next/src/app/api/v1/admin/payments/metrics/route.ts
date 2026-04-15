import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { User, AdminRole } from '@/types'

// GET /api/v1/admin/payments/metrics
// Retorna participação real de cada gateway baseado em pagamentos
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
      auth = { user: dummyUser, supabaseId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) {
    return errors.forbidden()
  }

  try {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // Agrupa pagamentos por gateway no mês atual
    const paymentsByGateway = await prisma.payment.groupBy({
      by: ['gateway'],
      where: {
        status: 'PAID',
        createdAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
      _count: { id: true },
    })

    const totalAmount = paymentsByGateway.reduce((sum, p) => sum + (p._sum.amount ?? 0), 0)

    // Calcula participação percentual por gateway
    const metrics = paymentsByGateway.map((p) => ({
      gateway: p.gateway,
      revenue: p._sum.amount ?? 0,
      count: p._count.id,
      percentage: totalAmount > 0 ? parseFloat(((((p._sum.amount ?? 0) / totalAmount) * 100).toFixed(2))) : 0,
    }))

    return ok({
      totalRevenue: totalAmount,
      gateways: metrics,
    })
  } catch {
    return errors.server()
  }
}
