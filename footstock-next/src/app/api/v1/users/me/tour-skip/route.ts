import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

/**
 * PATCH /api/v1/users/me/tour-skip
 * Marca o tour como pulado: tourCompleted=true + tourSkippedAt=now().
 * Sem corpo obrigatório.
 */
export async function PATCH() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const updated = await prisma.user.update({
      where: { id: auth.user.id },
      data: { tourCompleted: true, tourSkippedAt: new Date() },
      select: { id: true, tourCompleted: true, tourSkippedAt: true },
    })
    return ok(updated)
  } catch {
    return errors.server()
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
