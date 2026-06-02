import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import {
  isWithinCoolingOff,
  getCancellationLockExpiry,
  getForcedLiquidationAt,
} from '@/lib/services/plan-logic'
import type { SubscriptionStatus, PaymentGateway, PaymentPeriod, PlanType } from '@/types'
import type { Prisma } from '@prisma/client'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'

function serializeSubscription(s: {
  id: string; userId: string; planType: string; gateway: string
  period: string; status: string; amount: number; startsAt: Date; expiresAt: Date
  cancelledAt: Date | null
  cancellationLockStartedAt: Date | null
  cancellationLockExpiresAt: Date | null
  forcedLiquidationAt: Date | null
  forcedLiquidationExecutedAt: Date | null
  bonusAmount: Prisma.Decimal | null
  bonusScheduledAt: Date | null
  bonusCreditedAt: Date | null
  createdAt: Date; updatedAt: Date
}) {
  return {
    id: s.id,
    userId: s.userId,
    planType: s.planType as PlanType,
    gateway: s.gateway as PaymentGateway,
    period: s.period as PaymentPeriod,
    status: s.status as SubscriptionStatus,
    startsAt: s.startsAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    cancelledAt: s.cancelledAt?.toISOString() ?? null,
    cancellationLockStartedAt: s.cancellationLockStartedAt?.toISOString() ?? null,
    cancellationLockExpiresAt: s.cancellationLockExpiresAt?.toISOString() ?? null,
    forcedLiquidationAt: s.forcedLiquidationAt?.toISOString() ?? null,
    forcedLiquidationExecutedAt: s.forcedLiquidationExecutedAt?.toISOString() ?? null,
    // T-021: campos de bônus com carência
    bonusAmount: s.bonusAmount !== null ? Number(s.bonusAmount) : null,
    bonusScheduledAt: s.bonusScheduledAt?.toISOString() ?? null,
    bonusCreditedAt: s.bonusCreditedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

// GET /api/v1/subscriptions/me
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    // Prioriza sub ACTIVE/CANCELLATION_LOCK sobre PENDING.
    // Sem isso, se o usuário tiver ACTIVE e iniciar upgrade (PENDING criado),
    // GET retornaria a PENDING mais recente e DELETE poderia cancelá-la indevidamente.
    // PENDING ainda é retornado quando não há ACTIVE (polling de PlanRevalidateOnSuccess).
    const activeFirst = await prisma.subscription.findFirst({
      where: {
        userId: auth.user.id,
        status: { in: ['ACTIVE', 'CANCELLATION_LOCK', 'PAST_DUE', 'TRIAL', 'TRIALING'] },
      },
      orderBy: { createdAt: 'desc' },
    })
    const sub = activeFirst ?? await prisma.subscription.findFirst({
      where: { userId: auth.user.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    })

    if (!sub) {
      return errors.notFound('Nenhuma assinatura ativa encontrada.')
    }

    return ok(serializeSubscription(sub))
  } catch {
    return errors.server()
  }
}

// DELETE /api/v1/subscriptions/me — cancelar assinatura
export async function DELETE() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    // DELETE só opera sobre assinatura ativa — nunca sobre PENDING (upgrade em andamento)
    const sub = await prisma.subscription.findFirst({
      where: {
        userId: auth.user.id,
        status: { in: ['ACTIVE', 'CANCELLATION_LOCK', 'PAST_DUE', 'TRIAL', 'TRIALING'] },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!sub) return errors.notFound('Nenhuma assinatura ativa encontrada.')

    // Idempotente: se já cancelada ou em trava, retorna sucesso sem duplicar notificação
    if (sub.status === 'CANCELLED' || sub.status === 'EXPIRED' || sub.status === 'CANCELLATION_LOCK') {
      return ok(serializeSubscription(sub))
    }

    const now = new Date()
    const subForLogic = {
      planType: sub.planType as PlanType,
      startsAt: sub.startsAt,
      expiresAt: sub.expiresAt,
      status: sub.status,
      cancelledAt: sub.cancelledAt,
    }
    const coolingOff = isWithinCoolingOff(subForLogic, now)

    // Determina se havia bônus pendente de cancelar
    const hasPendingBonus = sub.bonusScheduledAt !== null && sub.bonusCreditedAt === null
    const pendingBonusAmount = hasPendingBonus && sub.bonusAmount ? Number(sub.bonusAmount) : null

    let updatedSub: typeof sub

    if (coolingOff) {
      // Dentro do período de arrependimento (CDC Art. 49): cancelamento imediato + downgrade
      updatedSub = await prisma.$transaction(async (tx) => {
        const s = await tx.subscription.update({
          where: { id: sub.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
            bonusScheduledAt: null, // T-021: cancela bônus pendente dentro da carência
          },
        })
        await tx.user.update({
          where: { id: auth.user.id },
          data: { planType: 'JOGADOR', fsBalance: 2000 },
        })
        return s
      })
    } else {
      // Fora do período de arrependimento: trava de 7d com liquidação forçada em T+48h
      const lockStartedAt = now
      const lockExpiresAt = getCancellationLockExpiry(lockStartedAt)
      const forcedLiqAt = getForcedLiquidationAt(lockStartedAt)

      updatedSub = await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'CANCELLATION_LOCK',
          cancelledAt: now,
          cancellationLockStartedAt: lockStartedAt,
          cancellationLockExpiresAt: lockExpiresAt,      // T+7d: cancelamento final
          forcedLiquidationAt: forcedLiqAt,              // T+48h: liquidação de posições restritas
          forcedLiquidationExecutedAt: null,             // reset explícito para idempotência do cron
          bonusScheduledAt: null, // T-021: CANCELLATION_LOCK cancela bônus pendente
        },
      })
    }

    // EVT-024: subscription_cancelled — track cancellation
    // Check if user had open short positions at cancellation time
    const openShortCount = await prisma.position.count({
      where: { userId: auth.user.id, side: 'SHORT', status: 'OPEN' },
    }).catch(() => 0) // non-blocking: default to 0 if position table doesn't exist yet

    mixpanelServer.trackSubscriptionCancelled(auth.user.id, {
      plan: sub.planType as PlanType,
      cancellation_reason: coolingOff ? 'cooling_off_period' : 'user_request',
      within_trial: coolingOff,
      had_open_shorts: openShortCount > 0,
    })

    // Notificação urgente (non-blocking)
    await prisma.notification.create({
      data: {
        userId: auth.user.id,
        type: coolingOff ? 'PLAN_CANCEL_ALERT' : 'CANCELLATION_LOCK_ACTIVE',
        title: coolingOff ? 'Cancelamento e reembolso confirmados' : 'Cancelamento iniciado — trava ativa',
        body: coolingOff
          ? 'Seu plano foi cancelado. O reembolso será processado em até 7 dias úteis.'
          : 'Cancelamento iniciado. Suas posições restritas serão encerradas em 48h e a conta finalizada em 7 dias. Você pode reverter este processo a qualquer momento até lá.',
        isRead: false,
      },
    }).catch((err) => {
      console.error('[subscriptions/me DELETE] Erro ao criar notificação de cancelamento:', err)
    })

    // T-021: notificar perda do bônus pendente quando cancelar dentro da carência
    if (hasPendingBonus && pendingBonusAmount) {
      await prisma.notification.create({
        data: {
          userId: auth.user.id,
          type: 'BONUS_CANCELLED',
          title: 'Bônus não será creditado',
          body: `Você cancelou dentro do período de carência. O bônus de FS$ ${pendingBonusAmount.toLocaleString('pt-BR')} não será creditado.`,
          isRead: false,
        },
      }).catch((err) => {
        console.error('[subscriptions/me DELETE] Erro ao criar notificação BONUS_CANCELLED:', err)
      })
    }

    return ok(serializeSubscription(updatedSub))
  } catch {
    return errors.server()
  }
}
