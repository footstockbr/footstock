import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { User, AdminRole } from '@/types'

// Preços por plano em BRL (canônicos — sincronizados com LLD)
const PLAN_PRICES: Record<string, number> = {
  JOGADOR: 0,
  CRAQUE: 19.9,
  LENDA: 39.9,
}

// GET /api/v1/admin/financial — ADMIN+
// Retorna: MRR, ARR, churn, novas assinaturas 24h, receita por gateway, histórico MRR 30d, distribuição por plano
export async function GET(request: NextRequest) {
  let auth = await getAuthUser()

  // Dev mode fallback: accept fs-admin-role cookie
  if (!auth && process.env.NODE_ENV === 'development') {
    const adminRole = request.cookies.get('fs-admin-role')?.value
    if (adminRole) {
      // Create dummy user for dev
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

  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) {
    return errors.forbidden()
  }

  try {
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)

    const startOf30DaysAgo = new Date(now)
    startOf30DaysAgo.setDate(startOf30DaysAgo.getDate() - 30)

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    // Assinaturas ativas por plano (para MRR)
    const activeSubsByPlan = await prisma.subscription.groupBy({
      by: ['planType'],
      where: { status: 'ACTIVE' },
      _count: { id: true },
    })

    // MRR calculado
    let mrr = 0
    const planDistribution: Record<string, number> = { JOGADOR: 0, CRAQUE: 0, LENDA: 0 }
    for (const group of activeSubsByPlan) {
      const price = PLAN_PRICES[group.planType] ?? 0
      mrr += price * group._count.id
      planDistribution[group.planType] = group._count.id
    }
    const arr = mrr * 12

    // Novas assinaturas últimas 24h
    const newSubscriptions24h = await prisma.subscription.count({
      where: { createdAt: { gte: startOfDay } },
    })

    // Churn rate (mês atual)
    const cancelledThisMonth = await prisma.subscription.count({
      where: {
        status: 'CANCELLED',
        cancelledAt: { gte: startOfMonth },
      },
    })
    const activeAtStartOfMonth = await prisma.subscription.count({
      where: {
        status: 'ACTIVE',
        createdAt: { lt: startOfMonth },
      },
    })
    const churnRate = activeAtStartOfMonth > 0
      ? parseFloat(((cancelledThisMonth / activeAtStartOfMonth) * 100).toFixed(2))
      : 0

    // Receita por gateway (pagamentos aprovados, mês atual)
    const revenueByGateway = await prisma.payment.groupBy({
      by: ['gateway'],
      where: {
        status: 'PAID',
        createdAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    })

    // Status de webhooks dos gateways (última atividade)
    const gatewayActivity = await prisma.payment.groupBy({
      by: ['gateway'],
      orderBy: { _max: { createdAt: 'desc' } },
      _max: { createdAt: true },
      _count: { id: true },
    })

    // Histórico MRR 30 dias (simplificado: pagamentos aprovados por dia)
    const paymentsLast30d = await prisma.payment.findMany({
      where: {
        status: 'PAID',
        createdAt: { gte: startOf30DaysAgo },
      },
      select: { amount: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    // Agrupar por dia
    const mrrHistory: { date: string; value: number }[] = []
    const dayMap: Record<string, number> = {}
    for (const p of paymentsLast30d) {
      const dateKey = p.createdAt.toISOString().split('T')[0]
      dayMap[dateKey] = (dayMap[dateKey] ?? 0) + p.amount
    }

    // Preencher todos os 30 dias
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().split('T')[0]
      mrrHistory.push({ date: key, value: dayMap[key] ?? 0 })
    }

    // Calcular cancelamento atual do mês anterior para comparação
    const cancelledPrevMonth = await prisma.subscription.count({
      where: {
        status: 'CANCELLED',
        cancelledAt: { gte: startOfPrevMonth, lt: startOfMonth },
      },
    })

    return ok({
      mrr: parseFloat(mrr.toFixed(2)),
      arr: parseFloat(arr.toFixed(2)),
      churnRate,
      newSubscriptions24h,
      cancelledThisMonth,
      cancelledPrevMonth,
      planDistribution,
      revenueByGateway: revenueByGateway.map((g) => ({
        gateway: g.gateway,
        revenue: g._sum.amount ?? 0,
      })),
      gatewayStatus: gatewayActivity.map((g) => ({
        gateway: g.gateway,
        lastActivity: g._max.createdAt?.toISOString() ?? null,
        transactionCount: g._count.id,
      })),
      mrrHistory,
    })
  } catch {
    return errors.server()
  }
}
