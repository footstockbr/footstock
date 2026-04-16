import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole, serializeUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

const AdminUpdateUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  planType: z.enum(['JOGADOR', 'CRAQUE', 'LENDA']).optional(),
  adminRole: z.enum(['SUPER_ADMIN', 'ADMINISTRADOR', 'MONITOR', 'EDITOR', 'MODERADOR', 'CLUB_PARTNER']).nullable().optional(),
  userType: z.enum(['NORMAL', 'TIME_PARCEIRO', 'INFLUENCIADOR']).optional(),
})

// GET /api/v1/admin/users/:id — ADMIN+
export async function GET(
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
    await prisma.dataAccessLog.create({
      data: {
        userId: id,
        accessedBy: auth.user.id,
        dataType: 'admin_view',
        endpoint: '/api/v1/admin/users/' + id,
        reason: 'VIEW_SENSITIVE_FIELD',
      },
    })

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return errors.notFound('Usuário não encontrado.')

    return ok(serializeUser(user))
  } catch {
    return errors.server()
  }
}

// PATCH /api/v1/admin/users/:id — ADMIN+
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
    const parsed = AdminUpdateUserSchema.safeParse(body)

    if (!parsed.success) return errors.validation()

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return errors.notFound('Usuário não encontrado.')

    const updated = await prisma.user.update({
      where: { id },
      data: parsed.data,
    })

    return ok(serializeUser(updated))
  } catch {
    return errors.server()
  }
}

// DELETE /api/v1/admin/users/:id — ADMIN+ (soft delete)
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

    if (user.suspendedAt && user.suspensionReason === 'DELETED_BY_ADMIN') {
      return errors.conflict('USER_ALREADY_DELETED', 'Usuário já foi deletado.')
    }

    await prisma.user.update({
      where: { id },
      data: {
        suspendedAt: new Date(),
        suspensionReason: 'DELETED_BY_ADMIN',
      },
    })

    await prisma.adminMarketAction.create({
      data: {
        adminId: auth.user.id,
        action: 'DELETE_USER',
        details: { userId: id, userName: user.name },
      },
    })

    return ok({ deleted: true })
  } catch {
    return errors.server()
  }
}
