import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole, serializeUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

// Valores canônicos de saldo por plano (invariante — TASK-0/ST001)
const PLAN_DEFAULT_BALANCE: Record<string, number> = {
  JOGADOR: 2000,
  CRAQUE: 5000,
  LENDA: 25000,
}

// POST /api/v1/admin/users/:id/reset-balance — ADMIN+
// Restaura o saldo fictício do usuário ao valor padrão do plano
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) {
    return errors.forbidden()
  }

  const { id } = await params

  try {
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return errors.notFound('Usuário não encontrado.')

    const defaultBalance = PLAN_DEFAULT_BALANCE[user.planType]
    if (defaultBalance === undefined) {
      return errors.server()
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        fsBalance: defaultBalance,
        marginBlocked: 0,
      },
    })

    await prisma.adminMarketAction.create({
      data: {
        adminId: auth.user.id,
        action: 'RESET_BALANCE',
        details: {
          targetUserId: id,
          targetEmail: user.email,
          planType: user.planType,
          previousBalance: user.fsBalance.toNumber(),
          newBalance: defaultBalance,
        },
      },
    })

    return ok({
      ...serializeUser(updated),
      fsBalance: defaultBalance,
      marginBlocked: 0,
    })
  } catch {
    return errors.server()
  }
}
