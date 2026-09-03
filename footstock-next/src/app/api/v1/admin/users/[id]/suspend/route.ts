import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole, serializeUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { USER_STATUS } from '@/lib/enums'

const SuspendSchema = z.object({
  reason: z.string().min(5, 'Razão deve ter pelo menos 5 caracteres').max(500, 'Máximo 500 caracteres'),
})

// PATCH /api/v1/admin/users/:id/suspend — ADMIN+
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
    const parsed = SuspendSchema.safeParse(body)
    if (!parsed.success) return errors.validation()

    const { reason } = parsed.data

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return errors.notFound('Usuário não encontrado.')

    if (user.id === auth.user.id) {
      return errors.forbidden('Não é possível suspender a própria conta.')
    }

    if (user.status === USER_STATUS.BANNED) {
      return errors.forbidden('Conta banida. Use o fluxo de ban/unban.')
    }

    // 2026-09-03: ate aqui esta rota gravava SO `suspendedAt`/`suspensionReason`
    // e respondia `status: 'suspended'`. Nenhum desses dois campos era lido por
    // nada que controlasse acesso, entao a suspensao administrativa era inerte:
    // o usuario seguia operando e a API afirmava o contrario. O enum `status` e
    // que e o gate (ver src/lib/auth/account-status.ts); os outros dois campos
    // ficam como metadado da sancao -- quando e por que.
    const updated = await prisma.user.update({
      where: { id },
      data: {
        status: USER_STATUS.SUSPENDED,
        suspendedAt: new Date(),
        suspensionReason: reason,
      },
    })

    await prisma.adminMarketAction.create({
      data: {
        adminId: auth.user.id,
        action: 'SUSPEND_USER',
        details: {
          targetUserId: id,
          reason,
          targetEmail: user.email,
        },
      },
    })

    return ok({
      ...serializeUser(updated),
      status: 'suspended',
      suspendedAt: updated.suspendedAt?.toISOString(),
      suspensionReason: updated.suspensionReason,
    })
  } catch {
    return errors.server()
  }
}

// DELETE /api/v1/admin/users/:id/suspend → remoção de suspensão (unsuspend) — ADMIN+
export async function DELETE(
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

    if (user.status === USER_STATUS.BANNED) {
      return errors.forbidden('Conta banida. Use o fluxo de ban/unban.')
    }

    // Levantar a sancao administrativa NAO pode, sozinho, reativar quem tambem
    // esta em lapso de cobranca: sao duas causas independentes para o mesmo
    // estado. O cron de expiracao suspende UMA vez, na transicao
    // (src/lib/jobs/subscription-expiry.ts) -- se devolvessemos ACTIVE aqui, ele
    // nunca mais suspenderia e o usuario ficaria com acesso pago vitalicio.
    const lapso = await prisma.subscription.findFirst({
      where: { userId: id, status: { in: ['EXPIRED', 'SUSPENDED'] } },
      select: { id: true },
    })

    const updated = await prisma.user.update({
      where: { id },
      data: {
        status: lapso ? USER_STATUS.SUSPENDED : USER_STATUS.ACTIVE,
        suspendedAt: null,
        suspensionReason: null,
      },
    })

    await prisma.adminMarketAction.create({
      data: {
        adminId: auth.user.id,
        action: 'UNSUSPEND_USER',
        details: { targetUserId: id, targetEmail: user.email },
      },
    })

    // Zero Silencio: se a conta continua suspensa por cobranca, o admin precisa
    // ver isso na resposta em vez de acreditar que reativou o usuario.
    return ok({
      ...serializeUser(updated),
      status: updated.status === USER_STATUS.ACTIVE ? 'active' : 'suspended',
      suspendedAt: null,
      ...(lapso
        ? { note: 'Sancao administrativa removida, mas a conta segue suspensa por assinatura expirada.' }
        : {}),
    })
  } catch {
    return errors.server()
  }
}
