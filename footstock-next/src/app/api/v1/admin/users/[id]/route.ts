import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole, serializeUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

const AdminUpdateUserSchema = z.object({
  planType: z.enum(['JOGADOR', 'CRAQUE', 'LENDA']).optional(),
  adminRole: z.enum(['SUPER_ADMIN', 'ADMINISTRADOR', 'MONITOR', 'EDITOR', 'MODERADOR', 'CLUB_PARTNER']).nullable().optional(),
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
