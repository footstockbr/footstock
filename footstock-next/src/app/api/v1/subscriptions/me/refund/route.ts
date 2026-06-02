import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { isWithinCoolingOff } from '@/lib/services/plan-logic'
import type { PlanType } from '@/types'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'

// POST /api/v1/subscriptions/me/refund
// Reembolso CDC Art. 49: acao explicita, separada do cancelamento simples.
export async function POST() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const sub = await prisma.subscription.findFirst({
      where: {
        userId: auth.user.id,
        status: { in: ['ACTIVE', 'CANCELLATION_LOCK', 'PAST_DUE', 'TRIAL', 'TRIALING'] },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!sub) return errors.notFound('Nenhuma assinatura ativa encontrada.')

    const now = new Date()
    const eligibleForRefund = isWithinCoolingOff({
      planType: sub.planType as PlanType,
      startsAt: sub.startsAt,
      expiresAt: sub.expiresAt,
      status: sub.status,
      cancelledAt: sub.cancelledAt,
      cancellationLockExpiresAt: sub.cancellationLockExpiresAt,
    }, now)

    if (!eligibleForRefund) {
      return errors.validation('O prazo de 7 dias para solicitar reembolso integral ja expirou.')
    }

    const updatedSub = await prisma.$transaction(async (tx) => {
      const s = await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          refundRequested: true,
          previousPlanType: sub.planType as never,
          cancellationLockStartedAt: null,
          cancellationLockExpiresAt: null,
          forcedLiquidationAt: null,
          forcedLiquidationExecutedAt: null,
          bonusScheduledAt: null,
        },
      })

      await tx.user.update({
        where: { id: auth.user.id },
        data: { planType: 'JOGADOR', fsBalance: 2000 },
      })

      return s
    })

    const openShortCount = await prisma.position.count({
      where: { userId: auth.user.id, side: 'SHORT', status: 'OPEN' },
    }).catch(() => 0)

    mixpanelServer.trackSubscriptionCancelled(auth.user.id, {
      plan: sub.planType as PlanType,
      cancellation_reason: 'cooling_off_refund',
      within_trial: true,
      had_open_shorts: openShortCount > 0,
    })

    await prisma.notification.create({
      data: {
        userId: auth.user.id,
        type: 'PLAN_CANCEL_ALERT',
        title: 'Cancelamento e reembolso solicitados',
        body: 'Seu plano foi cancelado imediatamente e o reembolso sera processado em ate 7 dias uteis.',
        isRead: false,
      },
    }).catch((err) => {
      console.error('[subscriptions/me/refund POST] Erro ao criar notificacao:', err)
    })

    return ok({
      id: updatedSub.id,
      planType: updatedSub.planType,
      status: updatedSub.status,
      cancelledAt: updatedSub.cancelledAt?.toISOString() ?? null,
      refundRequested: updatedSub.refundRequested,
      isEligibleForRefund: true,
      cancellationMode: 'REFUND',
    })
  } catch (err) {
    console.error('[subscriptions/me/refund POST] Erro:', err)
    return errors.server()
  }
}
