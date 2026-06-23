import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { AdminRole, User } from '@/types'

export interface FinancialStatsDTO {
  totalRevenue: number
  mrr: number
  inadimplencia: {
    failedCount: number
    failedAmount: number
    rate: number
  }
  revenueByPlan: Array<{ plan: string; revenue: number; pct: number }>
  revenueByGateway: Array<{ gateway: string; revenue: number; pct: number }>
  subscribersByPlan: Array<{ plan: string; count: number; pct: number }>
}

// GET /api/v1/admin/financial/stats — ADMINISTRADOR+
export async function GET(request: NextRequest) {
  let auth = await getAuthUser()

  if (!auth && process.env.NODE_ENV === 'development') {
    const adminRole = request.cookies.get('fs-admin-role')?.value
    if (adminRole) {
      const dummyUser = {
        id: 'dev-user', email: 'dev@foot-stock.test', name: 'Dev User',
        adminRole: adminRole as AdminRole,
      } as unknown as User
      auth = { user: dummyUser, userId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) return errors.forbidden()

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  try {
    const [
      totalRevenueRaw,
      activeSubsByPlan,
      totalActiveSubs,
      failedPaymentsRaw,
      paidThisMonthCount,
      paidPaymentsThisMonth,
    ] = await Promise.all([
      prisma.payment.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),
      prisma.subscription.groupBy({
        by: ['planType'],
        where: { status: 'ACTIVE' },
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.payment.aggregate({
        where: { status: 'FAILED', createdAt: { gte: startOfMonth } },
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.payment.count({
        where: { status: 'PAID', createdAt: { gte: startOfMonth } },
      }),
      prisma.payment.findMany({
        where: { status: 'PAID', createdAt: { gte: startOfMonth } },
        select: {
          amount: true,
          gateway: true,
          subscription: { select: { planType: true } },
        },
      }),
    ])

    // MRR (FIX-12): soma de Subscription.amount (centavos) das assinaturas
    // ACTIVE — valor efetivamente cobrado, NUNCA preço hardcoded. Garante
    // MRR == Σ amount e alinhamento com o checkout Pix.
    const planOrder = ['JOGADOR', 'CRAQUE', 'LENDA']
    let mrrCents = 0
    for (const group of activeSubsByPlan) {
      mrrCents += group._sum.amount ?? 0
    }
    const mrr = mrrCents / 100

    // Assinantes por plano
    const subscribersByPlan = planOrder.map((plan) => {
      const row = activeSubsByPlan.find((r) => r.planType === plan)
      const count = row?._count.id ?? 0
      const pct = totalActiveSubs > 0 ? Math.round((count / totalActiveSubs) * 1000) / 10 : 0
      return { plan, count, pct }
    })

    // Receita por plano e por gateway (mês atual, centavos)
    const planRevMap: Record<string, number> = {}
    const gatewayRevMap: Record<string, number> = {}
    for (const p of paidPaymentsThisMonth) {
      const plan = p.subscription?.planType ?? 'UNKNOWN'
      planRevMap[plan] = (planRevMap[plan] ?? 0) + p.amount
      gatewayRevMap[p.gateway] = (gatewayRevMap[p.gateway] ?? 0) + p.amount
    }

    const totalMonthRevCentavos = Object.values(planRevMap).reduce((a, b) => a + b, 0)
    const revenueByPlan = planOrder.map((plan) => {
      const rev = planRevMap[plan] ?? 0
      const pct = totalMonthRevCentavos > 0 ? Math.round((rev / totalMonthRevCentavos) * 1000) / 10 : 0
      return { plan, revenue: parseFloat((rev / 100).toFixed(2)), pct }
    })

    const totalGatewayRevCentavos = Object.values(gatewayRevMap).reduce((a, b) => a + b, 0)
    const revenueByGateway = Object.entries(gatewayRevMap).map(([gateway, rev]) => ({
      gateway,
      revenue: parseFloat((rev / 100).toFixed(2)),
      pct: totalGatewayRevCentavos > 0 ? Math.round((rev / totalGatewayRevCentavos) * 1000) / 10 : 0,
    }))

    // Inadimplência
    const failedCount = failedPaymentsRaw._count.id ?? 0
    const failedAmountCentavos = failedPaymentsRaw._sum.amount ?? 0
    const totalAttempts = failedCount + paidThisMonthCount
    const inadimplenciaRate = totalAttempts > 0
      ? Math.round((failedCount / totalAttempts) * 1000) / 10
      : 0

    const dto: FinancialStatsDTO = {
      totalRevenue: parseFloat(((totalRevenueRaw._sum.amount ?? 0) / 100).toFixed(2)),
      mrr: parseFloat(mrr.toFixed(2)),
      inadimplencia: {
        failedCount,
        failedAmount: parseFloat((failedAmountCentavos / 100).toFixed(2)),
        rate: inadimplenciaRate,
      },
      revenueByPlan,
      revenueByGateway,
      subscribersByPlan,
    }

    return ok(dto)
  } catch {
    return errors.server()
  }
}
