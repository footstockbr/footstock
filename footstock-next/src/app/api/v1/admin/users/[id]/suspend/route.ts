import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole, serializeUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

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

  if (!hasAdminRole(auth.user.adminRole, 'ADMIN')) {
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

    const updated = await prisma.user.update({
      where: { id },
      data: {
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

  if (!hasAdminRole(auth.user.adminRole, 'ADMIN')) {
    return errors.forbidden()
  }

  const { id } = await params

  try {
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return errors.notFound('Usuário não encontrado.')

    const updated = await prisma.user.update({
      where: { id },
      data: {
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

    return ok({ ...serializeUser(updated), status: 'active', suspendedAt: null })
  } catch {
    return errors.server()
  }
}
