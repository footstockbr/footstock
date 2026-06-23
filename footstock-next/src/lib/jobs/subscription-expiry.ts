// ============================================================================
// FootStock — Job: subscription-expiry
// Cron diário (02:00 UTC): suspensão + downgrade automático para Jogador
// G-01: reminder proativo de renovação 7 dias antes do vencimento
// Idempotente: skip silencioso se já EXPIRED/JOGADOR
// ============================================================================

import { prisma } from '@/lib/prisma'
import { notificationService } from '@/lib/notifications'
import {
  shouldSuspendAccount,
  shouldDowngradeToJogador,
  type SubscriptionForLogic,
} from '@/lib/services/plan-logic'
import { PLAN_HIERARCHY, type PlanType } from '@/lib/enums'

// FIX-25 — period (YYYY-MM) do ciclo de cobrança, usado no occurrence_marker das
// notificações assinatura_* (uma chave de idempotência distinta por ciclo).
function billingPeriod(expiresAt: Date | null): string {
  return (expiresAt ?? new Date()).toISOString().slice(0, 7)
}

export interface ProcessResult {
  processed: number
  errors: number
  details: Array<{ subscriptionId: string; action: string; error?: string }>
}

const OPEN_SUBSCRIPTION_STATUSES = [
  'ACTIVE',
  'TRIAL',
  'TRIALING',
  'PAST_DUE',
  'CANCELLATION_LOCK',
] as const

function plansAtOrAbove(planType: PlanType): PlanType[] {
  return (['JOGADOR', 'CRAQUE', 'LENDA'] as PlanType[]).filter(
    (plan) => PLAN_HIERARCHY[plan] >= PLAN_HIERARCHY[planType]
  )
}

async function hasOpenSubscriptionAtOrAbove(
  userId: string,
  excludedSubscriptionId: string,
  planType: PlanType
): Promise<boolean> {
  const replacement = await prisma.subscription.findFirst({
    where: {
      userId,
      id: { not: excludedSubscriptionId },
      status: { in: OPEN_SUBSCRIPTION_STATUSES as unknown as never[] },
      planType: { in: plansAtOrAbove(planType) as never[] },
    },
    select: { id: true },
  })
  return replacement !== null
}

/** Processa subscriptions expiradas: suspende contas ou faz downgrade definitivo */
export async function processExpiredSubscriptions(): Promise<ProcessResult> {
  const now = new Date()
  const result: ProcessResult = { processed: 0, errors: 0, details: [] }

  // Buscar subscriptions ativas com expiresAt no passado
  const expired = await prisma.subscription.findMany({
    where: {
      expiresAt: { lt: now },
      status: 'ACTIVE',
      cancelledAt: null,
    },
    select: { id: true, userId: true, planType: true, expiresAt: true, startsAt: true, status: true, cancellationLockExpiresAt: true, cancelledAt: true },
  })

  for (const sub of expired) {
    try {
      const subForLogic: SubscriptionForLogic = {
        planType: sub.planType as PlanType,
        startsAt: sub.startsAt,
        expiresAt: sub.expiresAt!,
        status: sub.status,
        cancelledAt: sub.cancelledAt,
        cancellationLockExpiresAt: sub.cancellationLockExpiresAt,
      }

      if (shouldSuspendAccount(subForLogic, now)) {
        const planType = sub.planType as PlanType
        if (await hasOpenSubscriptionAtOrAbove(sub.userId, sub.id, planType)) {
          await prisma.subscription.updateMany({
            where: { id: sub.id, status: 'ACTIVE', expiresAt: { lt: now } },
            data: { status: 'EXPIRED' },
          })
          result.details.push({ subscriptionId: sub.id, action: 'EXPIRED_STALE_REPLACED' })
          result.processed++
          continue
        }

        const suspended = await prisma.$transaction(async (tx) => {
          const claim = await tx.subscription.updateMany({
            where: {
              id: sub.id,
              status: 'ACTIVE',
              cancelledAt: null,
              expiresAt: { lt: now },
            },
            data: { status: 'EXPIRED' },
          })
          if (claim.count !== 1) return false

          const userUpdate = await tx.user.updateMany({
            where: { id: sub.userId, planType: sub.planType as never },
            data: { status: 'SUSPENDED' },
          })
          return userUpdate.count === 1
        })

        if (!suspended) {
          result.details.push({ subscriptionId: sub.id, action: 'SKIPPED_STATUS_OR_PLAN_CHANGED' })
          continue
        }

        await notificationService.notify({
          type:     'assinatura_expirada',
          userId:   sub.userId,
          entityId: `${sub.id}:expired`,
          period:   billingPeriod(sub.expiresAt),
          payload: {
            planType:  sub.planType,
            expiresAt: sub.expiresAt!.toISOString(),
            reason:    'expired',
          },
        })
        result.details.push({ subscriptionId: sub.id, action: 'SUSPENDED' })
        result.processed++
      }
    } catch (err) {
      console.error(`[subscription-expiry] Erro em ${sub.id}:`, err)
      result.errors++
      result.details.push({ subscriptionId: sub.id, action: 'ERROR', error: String(err) })
    }
  }

  // Buscar suspensas há mais de 7 dias → downgrade definitivo
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const toDowngrade = await prisma.subscription.findMany({
    where: {
      status: { in: ['EXPIRED', 'SUSPENDED'] as never[] },
      expiresAt: { lt: sevenDaysAgo },
    },
    select: { id: true, userId: true, planType: true, expiresAt: true, startsAt: true, status: true, cancellationLockExpiresAt: true, cancelledAt: true },
  })

  for (const sub of toDowngrade) {
    try {
      const subForLogic: SubscriptionForLogic = {
        planType: sub.planType as PlanType,
        startsAt: sub.startsAt,
        expiresAt: sub.expiresAt!,
        status: sub.status,
        cancelledAt: sub.cancelledAt,
        cancellationLockExpiresAt: sub.cancellationLockExpiresAt,
      }

      if (!shouldDowngradeToJogador(subForLogic, now)) continue

      const planType = sub.planType as PlanType
      if (await hasOpenSubscriptionAtOrAbove(sub.userId, sub.id, planType)) {
        await prisma.subscription.updateMany({
          where: {
            id: sub.id,
            status: { in: ['EXPIRED', 'SUSPENDED'] as never[] },
            expiresAt: { lt: sevenDaysAgo },
          },
          data: { status: 'CANCELLED' },
        })
        result.details.push({ subscriptionId: sub.id, action: 'CANCELLED_STALE_REPLACED' })
        result.processed++
        continue
      }

      const downgraded = await prisma.$transaction(async (tx) => {
        const claim = await tx.subscription.updateMany({
          where: {
            id: sub.id,
            status: { in: ['EXPIRED', 'SUSPENDED'] as never[] },
            expiresAt: { lt: sevenDaysAgo },
          },
          data: { status: 'CANCELLED' },
        })
        if (claim.count !== 1) return false

        const userUpdate = await tx.user.updateMany({
          where: { id: sub.userId, planType: sub.planType as never },
          data: { planType: 'JOGADOR', fsBalance: 2000, status: 'ACTIVE' },
        })
        return userUpdate.count === 1
      })

      if (!downgraded) {
        result.details.push({ subscriptionId: sub.id, action: 'SKIPPED_STATUS_OR_PLAN_CHANGED' })
        continue
      }

      await notificationService.notify({
        type:     'assinatura_expirada',
        userId:   sub.userId,
        entityId: `${sub.id}:downgraded`,
        period:   billingPeriod(sub.expiresAt),
        payload: {
          planType: sub.planType,
          reason:   'downgraded',
        },
      })
      result.details.push({ subscriptionId: sub.id, action: 'DOWNGRADED_TO_JOGADOR' })
      result.processed++
    } catch (err) {
      console.error(`[subscription-expiry] Erro em downgrade ${sub.id}:`, err)
      result.errors++
      result.details.push({ subscriptionId: sub.id, action: 'ERROR', error: String(err) })
    }
  }

  return result
}

/**
 * G-01: Envia reminder de renovação para subscriptions que vencem em até 7 dias.
 * Idempotente: renewalReminderSentAt IS NULL garante envio único por ciclo.
 */
export async function processRenewalReminders(): Promise<ProcessResult> {
  const now = new Date()
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const result: ProcessResult = { processed: 0, errors: 0, details: [] }

  const upcoming = await prisma.subscription.findMany({
    where: {
      status:                 'ACTIVE',
      expiresAt:              { lte: sevenDaysFromNow, gt: now },
      renewalReminderSentAt:  null, // só candidatos ainda não lembrados
    },
    select: { id: true, userId: true, planType: true, expiresAt: true },
  })

  for (const sub of upcoming) {
    try {
      const daysUntilExpiry = Math.ceil(
        (sub.expiresAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      )

      // Claim atômico: só notifica quem efetivamente marcou renewalReminderSentAt agora.
      // updateMany com renewalReminderSentAt:null no WHERE garante idempotência forte sob
      // concorrência (duas execuções simultâneas não enviam lembrete em duplicidade) — o
      // filtro no findMany sozinho não basta. Trade-off: se a notificação falhar após o
      // claim, o lembrete (não-crítico) é perdido sem retry.
      // Repetir TODOS os predicados do findMany no claim: entre a leitura e o claim a
      // assinatura pode ter sido cancelada, renovada ou expirada — sem revalidar, enviaríamos
      // um lembrete stale (ex.: para quem acabou de renovar). status/janela/null juntos.
      const claim = await prisma.subscription.updateMany({
        where: {
          id:                    sub.id,
          status:                'ACTIVE',
          expiresAt:             { lte: sevenDaysFromNow, gt: now },
          renewalReminderSentAt: null,
        },
        data:  { renewalReminderSentAt: now },
      })
      if (claim.count !== 1) continue // outro processo reivindicou OU estado mudou — não notificar

      await notificationService.notify({
        type:     'assinatura_expirando',
        userId:   sub.userId,
        entityId: `${sub.id}:renewal`,
        period:   billingPeriod(sub.expiresAt),
        payload: {
          planType:          sub.planType,
          expiresAt:         sub.expiresAt!.toISOString(),
          daysUntilExpiry,
          isRenewalReminder: true,
        },
      })

      result.details.push({ subscriptionId: sub.id, action: `RENEWAL_REMINDER_D-${daysUntilExpiry}` })
      result.processed++
    } catch (err) {
      console.error(`[subscription-expiry] Erro em reminder ${sub.id}:`, err)
      result.errors++
      result.details.push({ subscriptionId: sub.id, action: 'ERROR', error: String(err) })
    }
  }

  return result
}

/** Processa subscriptions canceladas na data de expiração */
export async function processCancelledSubscriptions(): Promise<ProcessResult> {
  const now = new Date()
  const result: ProcessResult = { processed: 0, errors: 0, details: [] }

  const cancelled = await prisma.subscription.findMany({
    where: {
      cancelledAt: { not: null },
      expiresAt: { lt: now },
      status: { notIn: ['CANCELLED', 'CANCELLATION_LOCK'] as never[] },
    },
    select: { id: true, userId: true, planType: true, expiresAt: true },
  })

  for (const sub of cancelled) {
    try {
      const planType = sub.planType as PlanType
      if (await hasOpenSubscriptionAtOrAbove(sub.userId, sub.id, planType)) {
        await prisma.subscription.updateMany({
          where: { id: sub.id, status: { notIn: ['CANCELLED', 'CANCELLATION_LOCK'] as never[] } },
          data: { status: 'CANCELLED' },
        })
        result.details.push({ subscriptionId: sub.id, action: 'CANCELLED_STALE_REPLACED' })
        result.processed++
        continue
      }

      const finalized = await prisma.$transaction(async (tx) => {
        const claim = await tx.subscription.updateMany({
          where: { id: sub.id, status: { notIn: ['CANCELLED', 'CANCELLATION_LOCK'] as never[] } },
          data: { status: 'CANCELLED' },
        })
        if (claim.count !== 1) return false

        const userUpdate = await tx.user.updateMany({
          where: { id: sub.userId, planType: sub.planType as never },
          data: { planType: 'JOGADOR', fsBalance: 2000 },
        })
        return userUpdate.count === 1
      })

      if (!finalized) {
        result.details.push({ subscriptionId: sub.id, action: 'SKIPPED_STATUS_OR_PLAN_CHANGED' })
        continue
      }

      result.details.push({ subscriptionId: sub.id, action: 'CANCELLED_FINALIZED' })
      result.processed++
    } catch (err) {
      result.errors++
      result.details.push({ subscriptionId: sub.id, action: 'ERROR', error: String(err) })
    }
  }

  return result
}
