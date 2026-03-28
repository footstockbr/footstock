import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

// GET /api/v1/users/me/data — Exportar dados pessoais (LGPD)
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    // TODO: Implementar via /auto-flow execute
    // Registrar acesso em data_access_logs
    await prisma.dataAccessLog.create({
      data: {
        userId: auth.user.id,
        accessedBy: auth.user.id,
        action: 'DATA_EXPORT_REQUEST',
        details: { format: 'json' },
      },
    })

    const [user, orders, positions, transactions, consents] = await Promise.all([
      prisma.user.findUnique({ where: { id: auth.user.id } }),
      prisma.order.findMany({ where: { userId: auth.user.id } }),
      prisma.position.findMany({ where: { userId: auth.user.id } }),
      prisma.transaction.findMany({ where: { userId: auth.user.id } }),
      prisma.consent.findMany({ where: { userId: auth.user.id } }),
    ])

    return ok({
      profile: user,
      orders,
      positions,
      transactions,
      consents,
      exportedAt: new Date().toISOString(),
    })
  } catch {
    return errors.server()
  }
}
