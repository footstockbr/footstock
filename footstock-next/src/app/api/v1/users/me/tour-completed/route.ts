import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

/**
 * PATCH /api/v1/users/me/tour-completed
 * Marca o tour como concluído. Sem corpo obrigatório.
 */
export async function PATCH() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const updated = await prisma.user.update({
      where: { id: auth.user.id },
      data: { tourCompleted: true, tourSkippedAt: null },
      select: { id: true, tourCompleted: true },
    })
    return ok(updated)
  } catch {
    return errors.server()
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
