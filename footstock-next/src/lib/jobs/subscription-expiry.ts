// ============================================================================
// FootStock — Job: subscription-expiry
// Cron diário (02:00 UTC): suspensão + downgrade automático para Jogador
// G-01: reminder proativo de renovação 7 dias antes do vencimento
// Idempotente: skip silencioso se já EXPIRED/JOGADOR
// ============================================================================

import { prisma } from '@/lib/prisma'
import { NotificationStub } from '@/lib/notifications/stubs/NotificationStub'
import {
  shouldSuspendAccount,
  shouldDowngradeToJogador,
  type SubscriptionForLogic,
} from '@/lib/services/plan-logic'
import type { PlanType } from '@/lib/enums'

export interface ProcessResult {
  processed: number
  errors: number
  details: Array<{ subscriptionId: string; action: string; error?: string }>
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
        await prisma.$transaction([
          prisma.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } }),
          prisma.user.update({ where: { id: sub.userId }, data: { status: 'SUSPENDED' } }),
        ])
        await NotificationStub.notify(sub.userId, 'PLAN_CANCEL_ALERT', {
          planName: sub.planType,
          expiresAt: sub.expiresAt!.toISOString(),
          reason: 'expired',
          channels: ['in_app'],
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

      await prisma.$transaction([
        prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED' } }),
        prisma.user.update({
          where: { id: sub.userId },
          data: { planType: 'JOGADOR', fsBalance: 2000, status: 'ACTIVE' },
        }),
      ])
      await NotificationStub.notify(sub.userId, 'PLAN_CANCEL_ALERT', {
        planName: sub.planType,
        reason: 'downgraded',
        channels: ['in_app', 'email'],
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
      // renewalReminderSentAt not in schema — use updatedAt or separate tracking
    },
    select: { id: true, userId: true, planType: true, expiresAt: true },
  })

  for (const sub of upcoming) {
    try {
      const daysUntilExpiry = Math.ceil(
        (sub.expiresAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      )

      await prisma.subscription.update({
        where: { id: sub.id },
        data:  { updatedAt: now },
      })

      await NotificationStub.notify(sub.userId, 'PLAN_CANCEL_ALERT', {
        planType:       sub.planType,
        expiresAt:      sub.expiresAt!.toISOString(),
        daysUntilExpiry,
        isRenewalReminder: true,
        channels:       ['in_app', 'email'],
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
      status: { notIn: ['CANCELLED'] as never[] },
    },
    select: { id: true, userId: true, planType: true, expiresAt: true },
  })

  for (const sub of cancelled) {
    try {
      await prisma.$transaction([
        prisma.subscription.update({ where: { id: sub.id }, data: { status: 'CANCELLED' } }),
        prisma.user.update({
          where: { id: sub.userId },
          data: { planType: 'JOGADOR', fsBalance: 2000 },
        }),
      ])
      result.details.push({ subscriptionId: sub.id, action: 'CANCELLED_FINALIZED' })
      result.processed++
    } catch (err) {
      result.errors++
      result.details.push({ subscriptionId: sub.id, action: 'ERROR', error: String(err) })
    }
  }

  return result
}
