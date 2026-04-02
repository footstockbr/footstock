import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole, serializeUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { AdminRole } from '@/types'

const PromoteSchema = z.object({
  adminRole: z
    .enum(['SUPER_ADMIN', 'ADMIN', 'MONITOR', 'EDITOR', 'MODERADOR'])
    .nullable(),
})

// PATCH /api/v1/admin/users/:id/promote — SUPER_ADMIN only
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  // Apenas SUPER_ADMIN pode promover/rebaixar roles
  if (!hasAdminRole(auth.user.adminRole, 'SUPER_ADMIN')) {
    return errors.forbidden('Apenas SuperAdmin pode promover ou rebaixar roles administrativos.')
  }

  const { id } = await params

  try {
    const body = await request.json()
    const parsed = PromoteSchema.safeParse(body)
    if (!parsed.success) return errors.validation()

    const { adminRole } = parsed.data

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return errors.notFound('Usuário não encontrado.')

    if (user.id === auth.user.id) {
      return errors.forbidden('Não é possível alterar o próprio role.')
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { adminRole: adminRole as AdminRole | null },
    })

    await prisma.adminMarketAction.create({
      data: {
        adminId: auth.user.id,
        action: adminRole ? 'PROMOTE_USER' : 'DEMOTE_USER',
        details: {
          targetUserId: id,
          targetEmail: user.email,
          previousRole: user.adminRole,
          newRole: adminRole,
        },
      },
    })

    return ok(serializeUser(updated))
  } catch {
    return errors.server()
  }
}
