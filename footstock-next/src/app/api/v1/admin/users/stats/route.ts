import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { AdminRole, User } from '@/types'

export interface UserStatsDTO {
  totalUsers: number
  newUsersToday: number
  activeSubscriptions: number
  planDistribution: Array<{ plan: string; count: number; pct: number }>
  inactiveByPeriod: { d7: number; d15: number; d30: number }
  ordersToday: number
}

// GET /api/v1/admin/users/stats — MONITOR+
export async function GET(request: NextRequest) {
  let auth = await getAuthUser()

  if (!auth && process.env.NODE_ENV === 'development') {
    const adminRole = request.cookies.get('fs-admin-role')?.value
    if (adminRole) {
      const dummyUser = {
        id: 'dev-user', email: 'dev@foot-stock.test', name: 'Dev User',
        adminRole: adminRole as AdminRole,
      } as unknown as User
      auth = { user: dummyUser, supabaseId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'MONITOR')) return errors.forbidden()

  const now = new Date()
  const sub24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const sub7d  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000)
  const sub15d = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)
  const sub30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  try {
    const [
      totalUsers,
      newUsersToday,
      activeSubscriptions,
      ordersToday,
      planDistRaw,
      activeIn7d,
      activeIn15d,
      activeIn30d,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: sub24h } } }),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.order.count({ where: { createdAt: { gte: sub24h }, status: 'FILLED' } }),
      prisma.user.groupBy({ by: ['planType'], _count: { id: true } }),
      prisma.order.findMany({
        where: { createdAt: { gte: sub7d } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.order.findMany({
        where: { createdAt: { gte: sub15d } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.order.findMany({
        where: { createdAt: { gte: sub30d } },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ])

    const planOrder = ['JOGADOR', 'CRAQUE', 'LENDA']
    const planDistribution = planOrder.map((plan) => {
      const row = planDistRaw.find((r) => r.planType === plan)
      const count = row?._count.id ?? 0
      const pct = totalUsers > 0 ? Math.round((count / totalUsers) * 1000) / 10 : 0
      return { plan, count, pct }
    })

    const dto: UserStatsDTO = {
      totalUsers,
      newUsersToday,
      activeSubscriptions,
      planDistribution,
      inactiveByPeriod: {
        d7:  Math.max(0, totalUsers - new Set(activeIn7d.map((r) => r.userId)).size),
        d15: Math.max(0, totalUsers - new Set(activeIn15d.map((r) => r.userId)).size),
        d30: Math.max(0, totalUsers - new Set(activeIn30d.map((r) => r.userId)).size),
      },
      ordersToday,
    }

    return ok(dto)
  } catch {
    return errors.server()
  }
}
