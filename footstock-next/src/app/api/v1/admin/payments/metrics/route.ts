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

    // Agrupa pagamentos por gateway e status no mês atual.
    // Receita liquida = PAID menos REFUNDED (estornos descontam o caixa real).
    const paymentsByGateway = await prisma.payment.groupBy({
      by: ['gateway', 'status'],
      where: {
        status: { in: ['PAID', 'REFUNDED'] },
        createdAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
      _count: { id: true },
    })

    // Consolida por gateway separando entradas (PAID) de estornos (REFUNDED).
    const byGateway = new Map<
      string,
      { paid: number; refunded: number; paidCount: number; refundCount: number }
    >()
    for (const row of paymentsByGateway) {
      const entry =
        byGateway.get(row.gateway) ?? { paid: 0, refunded: 0, paidCount: 0, refundCount: 0 }
      const amount = row._sum.amount ?? 0
      if (row.status === 'REFUNDED') {
        entry.refunded += amount
        entry.refundCount += row._count.id
      } else {
        entry.paid += amount
        entry.paidCount += row._count.id
      }
      byGateway.set(row.gateway, entry)
    }

    const gatewayRows = Array.from(byGateway.entries()).map(([gateway, e]) => ({
      gateway,
      revenue: e.paid - e.refunded, // receita liquida (PAID - REFUNDED)
      grossRevenue: e.paid,
      refunded: e.refunded,
      count: e.paidCount,
      refundCount: e.refundCount,
    }))

    // Receita liquida total: soma das receitas liquidas por gateway.
    const totalAmount = gatewayRows.reduce((sum, p) => sum + p.revenue, 0)

    // Calcula participação percentual por gateway sobre a receita liquida.
    const metrics = gatewayRows.map((p) => ({
      ...p,
      percentage: totalAmount > 0 ? parseFloat((((p.revenue / totalAmount) * 100).toFixed(2))) : 0,
    }))

    return ok({
      totalRevenue: totalAmount,
      gateways: metrics,
    })
  } catch {
    return errors.server()
  }
}
