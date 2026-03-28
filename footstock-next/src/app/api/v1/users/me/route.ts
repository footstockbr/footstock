import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, serializeUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors, accepted } from '@/lib/api'

const UpdateUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().max(20).optional(),
  favoriteClub: z.string().max(10).optional(),
  investorProfile: z.enum(['INICIANTE', 'INTERMEDIARIO', 'AVANCADO', 'FA_FUTEBOL']).optional(),
  tourCompleted: z.boolean().optional(),
})

// GET /api/v1/users/me
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  return ok(auth.user)
}

// PATCH /api/v1/users/me
export async function PATCH(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const body = await request.json()
    const parsed = UpdateUserSchema.safeParse(body)

    if (!parsed.success) {
      return errors.validation()
    }

    // TODO: Implementar via /auto-flow execute
    const updated = await prisma.user.update({
      where: { id: auth.user.id },
      data: parsed.data,
    })

    return ok(serializeUser(updated))
  } catch {
    return errors.server()
  }
}

// DELETE /api/v1/users/me — LGPD: solicitar exclusão
export async function DELETE() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    // TODO: Implementar via /auto-flow execute
    // Registrar em data_access_logs + marcar usuário para anonimização
    await prisma.dataAccessLog.create({
      data: {
        userId: auth.user.id,
        accessedBy: auth.user.id,
        action: 'DELETION_REQUEST',
        details: { requestedAt: new Date().toISOString() },
      },
    })

    return accepted(
      'Sua solicitação de exclusão foi registrada. Os dados serão removidos em até 15 dias.'
    )
  } catch {
    return errors.server()
  }
}
