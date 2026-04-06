import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole, serializeUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

const AdjustBalanceSchema = z.object({
  amount: z.number(),
  reason: z.string().min(5).max(255),
})

// PATCH /api/v1/admin/users/:id/balance — ADMIN+
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) {
    return errors.forbidden()
  }

  const { id } = await params

  try {
    const body = await request.json()
    const parsed = AdjustBalanceSchema.safeParse(body)
    if (!parsed.success) return errors.validation()

    const { amount, reason } = parsed.data

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return errors.notFound('Usuário não encontrado.')

    // TODO: Implementar via /auto-flow execute
    // Usar transação atômica para ajustar saldo + registrar em admin_market_actions
    const updated = await prisma.user.update({
      where: { id },
      data: { fsBalance: { increment: amount } },
    })

    await prisma.adminMarketAction.create({
      data: {
        adminId: auth.user.id,
        action: 'ADJUST_BALANCE',
        details: { userId: id, amount, reason },
      },
    })

    return ok(serializeUser(updated))
  } catch {
    return errors.server()
  }
}
