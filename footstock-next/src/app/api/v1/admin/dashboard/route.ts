import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

// GET /api/v1/admin/dashboard — todos os roles admin
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'MONITOR')) {
    return errors.forbidden('Acesso restrito ao painel administrativo.')
  }

  try {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // TODO: Implementar via /auto-flow execute
    // Incluir: MRR real via subscriptions, motorStatus via Redis ping
    const [dau, wau, mau, ordersToday] = await Promise.all([
      prisma.user.count({ where: { updatedAt: { gte: startOfDay } } }),
      prisma.user.count({ where: { updatedAt: { gte: startOfWeek } } }),
      prisma.user.count({ where: { updatedAt: { gte: startOfMonth } } }),
      prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
    ])

    return ok({
      dau,
      wau,
      mau,
      ordersToday,
      mrr: 0, // TODO: calcular via subscriptions ACTIVE
      motorStatus: 'OFFLINE' as 'ONLINE' | 'OFFLINE' | 'READONLY',
    })
  } catch {
    return errors.server()
  }
}
