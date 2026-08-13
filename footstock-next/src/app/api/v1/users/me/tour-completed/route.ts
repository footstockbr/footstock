import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { leagueAutoEnrollService } from '@/lib/services/LeagueAutoEnrollService'
import type { PlanType } from '@/types'

/**
 * PATCH /api/v1/users/me/tour-completed
 * Marca o tour como concluído e inscreve o usuário na liga pública da divisão.
 * Retorna o usuário atualizado + status da inscrição em liga.
 */
export async function PATCH() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const updated = await prisma.user.update({
      where: { id: auth.user.id },
      data: { tourCompleted: true, tourSkippedAt: null },
      select: { id: true, tourCompleted: true, planType: true },
    })

    const leagueEnrollment = await leagueAutoEnrollService.enrollUserInPublicLeague(
      auth.user.id,
      (updated.planType ?? 'JOGADOR') as PlanType,
    )

    return ok({
      ...updated,
      leagueEnrollment,
    })
  } catch {
    return errors.server()
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
