import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole, serializeUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

// amount pode ser negativo (débito/penalidade) mas precisa ser finito e limitado
// para evitar Infinity/NaN e fat-finger. Cap de magnitude: 100M FS$.
const MAX_ADJUST = 100_000_000
const AdjustBalanceSchema = z.object({
  amount: z
    .number()
    .finite('Valor inválido.')
    .refine((v) => Math.abs(v) <= MAX_ADJUST, `Valor excede o limite de ${MAX_ADJUST} FS$.`),
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

    const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } })
    if (!exists) return errors.notFound('Usuário não encontrado.')

    // Transação atômica: lê o saldo fresco, valida invariante (nunca negativo) e
    // aplica ajuste + auditoria juntos (ou nenhum). Lança NEGATIVE_BALANCE se o
    // débito exceder o saldo, revertendo tudo.
    let updated
    try {
      updated = await prisma.$transaction(async (tx) => {
        const current = await tx.user.findUniqueOrThrow({
          where: { id },
          select: { fsBalance: true },
        })
        if (Number(current.fsBalance) + amount < 0) {
          throw new Error('NEGATIVE_BALANCE')
        }
        const u = await tx.user.update({
          where: { id },
          data: { fsBalance: { increment: amount } },
        })
        await tx.adminMarketAction.create({
          data: {
            adminId: auth.user.id,
            action: 'ADJUST_BALANCE',
            details: { userId: id, amount, reason },
          },
        })
        return u
      })
    } catch (txErr) {
      if (txErr instanceof Error && txErr.message === 'NEGATIVE_BALANCE') {
        return errors.validation('Ajuste resultaria em saldo negativo. Operação cancelada.')
      }
      throw txErr
    }

    return ok(serializeUser(updated))
  } catch {
    return errors.server()
  }
}
