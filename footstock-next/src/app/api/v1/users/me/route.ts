import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser, serializeUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { deleteAccount } from '@/lib/services/account-deletion'
import { leagueAutoEnrollService } from '@/lib/services/LeagueAutoEnrollService'
import type { PlanType } from '@/types'

const UpdateUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().max(20).optional(),
  investorProfile: z.enum(['CONSERVADOR', 'MODERADO', 'ARROJADO', 'ESPECULADOR', 'INICIANTE', 'INTERMEDIARIO', 'AVANCADO', 'FA']).optional(),
  tourCompleted: z.boolean().optional(),
}).strict()

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
      const fieldErrors = parsed.error.flatten().fieldErrors
      return NextResponse.json(
        { error: { code: 'VAL_001', message: 'Dados inválidos. Verifique os campos e tente novamente.', fieldErrors } },
        { status: 422 }
      )
    }

    const updated = await prisma.user.update({
      where: { id: auth.user.id },
      data: parsed.data,
    })

    // Auto-enroll na liga pública da divisão ao concluir o onboarding.
    // Operação best-effort — não bloqueia a resposta em caso de falha.
    if (parsed.data.tourCompleted === true) {
      leagueAutoEnrollService
        .enrollUserInPublicLeague(auth.user.id, (updated.planType ?? 'JOGADOR') as PlanType)
        .catch((err) =>
          console.error('[users/me PATCH] Falha no auto-enroll de liga:', err)
        )
    }

    return ok(serializeUser(updated))
  } catch {
    return errors.server()
  }
}

// DELETE /api/v1/users/me — LGPD Art. 18: direito ao esquecimento
export async function DELETE(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    // Verificar assinatura ativa antes de excluir
    const activeSub = await prisma.subscription.findFirst({
      where: { userId: auth.user.id },
      orderBy: { createdAt: 'desc' },
    })
    if (activeSub && activeSub.status !== 'CANCELLED' && activeSub.status !== 'EXPIRED') {
      return NextResponse.json(
        { success: false, error: { code: 'USER_090', message: 'Cancele sua assinatura antes de excluir a conta.' } },
        { status: 409 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const reason: string = body.reason ?? 'NOT_SPECIFIED'

    const result = await deleteAccount(auth.user.id, reason)

    return ok({ message: result.message, anonymizedAt: result.anonymizedAt })
  } catch {
    return errors.server()
  }
}
