import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth/server'
import { prisma } from '@/lib/prisma'

const PLAN_HIERARCHY = { JOGADOR: 0, CRAQUE: 1, LENDA: 2 }
type PlanType = keyof typeof PLAN_HIERARCHY

/** POST /api/v1/admin/users/[id]/promote-plan */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (!['SUPER_ADMIN', 'ADMINISTRADOR'].includes(auth.user.adminRole ?? '')) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const { newPlan }: { newPlan: PlanType } = await request.json()
  if (!newPlan || !Object.prototype.hasOwnProperty.call(PLAN_HIERARCHY, newPlan)) {
    return NextResponse.json({ error: 'newPlan inválido. Use: JOGADOR, CRAQUE ou LENDA' }, { status: 400 })
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

    if (user.userType === 'ADMIN' || user.userType === 'CLUB_PARTNER') {
      return NextResponse.json(
        { error: 'CANNOT_PROMOTE_STAFF_PLAN', message: 'Contas administrativas/institucionais nao possuem plano de player.' },
        { status: 400 },
      )
    }

    const currentPlan = user.planType as PlanType | null
    if (PLAN_HIERARCHY[newPlan] <= PLAN_HIERARCHY[currentPlan ?? 'JOGADOR']) {
      return NextResponse.json({ error: 'Downgrade não permitido. Apenas promoção.' }, { status: 400 })
    }

    const now       = new Date()
    const expiresAt = new Date(now)
    expiresAt.setFullYear(expiresAt.getFullYear() + 1)

    // Transação: cancela subs não-terminais anteriores + cria ACTIVE manual + atualiza user
    const updated = await prisma.$transaction(async (tx) => {
      // Encerra subs anteriores (upgrade manual)
      await tx.subscription.updateMany({
        where: {
          userId: id,
          status: { in: ['ACTIVE', 'TRIAL', 'TRIALING', 'PENDING', 'PAST_DUE', 'CANCELLATION_LOCK'] },
        },
        data: { status: 'CANCELLED', cancelledAt: now },
      })

      // Cria subscription manual ACTIVE com gateway especial para rastreabilidade
      const sub = await tx.subscription.create({
        data: {
          userId:    id,
          planType:  newPlan,
          gateway:   'MERCADO_PAGO', // fallback — schema não tem MANUAL; registrar no details
          period:    'YEARLY',
          amount:    0,
          status:    'ACTIVE',
          startsAt:  now,
          expiresAt,
        },
      })

      const updatedUser = await tx.user.update({
        where: { id },
        data: { planType: newPlan },
      })

      // Audit trail via adminMarketAction (modelo existente, sem depender de auditLog)
      await tx.adminMarketAction.create({
        data: {
          adminId: auth.user.id,
          action:  'PROMOTE_PLAN',
          reason:  'ADMIN_MANUAL_PLAN_PROMOTION',
          details: {
            targetUserId:   id,
            subscriptionId: sub.id,
            from:           currentPlan ?? 'JOGADOR',
            to:             newPlan,
            expiresAt:      expiresAt.toISOString(),
          },
        },
      })

      return updatedUser
    })

    return NextResponse.json({ success: true, user: { id: updated.id, planType: newPlan } })
  } catch (err) {
    console.error('[PromotePlan]', err)
    return NextResponse.json({ error: 'Erro ao promover plano' }, { status: 500 })
  }
}
