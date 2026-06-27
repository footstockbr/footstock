import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors, error as apiError } from '@/lib/api'
import {
  isWithinCoolingOff,
} from '@/lib/services/plan-logic'
import { subscriptionService, isAutoRenewalEligible } from '@/lib/services/SubscriptionService'
import type { SubscriptionStatus, PaymentGateway, PaymentPeriod, PlanType } from '@/types'
import type { Prisma } from '@prisma/client'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'

type CancellationMode = 'SCHEDULED' | 'REFUND' | null

function serializeSubscription(s: {
  id: string; userId: string; planType: string; gateway: string
  period: string; status: string; amount: number; startsAt: Date; expiresAt: Date
  cancelledAt: Date | null
  cancellationLockStartedAt: Date | null
  cancellationLockExpiresAt: Date | null
  bonusAmount: Prisma.Decimal | null
  bonusScheduledAt: Date | null
  bonusCreditedAt: Date | null
  refundRequested: boolean
  createdAt: Date; updatedAt: Date
}, now = new Date()) {
  const isEligibleForRefund = isWithinCoolingOff({
    planType: s.planType as PlanType,
    startsAt: s.startsAt,
    expiresAt: s.expiresAt,
    status: s.status,
    cancelledAt: s.cancelledAt,
    cancellationLockExpiresAt: s.cancellationLockExpiresAt,
  }, now)

  const cancellationMode: CancellationMode =
    s.status === 'CANCELLATION_LOCK'
      ? 'SCHEDULED'
      : s.status === 'CANCELLED' && s.refundRequested
        ? 'REFUND'
        : null

  const cancellationEffectiveAt =
    s.status === 'CANCELLATION_LOCK'
      ? s.cancellationLockExpiresAt ?? s.expiresAt
      : s.cancelledAt

  const lockMsRemaining = s.cancellationLockExpiresAt
    ? Math.max(0, s.cancellationLockExpiresAt.getTime() - now.getTime())
    : null

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
    // T-021: campos de bônus com carência
    bonusAmount: s.bonusAmount !== null ? Number(s.bonusAmount) : null,
    bonusScheduledAt: s.bonusScheduledAt?.toISOString() ?? null,
    bonusCreditedAt: s.bonusCreditedAt?.toISOString() ?? null,
    refundRequested: s.refundRequested,
    isEligibleForRefund,
    cancellationMode,
    cancellationEffectiveAt: cancellationEffectiveAt?.toISOString() ?? null,
    cancellationLock: s.status === 'CANCELLATION_LOCK' && s.cancellationLockExpiresAt
      ? {
          expiresAt: s.cancellationLockExpiresAt.toISOString(),
          hoursRemaining: Math.ceil((lockMsRemaining ?? 0) / 3_600_000),
        }
      : null,
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

    // Idempotente: se já cancelada ou em trava, retorna sucesso sem duplicar notificação.
    // pause_on_lock_start: se a pausa da renovação no gateway ficou pendente
    // (estado compensatório), reconcilia antes de declarar sucesso — sem isso um
    // retry curto-circuitaria aqui e nunca pausaria o gateway.
    if (sub.status === 'CANCELLED' || sub.status === 'EXPIRED' || sub.status === 'CANCELLATION_LOCK') {
      if (sub.status === 'CANCELLATION_LOCK' && isAutoRenewalEligible(sub) && sub.gatewayStatus !== 'paused') {
        try {
          await subscriptionService.syncGatewayAutoRenewal(sub, 'cancel')
        } catch (gwErr) {
          console.error('[subscriptions/me DELETE] retry cancelAutoRenewal falhou:', gwErr)
          return apiError(
            'PAYMENT_050',
            'Cancelamento agendado, mas a pausa da renovação no gateway falhou. Tente novamente em instantes.',
            502,
          )
        }
      }
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
    const eligibleForRefund = isWithinCoolingOff(subForLogic, now)

    // Determina se havia bônus pendente de cancelar
    const hasPendingBonus = sub.bonusScheduledAt !== null && sub.bonusCreditedAt === null
    const pendingBonusAmount = hasPendingBonus && sub.bonusAmount ? Number(sub.bonusAmount) : null

    // Cancelamento simples: agenda encerramento para o fim do período pago.
    // Reembolso CDC Art. 49 é opt-in explícito em /api/v1/subscriptions/me/refund.
    const lockStartedAt = now
    const lockExpiresAt = sub.expiresAt.getTime() > now.getTime() ? sub.expiresAt : now

    const updatedSub = await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: 'CANCELLATION_LOCK',
        cancelledAt: now,
        cancellationLockStartedAt: lockStartedAt,
        cancellationLockExpiresAt: lockExpiresAt,
        bonusScheduledAt: null, // T-021: CANCELLATION_LOCK cancela bônus pendente
      },
    })

    // pause_on_lock_start (G0.5): persistimos o estado local primeiro (acima) e
    // só então reconciliamos com o gateway, pausando a renovação automática no
    // INÍCIO do lock. No-op explícito para assinaturas não-recorrentes. Falha do
    // gateway NÃO retorna sucesso silencioso: marca compensatório e responde com
    // erro observável (estado local segue em CANCELLATION_LOCK, reprocessável).
    try {
      await subscriptionService.syncGatewayAutoRenewal(updatedSub, 'cancel')
    } catch (gwErr) {
      console.error('[subscriptions/me DELETE] cancelAutoRenewal falhou:', gwErr)
      return apiError(
        'PAYMENT_050',
        'Cancelamento agendado, mas a pausa da renovação no gateway falhou. Tente novamente em instantes.',
        502,
      )
    }

    // EVT-024: subscription_cancelled — track cancellation
    // Check if user had open short positions at cancellation time
    const openShortCount = await prisma.position.count({
      where: { userId: auth.user.id, side: 'SHORT', status: 'OPEN' },
    }).catch(() => 0) // non-blocking: default to 0 if position table doesn't exist yet

    mixpanelServer.trackSubscriptionCancelled(auth.user.id, {
      plan: sub.planType as PlanType,
      cancellation_reason: 'user_request',
      within_trial: eligibleForRefund,
      had_open_shorts: openShortCount > 0,
    })

    // Notificação urgente (non-blocking)
    await prisma.notification.create({
      data: {
        userId: auth.user.id,
        type: 'CANCELLATION_LOCK_ACTIVE',
        title: 'Cancelamento agendado',
        body: `Seu plano permanece ativo até ${lockExpiresAt.toLocaleDateString('pt-BR')}. A renovação foi cancelada e você pode reverter este processo até lá.`,
        isRead: false,
      },
    }).catch((err) => {
      console.error('[subscriptions/me DELETE] Erro ao criar notificação de cancelamento:', err)
    })

    // T-021: cancelamento de renovação também remove bônus pendente de ativação.
    if (hasPendingBonus && pendingBonusAmount) {
      await prisma.notification.create({
        data: {
          userId: auth.user.id,
          type: 'BONUS_CANCELLED',
          title: 'Bônus não será creditado',
          body: `Você cancelou a renovação do plano. O bônus de FS$ ${pendingBonusAmount.toLocaleString('pt-BR')} não será creditado.`,
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
