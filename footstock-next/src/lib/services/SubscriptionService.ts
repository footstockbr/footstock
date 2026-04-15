// ============================================================================
// Foot Stock — SubscriptionService: CRUD de assinaturas com CANCELLATION_LOCK
// ============================================================================

import { prisma } from '@/lib/prisma'
import { BaseService } from './base'
import {
  isWithinCoolingOff,
  shouldEnterCancellationLock,
  getCancellationLockExpiry,
  getForcedLiquidationAt,
  getRestrictedPositionTypes,
  calcBonusAmount,
  type SubscriptionForLogic,
} from './plan-logic'
import type { PlanType } from '@/lib/enums'

export interface CurrentSubscriptionResult {
  id: string
  planType: PlanType
  status: string
  startsAt: Date
  expiresAt: Date
  gateway: string
  period: string
  amount: number
  cancelledAt: Date | null
  cancellationLockExpiresAt: Date | null
  bonusScheduledAt: Date | null
  bonusCreditedAt: Date | null
  refundRequested: boolean
  // Campos calculados
  isEligibleForRefund: boolean
  daysUntilExpiry: number
  bonusCredit: { amount: number; scheduledAt: string | null; credited: boolean } | null
  requiresLiquidation?: boolean
  cancellationLock?: {
    expiresAt: string
    hoursRemaining: number
    requiresLiquidation: boolean
    positions?: Array<{ ativo: string; tipo: string; quantidade: number; valorEstimado: number }>
  } | null
}

export interface CancelResult {
  cancelledAt: Date
  expiresAt: Date
  isEligibleForRefund: boolean
  requiresLiquidation: boolean
  cancellationLock?: {
    expiresAt: string
    hoursRemaining: number
    requiresLiquidation: boolean
  }
}

export interface CreateSubscriptionInput {
  userId: string
  planType: PlanType
  gateway: string
  period: string
  amount: number // centavos Int
  startsAt: Date
  expiresAt: Date
}

export class SubscriptionService extends BaseService {

  /** Busca subscription ativa/trial/em trava do usuário com campos calculados */
  async getCurrentSubscription(userId: string): Promise<CurrentSubscriptionResult | null> {
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ['ACTIVE', 'TRIAL', 'CANCELLATION_LOCK'] as const },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!subscription) return null

    const now = new Date()
    const subForLogic: SubscriptionForLogic = {
      planType: subscription.planType as PlanType,
      startsAt: subscription.startsAt,
      expiresAt: subscription.expiresAt!,
      status: subscription.status,
      cancelledAt: subscription.cancelledAt,
      cancellationLockExpiresAt: subscription.cancellationLockExpiresAt,
    }

    const isEligibleForRefund = isWithinCoolingOff(subForLogic, now)
    const msUntilExpiry = (subscription.expiresAt?.getTime() ?? now.getTime()) - now.getTime()
    const daysUntilExpiry = Math.ceil(msUntilExpiry / 86_400_000)

    let cancellationLock = null
    if (subscription.status === 'CANCELLATION_LOCK' && subscription.cancellationLockExpiresAt) {
      const msRemaining = Math.max(0, subscription.cancellationLockExpiresAt.getTime() - now.getTime())
      const hoursRemaining = Math.ceil(msRemaining / 3_600_000)
      const restrictedTypes = getRestrictedPositionTypes(subscription.planType as PlanType, 'JOGADOR')
      cancellationLock = {
        expiresAt: subscription.cancellationLockExpiresAt.toISOString(),
        hoursRemaining,
        requiresLiquidation: restrictedTypes.length > 0,
      }
    }

    return {
      id: subscription.id,
      planType: subscription.planType as PlanType,
      status: subscription.status,
      startsAt: subscription.startsAt,
      expiresAt: subscription.expiresAt!,
      gateway: subscription.gateway,
      period: subscription.period,
      amount: subscription.amount,
      cancelledAt: subscription.cancelledAt,
      cancellationLockExpiresAt: subscription.cancellationLockExpiresAt,
      bonusScheduledAt: subscription.bonusScheduledAt,
      bonusCreditedAt: subscription.bonusCreditedAt,
      refundRequested: subscription.refundRequested,
      isEligibleForRefund,
      daysUntilExpiry,
      // T-021: usar bonusAmount armazenado (diferencial real) quando disponível
      bonusCredit: subscription.bonusScheduledAt
        ? {
            amount: subscription.bonusAmount
              ? Number(subscription.bonusAmount)
              : calcBonusAmount(subscription.planType as PlanType),
            scheduledAt: subscription.bonusScheduledAt.toISOString(),
            credited: subscription.bonusCreditedAt !== null,
          }
        : null,
      cancellationLock,
    }
  }

  /** Cria subscription com status PENDING */
  async createSubscription(data: CreateSubscriptionInput) {
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { adminRole: true },
    })

    if (user?.adminRole) {
      throw Object.assign(new Error('Contas administrativas não podem criar assinatura.'), {
        code: 'AUTH_009',
        statusCode: 403,
      })
    }

    return prisma.subscription.create({
      data: {
        userId: data.userId,
        planType: data.planType as never,
        gateway: data.gateway as never,
        period: data.period as never,
        amount: data.amount,
        status: 'PENDING',
        startsAt: data.startsAt,
        expiresAt: data.expiresAt,
      },
    })
  }

  /** Cancela subscription com lógica de arrependimento CDC Art. 49 e CANCELLATION_LOCK */
  async cancelSubscription(userId: string): Promise<CancelResult> {
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: { in: ['ACTIVE', 'TRIAL'] as const } },
      orderBy: { createdAt: 'desc' },
    })

    if (!subscription) {
      throw Object.assign(new Error('Assinatura não encontrada'), { code: 'PAYMENT_080', statusCode: 404 })
    }

    if (subscription.status === 'CANCELLATION_LOCK') {
      throw Object.assign(new Error('Assinatura já está em processo de cancelamento'), {
        code: 'PAYMENT_054',
        statusCode: 409,
      })
    }

    const now = new Date()
    const subForLogic: SubscriptionForLogic = {
      planType: subscription.planType as PlanType,
      startsAt: subscription.startsAt,
      expiresAt: subscription.expiresAt!,
      status: subscription.status,
      cancelledAt: subscription.cancelledAt,
    }

    const eligibleForRefund = isWithinCoolingOff(subForLogic, now)
    const enterLock = shouldEnterCancellationLock(subForLogic, now)
    const restrictedTypes = getRestrictedPositionTypes(subscription.planType as PlanType, 'JOGADOR')

    if (eligibleForRefund) {
      // Cancelamento simples com reembolso (arrependimento CDC Art. 49)
      // T-021: nular bonusScheduledAt para cancelar bônus pendente dentro da carência
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { cancelledAt: now, refundRequested: true, bonusScheduledAt: null },
      })
      return {
        cancelledAt: now,
        expiresAt: subscription.expiresAt!,
        isEligibleForRefund: true,
        requiresLiquidation: false,
      }
    }

    if (enterLock) {
      // CANCELLATION_LOCK — features bloqueadas imediatamente
      // T-021: nular bonusScheduledAt — CANCELLATION_LOCK conta como cancelamento de bônus
      const lockStartedAt = now
      const lockExpiresAt = getCancellationLockExpiry(lockStartedAt)   // T+7d
      const forcedLiqAt = getForcedLiquidationAt(lockStartedAt)         // T+48h

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'CANCELLATION_LOCK',
          cancelledAt: now,
          cancellationLockStartedAt: lockStartedAt,
          cancellationLockExpiresAt: lockExpiresAt,
          forcedLiquidationAt: forcedLiqAt,
          forcedLiquidationExecutedAt: null,
          bonusScheduledAt: null, // T-021: cancelar bônus pendente
        },
      })

      const hoursRemaining = Math.ceil((lockExpiresAt.getTime() - now.getTime()) / 3_600_000)
      return {
        cancelledAt: now,
        expiresAt: subscription.expiresAt!,
        isEligibleForRefund: false,
        requiresLiquidation: restrictedTypes.length > 0,
        cancellationLock: {
          expiresAt: lockExpiresAt.toISOString(),
          hoursRemaining,
          requiresLiquidation: restrictedTypes.length > 0,
        },
      }
    }

    // Fallback: cancelamento simples sem reembolso e sem trava
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelledAt: now, bonusScheduledAt: null }, // T-021: nular bônus pendente
    })

    return {
      cancelledAt: now,
      expiresAt: subscription.expiresAt!,
      isEligibleForRefund: false,
      requiresLiquidation: false,
    }
  }

  /** Ativa subscription após confirmação de pagamento */
  async activateSubscription(subscriptionId: string): Promise<void> {
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'ACTIVE' },
    })
  }

  /** Agenda crédito de bônus T+7 */
  async scheduleBonus(subscriptionId: string, _bonusAmount: number): Promise<void> {
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { bonusScheduledAt: new Date(Date.now() + sevenDays) },
    })
  }

  /** Marca reembolso como solicitado */
  async markRefundRequested(subscriptionId: string): Promise<void> {
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { refundRequested: true },
    })
  }

  /**
   * Cancelamento com cooling-off: estorna bônus FS$ se já creditado,
   * solicita reembolso via gateway e salva previousPlanType.
   * TASK-4/ST005 — gap G-02 complementar.
   */
  async cancelWithCooldown(userId: string): Promise<CancelResult> {
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: { in: ['ACTIVE', 'TRIAL'] as const } },
      orderBy: { createdAt: 'desc' },
    })

    if (!subscription) {
      throw Object.assign(new Error('Assinatura não encontrada'), { code: 'PAYMENT_080', statusCode: 404 })
    }

    const now = new Date()
    const subForLogic: SubscriptionForLogic = {
      planType: subscription.planType as PlanType,
      startsAt: subscription.startsAt,
      expiresAt: subscription.expiresAt!,
      status: subscription.status,
      cancelledAt: subscription.cancelledAt,
    }

    const eligibleForRefund = isWithinCoolingOff(subForLogic, now)

    if (!eligibleForRefund) {
      // Fora do cooling-off → delega para cancelSubscription padrão
      return this.cancelSubscription(userId)
    }

    // Dentro do cooling-off: estornar bônus + solicitar reembolso
    const bonusToRevert = subscription.bonusCreditedAt
      ? calcBonusAmount(subscription.planType as PlanType)
      : 0

    await prisma.$transaction([
      // Salvar previousPlanType para rastreabilidade + nular bonusScheduledAt (T-021)
      prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          cancelledAt: now,
          refundRequested: true,
          previousPlanType: subscription.planType as never,
          bonusScheduledAt: null, // T-021: cancelar bônus pendente na carência
        },
      }),
      // Estornar bônus se já creditado
      ...(bonusToRevert > 0
        ? [
            prisma.user.update({
              where: { id: subscription.userId },
              data: { fsBalance: { decrement: bonusToRevert } },
            }),
            prisma.subscription.update({
              where: { id: subscription.id },
              data: { bonusCreditedAt: null },
            }),
          ]
        : []),
    ])

    return {
      cancelledAt: now,
      expiresAt: subscription.expiresAt!,
      isEligibleForRefund: true,
      requiresLiquidation: false,
    }
  }
}

export const subscriptionService = new SubscriptionService()
