// ============================================================================
// Foot Stock — Job: bonus-credit
// Cron diário (03:00 UTC): credita bônus FS$ para assinantes em T+7 dias
// G-02: crédito diferencial para upgrades (novo plano - plano anterior)
// Idempotente: bonusCreditedAt IS NULL verificado antes de creditar
// T-021: persiste Transaction de extrato (financialType=BONUS) e notificação real no banco
// ============================================================================

import { prisma } from '@/lib/prisma'
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

/** Processa crédito de bônus FS$ após T+7 dias (upgrade diferencial) */
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
      bonusAmount:      true, // T-021: valor imutável armazenado no agendamento
      bonusScheduledAt: true,
      cancelledAt:      true,
    },
  })

  for (const sub of pending) {
    try {
      // Usar bonusAmount armazenado (imutável) ou calcular o diferencial como fallback
      const storedAmount = sub.bonusAmount ? Number(sub.bonusAmount) : null
      const bonusAmount = storedAmount ?? calcEffectiveBonusAmount(
        sub.planType         as PlanType,
        sub.previousPlanType as PlanType | null,
      )

      if (bonusAmount === 0) {
        // Sem bônus a creditar (ex: diferencial zero inesperado)
        await prisma.subscription.update({
          where: { id: sub.id },
          data:  { bonusCreditedAt: now },
        })
        console.log('[bonus-credit] BONUS_ZERO_SKIP', { subscriptionId: sub.id, userId: sub.userId })
        result.details.push({ subscriptionId: sub.id, action: 'BONUS_ZERO_SKIP' })
        result.processed++
        continue
      }

      const planLabel = sub.planType === 'CRAQUE' ? 'Craque' : 'Lenda'
      let balanceBefore = 0
      let balanceAfter  = 0

      // Transação atômica: crédito + marcar creditado + registro de extrato
      // Usa callback form para ler saldo DENTRO da transação (evita race condition)
      await prisma.$transaction(async (tx) => {
        const userInTx = await tx.user.findUnique({
          where: { id: sub.userId },
          select: { fsBalance: true },
        })
        balanceBefore = userInTx ? Number(userInTx.fsBalance) : 0
        balanceAfter  = balanceBefore + bonusAmount

        await tx.user.update({
          where: { id: sub.userId },
          data:  { fsBalance: { increment: bonusAmount } },
        })
        await tx.subscription.update({
          where: { id: sub.id },
          data:  { bonusCreditedAt: now },
        })
        // Extrato: lançamento BONUS no TransactionHistory (T-021)
        await tx.transaction.create({
          data: {
            userId:        sub.userId,
            financialType: 'BONUS',
            totalAmount:   bonusAmount,
            fsAmount:      bonusAmount,
            balanceBefore,
            balanceAfter,
            // Campos de trade não se aplicam — nullable por M041
            assetId:  null,
            type:     null,
            side:     null,
            quantity: null,
            price:    null,
            fee:      null,
          },
        })
      })

      // Notificação real no banco (T-021 — não apenas stub)
      await prisma.notification.create({
        data: {
          userId:  sub.userId,
          type:    'BONUS_CREDITED',
          title:   'Bônus creditado',
          body:    `Bônus de upgrade para ${planLabel} de FS$ ${bonusAmount.toLocaleString('pt-BR')} creditado com sucesso.`,
          isRead:  false,
        },
      }).catch((err) =>
        console.error('[bonus-credit] Erro ao criar notificação BONUS_CREDITED:', err)
      )

      // Log estruturado (T-021 requisito de auditoria)
      console.log('[bonus-credit] CREDITED', {
        subscriptionId: sub.id,
        userId:         sub.userId,
        bonusAmount,
        balanceBefore,
        balanceAfter,
        planType:       sub.planType,
        previousPlan:   sub.previousPlanType,
      })

      const actionTag = `BONUS_CREDITED_${bonusAmount}FS`
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
