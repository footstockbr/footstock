import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole, serializeUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

const AddBalanceSchema = z.object({
  amount: z.number().positive('Valor deve ser positivo'),
})

// POST /api/v1/admin/users/:id/add-balance — ADMIN+
export async function POST(
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
    const parsed = AddBalanceSchema.safeParse(body)
    if (!parsed.success) return errors.validation('Valor invalido. Informe um numero positivo.')

    const { amount } = parsed.data

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return errors.notFound('Usuario nao encontrado.')

    const updated = await prisma.user.update({
      where: { id },
      data: { fsBalance: { increment: amount } },
    })

    await prisma.adminMarketAction.create({
      data: {
        adminId: auth.user.id,
        action: 'ADD_BALANCE',
        details: { userId: id, amount, previousBalance: Number(user.fsBalance ?? 0) },
      },
    })

    return ok(serializeUser(updated))
  } catch {
    return errors.server()
  }
}
