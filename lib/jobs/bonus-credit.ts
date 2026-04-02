// ============================================================================
// Foot Stock — Job: bonus-credit
// Cron diário (03:00 UTC): credita bônus FS$ para assinantes em T+7 dias
// G-02: crédito diferencial para upgrades (novo plano - plano anterior)
// Idempotente: bonusCreditedAt IS NULL verificado antes de creditar
// ============================================================================

import { prisma } from '@/lib/prisma'
import { NotificationStub } from '@/lib/notifications/stubs/NotificationStub'
import { calcBonusAmount } from '@/lib/services/plan-logic'
import type { PlanType } from '@/lib/enums'
import type { ProcessResult } from './subscription-expiry'

/**
 * Calcula o bônus a creditar para este ciclo de assinatura.
 * G-02: se é upgrade, credita apenas o diferencial (evita double-counting).
 */
function calcEffectiveBonusAmount(planType: PlanType, previousPlanType: PlanType | null): number {
  const newBonus = calcBonusAmount(planType)
  if (!previousPlanType) return newBonus // nova assinatura — bônus completo

  const prevBonus = calcBonusAmount(previousPlanType)
  const differential = newBonus - prevBonus

  // Proteção: diferencial negativo (downgrade, não deve acontecer) → não creditar
  return Math.max(0, differential)
}

/** Processa crédito de bônus FS$ após T+7 dias (novo + upgrade diferencial) */
export async function processBonusCredits(): Promise<ProcessResult> {
  const now = new Date()
  const result: ProcessResult = { processed: 0, errors: 0, details: [] }

  const pending = await prisma.subscription.findMany({
    where: {
      bonusScheduledAt:  { lte: now },
      bonusCreditedAt:   null,
      status:            'ACTIVE',
    },
    select: {
      id:               true,
      userId:           true,
      planType:         true,
      previousPlanType: true, // G-02: detectar upgrade
      bonusScheduledAt: true,
      cancelledAt:      true,
    },
  })

  for (const sub of pending) {
    try {
      const isUpgrade    = sub.previousPlanType !== null
      const bonusAmount  = calcEffectiveBonusAmount(
        sub.planType         as PlanType,
        sub.previousPlanType as PlanType | null
      )

      if (bonusAmount === 0) {
        // Sem bônus a creditar (ex: downgrade inesperado)
        await prisma.subscription.update({
          where: { id: sub.id },
          data:  { bonusCreditedAt: now },
        })
        result.details.push({ subscriptionId: sub.id, action: 'BONUS_ZERO_SKIP' })
        result.processed++
        continue
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: sub.userId },
          data:  { fsBalance: { increment: bonusAmount } },
        }),
        prisma.subscription.update({
          where: { id: sub.id },
          data:  { bonusCreditedAt: now },
        }),
      ])

      // Notificação — email só se não cancelou no arrependimento
      const channels = sub.cancelledAt ? ['in_app'] : ['in_app', 'email']
      await NotificationStub.notify(sub.userId, 'BONUS_CREDITED', {
        amount:      bonusAmount,
        planName:    sub.planType,
        isUpgrade,
        channels,
      })

      const actionTag = isUpgrade
        ? `DIFFERENTIAL_BONUS_CREDITED_${bonusAmount}FS`
        : `BONUS_CREDITED_${bonusAmount}FS`

      result.details.push({ subscriptionId: sub.id, action: actionTag })
      result.processed++
    } catch (err) {
      console.error(`[bonus-credit] Erro em ${sub.id}:`, err)
      result.errors++
      result.details.push({ subscriptionId: sub.id, action: 'ERROR', error: String(err) })
    }
  }

  return result
}
