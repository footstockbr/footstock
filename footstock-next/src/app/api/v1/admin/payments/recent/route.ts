import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { User, AdminRole } from '@/types'

// GET /api/v1/admin/payments/recent?limit=50&offset=0&status=PAID&gateway=MERCADO_PAGO
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
        adminRole: adminRole as AdminRole,
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, userId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const limit  = Math.min(parseInt(searchParams.get('limit')  ?? '50', 10), 100)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)
  const status  = searchParams.get('status')  ?? undefined
  const gateway = searchParams.get('gateway') ?? undefined

  try {
    const where: Record<string, unknown> = {}
    if (status)  where['status']  = status
    if (gateway) where['gateway'] = gateway

    const [items, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          userId: true,
          subscriptionId: true,
          amount: true,
          gateway: true,
          gatewayTransactionId: true,
          status: true,
          processedAt: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
          subscription: { select: { planType: true, period: true } },
        },
      }),
      prisma.payment.count({ where }),
    ])

    return ok({
      items: items.map((p) => ({
        id: p.id,
        userId: p.userId,
        userName: p.user?.name ?? null,
        userEmail: p.user?.email ?? null,
        subscriptionId: p.subscriptionId,
        planType: p.subscription?.planType ?? null,
        period: p.subscription?.period ?? null,
        amount: p.amount,
        gateway: p.gateway,
        gatewayTransactionId: p.gatewayTransactionId,
        status: p.status,
        processedAt: p.processedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
    })
  } catch {
    return errors.server()
  }
}
