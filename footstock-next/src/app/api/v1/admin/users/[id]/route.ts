import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole, serializeUser } from '@/lib/auth'
import { ADMIN_ROLE_LEVELS } from '@/lib/utils/admin-roles'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { AdminRole } from '@/types'

function adminLevel(role: string | null | undefined): number {
  if (!role) return -1 // sem role admin fica abaixo de CLUB_PARTNER (0)
  return ADMIN_ROLE_LEVELS[role as AdminRole] ?? -1
}

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

    // ── Guard de hierarquia (anti privilege-escalation) ──────────────────────
    // Sem esta verificação, um ADMINISTRADOR poderia promover qualquer usuário a
    // SUPER_ADMIN (ou rebaixar/alterar um superior) via este PATCH genérico.
    const callerLevel = adminLevel(auth.user.adminRole)

    // Não pode modificar um usuário de nível igual/superior ao próprio (exceto a si mesmo).
    if (user.id !== auth.user.id && adminLevel(user.adminRole) >= callerLevel) {
      return errors.forbidden('Não é possível modificar um usuário de nível igual ou superior ao seu.')
    }

    // Não pode atribuir um adminRole de nível igual/superior ao próprio.
    if (parsed.data.adminRole != null) {
      if (adminLevel(parsed.data.adminRole) >= callerLevel) {
        return errors.forbidden('Não é possível atribuir um nível de acesso igual ou superior ao seu.')
      }
    }

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
