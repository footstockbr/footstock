// POST /api/v1/sponsored-leagues/:id/join — usuario entra em liga patrocinada

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasPlan } from '@/lib/auth'
import { error as apiError, errors } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { requireActiveSubscription } from '@/lib/middleware/requireActiveSubscription'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  // Inscrição em ligas patrocinadas bloqueada em CANCELLATION_LOCK
  const lockGuard = await requireActiveSubscription(auth.user.id, 'JOIN_LEAGUE')
  if (lockGuard) return lockGuard

  const { id } = await params

  try {
    // Transacao serializable para evitar race condition no maxParticipants
    const result = await prisma.$transaction(async (tx) => {
      const league = await tx.sponsoredLeague.findUnique({
        where: { id },
        include: { _count: { select: { members: true } } },
      })

      if (!league) {
        return { error: 'SPONSORED-001', message: 'Liga patrocinada nao encontrada', status: 404 }
      }

      if (league.status !== 'ATIVA') {
        return { error: 'SPONSORED-002', message: 'Esta liga nao esta ativa para inscricao', status: 422 }
      }

      // Validar periodo
      const now = new Date()
      if (now > league.endDate) {
        return { error: 'SPONSORED-005', message: 'Periodo de inscricao encerrado', status: 422 }
      }
      if (now < league.startDate) {
        return { error: 'SPONSORED-009', message: 'Inscricoes ainda nao abriram', status: 422 }
      }

      // Validar plano minimo
      if (!hasPlan(auth.user.planType, league.minPlan as 'JOGADOR' | 'CRAQUE' | 'LENDA')) {
        const planLabels: Record<string, string> = { JOGADOR: 'Jogador', CRAQUE: 'Craque', LENDA: 'Lenda' }
        return {
          error: 'SPONSORED-003',
          message: `Plano minimo requerido: ${planLabels[league.minPlan] || league.minPlan}`,
          status: 403,
        }
      }

      // Validar capacidade (dentro da transacao para evitar race condition)
      if (league._count.members >= league.maxParticipants) {
        return { error: 'SPONSORED-004', message: 'Liga cheia. Nao ha mais vagas disponiveis.', status: 422 }
      }

      // Verificar se ja esta inscrito
      const existing = await tx.sponsoredLeagueMember.findUnique({
        where: {
          sponsoredLeagueId_userId: { sponsoredLeagueId: id, userId: auth.user.id },
        },
      })
      if (existing) {
        return { error: 'SPONSORED-006', message: 'Voce ja esta inscrito nesta liga', status: 409 }
      }

      // Inscrever dentro da transacao
      await tx.sponsoredLeagueMember.create({
        data: {
          sponsoredLeagueId: id,
          userId: auth.user.id,
        },
      })

      return { success: true }
    }, {
      isolationLevel: 'Serializable',
    })

    if ('error' in result) {
      return apiError(result.error as string, result.message as string, result.status as number)
    }

    return NextResponse.json({ data: { success: true, leagueId: id } }, { status: 201 })
  } catch (err) {
    // Retry em caso de serialization failure (Postgres code 40001)
    if ((err as { code?: string }).code === '40001') {
      return apiError('SPONSORED-010', 'Muitas inscricoes simultaneas, tente novamente', 503)
    }
    console.error('[sponsored-leagues/:id/join] Error:', err)
    return errors.server()
  }
}
