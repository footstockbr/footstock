import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole, serializeUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import { ok, errors } from '@/lib/api'

// Valores canônicos de saldo por plano (invariante — TASK-0/ST001 + T-019)
const PLAN_DEFAULT_BALANCE: Record<string, number> = {
  JOGADOR: 2000,
  CRAQUE: 5000,
  LENDA: 25000,
}

// Saldo operacional fixo para staff (ADMIN / CLUB_PARTNER) — nao escala por plano.
const STAFF_DEFAULT_BALANCE = 10000

// POST /api/v1/admin/users/:id/reset-balance — ADMIN+
// Restaura o saldo fictício do usuário ao valor padrão do plano.
// Cria BalanceResetLog para auditoria e notifica o usuário via Redis (T-019).
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

    const isStaff = user.userType === 'ADMIN' || user.userType === 'CLUB_PARTNER'
    const defaultBalance = isStaff
      ? STAFF_DEFAULT_BALANCE
      : PLAN_DEFAULT_BALANCE[user.planType ?? '']
    if (defaultBalance === undefined) {
      return errors.server('Plano do usuário inválido ou sem saldo padrão definido.')
    }

    const previousBalance = user.fsBalance.toNumber()

    // Atualizar saldo + registrar log + registrar AdminMarketAction de forma atômica
    const [updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { fsBalance: defaultBalance, marginBlocked: 0 },
      }),
      prisma.balanceResetLog.create({
        data: {
          userId: id,
          adminId: auth.user.id,
          previousBalance,
          newBalance: defaultBalance,
          planType: (user.planType ?? null) as import('@prisma/client').PlanType | null,
        },
      }),
      prisma.adminMarketAction.create({
        data: {
          adminId: auth.user.id,
          action: 'RESET_BALANCE',
          details: {
            targetUserId: id,
            targetEmail: user.email,
            planType: user.planType,
            previousBalance,
            newBalance: defaultBalance,
          },
        },
      }),
    ])

    // Notificar usuário via Redis (Zero Silencio — T-019)
    await redis.publish(`notifications:${id}`, JSON.stringify({
      type: 'BALANCE_RESET',
      message: `Seu saldo foi resetado para FS$ ${defaultBalance.toLocaleString('pt-BR')} pelo administrador.`,
      newBalance: defaultBalance,
      adminId: auth.user.id,
    })).catch(() => { /* silencioso — não falhar o reset por falha de notificação */ })

    return ok({
      ...serializeUser(updated),
      fsBalance: defaultBalance,
      marginBlocked: 0,
      resetLog: { previousBalance, newBalance: defaultBalance, planType: user.planType },
    })
  } catch {
    return errors.server()
  }
}
