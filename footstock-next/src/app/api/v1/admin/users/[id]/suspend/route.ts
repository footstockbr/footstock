import { NextRequest } from 'next/server'
import { getAuthUser, hasAdminRole, serializeUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

// POST /api/v1/admin/users/:id/suspend — ADMIN+
export async function POST(
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

    // TODO: Implementar via /auto-flow execute
    // Revogar sessões Supabase Auth do usuário
    // Marcar userType com flag de suspensão
    await prisma.adminMarketAction.create({
      data: {
        adminId: auth.user.id,
        action: 'SUSPEND_USER',
        details: { userId: id },
      },
    })

    return ok(serializeUser(user))
  } catch {
    return errors.server()
  }
}
