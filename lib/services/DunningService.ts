// ============================================================================
// Foot Stock — DunningService: retentativas automáticas D+1/D+3/D+7 (Should)
// Cron diário: detecta subscriptions expiradas involuntariamente e reenvia link de cobrança
// Referência: PAYMENT_060 (máximo de tentativas), INT-070
// ============================================================================

import { prisma } from '@/lib/prisma'
import { NotificationStub } from '@/lib/notifications/stubs/NotificationStub'
import { getGateway } from '@/lib/gateways/GatewayFactory'
import { GatewayType } from '@/lib/gateways/IGateway'
import { DUNNING_MAX_ATTEMPTS } from '@/lib/constants/payment-security'
import { env } from '@/lib/env'
import type { ProcessResult } from '@/lib/jobs/subscription-expiry'

// Escalonamento de dias para retentativas
const DUNNING_SCHEDULE_DAYS = [1, 3, 7] as const

// Mapeamento de SubscriptionGateway → GatewayType
const GATEWAY_MAP: Record<string, GatewayType> = {
  MERCADO_PAGO: GatewayType.MERCADO_PAGO,
  PAGSEGURO:    GatewayType.PAGSEGURO,
  PAYPAL:       GatewayType.PAYPAL,
}

export class DunningService {
  /**
   * Processa retentativas de cobrança para subscriptions expiradas involuntariamente.
   * Deve ser chamado pelo cron diário.
   */
  async processDunning(): Promise<ProcessResult> {
    const now = new Date()
    const result: ProcessResult = { processed: 0, errors: 0, details: [] }

    // Buscar subscriptions expiradas involuntariamente (sem cancelledAt)
    const expired = await prisma.subscription.findMany({
      where: {
        status:      'EXPIRED',
        cancelledAt: null,
      },
      select: {
        id:               true,
        userId:           true,
        planType:         true,
        gateway:          true,
        amount:           true,
        period:           true,
        expiresAt:        true,
        dunningAttempts:  {
          select: { attemptNumber: true, scheduledAt: true, status: true },
          orderBy: { attemptNumber: 'desc' },
        },
      },
    })

    for (const sub of expired) {
      try {
        const attemptsDone = sub.dunningAttempts.length

        // Máximo de tentativas atingido
        if (attemptsDone >= DUNNING_MAX_ATTEMPTS) {
          console.info(`[DunningService] PAYMENT_060 — max tentativas para subscription ${sub.id}`)
          result.details.push({ subscriptionId: sub.id, action: 'PAYMENT_060_MAX_ATTEMPTS' })
          continue
        }

        // Verificar se é hora da próxima tentativa
        const nextAttemptDay = DUNNING_SCHEDULE_DAYS[attemptsDone]
        if (nextAttemptDay === undefined) continue
        const daysSinceExpiry = Math.floor(
          (now.getTime() - sub.expiresAt.getTime()) / (24 * 60 * 60 * 1000)
        )

        if (daysSinceExpiry < nextAttemptDay) {
          // Ainda não chegou o dia da próxima tentativa
          continue
        }

        // Criar nova preferência de checkout via GatewayFactory
        const gatewayType = GATEWAY_MAP[sub.gateway] ?? GatewayType.MERCADO_PAGO
        const gateway     = getGateway(gatewayType)
        const appUrl      = env.NEXT_PUBLIC_APP_URL

        let checkoutUrl = `${appUrl}/planos?renew=${sub.id}`
        try {
          const user = await prisma.user.findUnique({
            where: { id: sub.userId },
            select: { email: true },
          })

          const checkoutResult = await gateway.createCheckout({
            planType:      sub.planType,
            period:        sub.period.toLowerCase() as 'monthly' | 'yearly',
            amount:        sub.amount,
            currency:      'BRL',
            subscriptionId: sub.id,
            userId:        sub.userId,
            userEmail:     user?.email ?? '',
            successUrl:    `${appUrl}/planos?payment=success&sub=${sub.id}`,
            failureUrl:    `${appUrl}/planos?payment=failed`,
            pendingUrl:    `${appUrl}/planos?payment=pending&sub=${sub.id}`,
          })
          checkoutUrl = checkoutResult.redirectUrl
        } catch (err) {
          console.warn(`[DunningService] Erro ao criar checkout para ${sub.id}: ${err}`)
          // Usar URL de fallback — não interromper o dunning
        }

        // Registrar tentativa
        const nextAttemptNumber = attemptsDone + 1
        await prisma.dunningAttempt.create({
          data: {
            subscriptionId: sub.id,
            attemptNumber:  nextAttemptNumber,
            gateway:        sub.gateway,
            status:         'PENDING',
            scheduledAt:    now,
          },
        })

        // Notificar usuário com link de renovação
        await NotificationStub.notify(sub.userId, 'PAYMENT_FAILED', {
          planType:       sub.planType,
          checkoutUrl,
          attemptNumber:  nextAttemptNumber,
          isLastAttempt:  nextAttemptNumber >= DUNNING_MAX_ATTEMPTS,
          channels:       ['in_app', 'email'],
        })

        result.details.push({
          subscriptionId: sub.id,
          action: `DUNNING_ATTEMPT_${nextAttemptNumber}`,
        })
        result.processed++
      } catch (err) {
        console.error(`[DunningService] Erro em ${sub.id}:`, err)
        result.errors++
        result.details.push({ subscriptionId: sub.id, action: 'ERROR', error: String(err) })
      }
    }

    return result
  }

  /**
   * Cancela dunning ativo quando usuário renova manualmente.
   */
  async cancelDunning(subscriptionId: string): Promise<void> {
    await prisma.dunningAttempt.updateMany({
      where:  { subscriptionId, status: 'PENDING' },
      data:   { status: 'FAILED', processedAt: new Date() },
    })
  }
}

export const dunningService = new DunningService()
