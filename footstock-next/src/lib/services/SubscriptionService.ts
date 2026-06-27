// ============================================================================
// FootStock — SubscriptionService: CRUD de assinaturas com CANCELLATION_LOCK
// ============================================================================

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { BaseService } from './base'
import {
  isWithinCoolingOff,
  calcBonusAmount,
  type SubscriptionForLogic,
} from './plan-logic'
import type { PlanType } from '@/lib/enums'
import { getGateway } from '@/lib/gateways/GatewayFactory'
import { GatewayType } from '@/lib/gateways/IGateway'

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

// ─── Recorrencia no gateway: guarda de elegibilidade UNICA + reconciliacao ────
// Politica de cancelamento recorrente: pause_on_lock_start (decisao G0.5 do loop
// 06-26-foot-stock-pagamentos-recorrencia-pagseguro, Item 005;
// pending-actions/foot-stock.md DEC-G0.5). A renovacao automatica e PAUSADA no
// gateway no INICIO do CANCELLATION_LOCK (DELETE /api/v1/subscriptions/me) e
// REATIVADA na reversao (PUT /api/v1/subscriptions/me/revert). O job de expiracao
// NAO faz 2a chamada (a assinatura ja esta pausada desde o lock-start).

export type AutoRenewalAction = 'cancel' | 'reactivate'

/** Subset de Subscription necessario para operar a auto-renovacao no gateway. */
export interface AutoRenewalSubscription {
  id: string
  gateway: string
  billingMode: string
  gatewaySubscriptionId: string | null
  gatewayStatus: string | null
}

export interface AutoRenewalSyncResult {
  /** passou na guarda invariante (billingMode='recurring' E gatewaySubscriptionId != null) */
  eligible: boolean
  /** realmente chamou o gateway (false em no-op idempotente ou inelegivel) */
  called: boolean
  /** gatewayStatus resultante persistido (ou o pre-existente em no-op) */
  gatewayStatus: string | null
}

/**
 * Guarda de elegibilidade UNICA (invariante) reutilizada por TODOS os pontos de
 * chamada de auto-renovacao. So e elegivel quando billingMode === 'recurring' E
 * gatewaySubscriptionId != null. Fora disso, no-op explicito (nunca erro).
 */
export function isAutoRenewalEligible(
  sub: Pick<AutoRenewalSubscription, 'billingMode' | 'gatewaySubscriptionId'>,
): boolean {
  return sub.billingMode === 'recurring' && sub.gatewaySubscriptionId != null
}

const GATEWAY_TYPE_MAP: Record<string, GatewayType> = {
  MERCADO_PAGO: GatewayType.MERCADO_PAGO,
  PAGSEGURO:    GatewayType.PAGSEGURO,
  PAYPAL:       GatewayType.PAYPAL,
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
      // FIX-20 (alinhamento a FIX-10): a liquidacao forcada T+48h foi
      // descontinuada; `forcedLiquidationAt` nunca e setado non-null, logo
      // requiresLiquidation era sempre false. Removemos a leitura morta da coluna
      // (e a regra de getRestrictedPositionTypes que so a alimentava), mantendo o
      // campo no contrato para os consumidores. Sem referencias incoerentes.
      cancellationLock = {
        expiresAt: subscription.cancellationLockExpiresAt.toISOString(),
        hoursRemaining,
        requiresLiquidation: false,
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
        code: 'AUTH-009',
        statusCode: 403,
      })
    }

    try {
      return await prisma.subscription.create({
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
    } catch (err) {
      // FU-023-2: o INSERT colide com o indice unico parcial M060
      // (subscriptions_user_plan_pending_active_uq em (user_id, plan_type) WHERE status IN
      // ('PENDING','ACTIVE')) sob requisicoes concorrentes do mesmo (userId, planType): o 2o
      // INSERT falha com P2002. Traduzimos para 409 CONFLICT codificado no ponto do INSERT
      // (defesa em profundidade, qualquer caller herda a protecao) em vez de deixar o P2002
      // cru vazar como 500. Anti dupla-cobranca + Zero Silencio.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw Object.assign(
          new Error('Já existe uma assinatura pendente ou ativa para este plano'),
          { code: 'PAYMENT_054', statusCode: 409 }
        )
      }
      throw err
    }
  }

  /** Agenda cancelamento para o fim do periodo pago. Reembolso CDC e opt-in separado. */
  async cancelSubscription(userId: string): Promise<CancelResult> {
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: { in: ['ACTIVE', 'TRIAL', 'TRIALING', 'PAST_DUE'] as const } },
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

    const lockStartedAt = now
    const lockExpiresAt = subscription.expiresAt!.getTime() > now.getTime()
      ? subscription.expiresAt!
      : now

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'CANCELLATION_LOCK',
        cancelledAt: now,
        cancellationLockStartedAt: lockStartedAt,
        cancellationLockExpiresAt: lockExpiresAt,
        bonusScheduledAt: null,
      },
    })

    const hoursRemaining = Math.ceil((lockExpiresAt.getTime() - now.getTime()) / 3_600_000)
    return {
      cancelledAt: now,
      expiresAt: subscription.expiresAt!,
      isEligibleForRefund: false,
      requiresLiquidation: false,
      cancellationLock: {
        expiresAt: lockExpiresAt.toISOString(),
        hoursRemaining,
        requiresLiquidation: false,
      },
    }
  }

  /**
   * Reconciliacao estado local x gateway para auto-renovacao (pause_on_lock_start).
   * Ponto de chamada UNICO reutilizado por DELETE /me (cancel) e PUT /me/revert
   * (reactivate).
   * - Guarda invariante (isAutoRenewalEligible): so chama o gateway quando
   *   billingMode='recurring' E gatewaySubscriptionId != null. Fora disso, no-op
   *   explicito (sem erro).
   * - Idempotente: se gatewayStatus ja esta no alvo ('paused' p/ cancel,
   *   'authorized' p/ reactivate), nao repete a chamada ao gateway.
   * - Sem sucesso silencioso: falha do gateway grava marcador compensatorio
   *   ('cancel_pending'/'reactivate_pending') e RELANCA o erro tipado para o
   *   chamador responder com status de erro coerente e manter reprocessavel.
   */
  async syncGatewayAutoRenewal(
    sub: AutoRenewalSubscription,
    action: AutoRenewalAction,
  ): Promise<AutoRenewalSyncResult> {
    // Guarda de elegibilidade unica (no-op explicito fora dela)
    if (!isAutoRenewalEligible(sub)) {
      return { eligible: false, called: false, gatewayStatus: sub.gatewayStatus ?? null }
    }

    const target = action === 'cancel' ? 'paused' : 'authorized'

    // Idempotencia: ja no estado-alvo -> no-op (sem 2a chamada ao gateway)
    if (sub.gatewayStatus === target) {
      return { eligible: true, called: false, gatewayStatus: target }
    }

    const gatewayType = GATEWAY_TYPE_MAP[sub.gateway?.toUpperCase()] ?? GatewayType.MERCADO_PAGO
    const gateway = getGateway(gatewayType)
    const gatewaySubscriptionId = sub.gatewaySubscriptionId as string

    try {
      if (action === 'cancel') {
        await gateway.cancelAutoRenewal(gatewaySubscriptionId)
      } else {
        await gateway.reactivateAutoRenewal(gatewaySubscriptionId)
      }
    } catch (err) {
      // Zero Silencio + reconciliavel: marca estado compensatorio observavel e
      // relanca. NUNCA declarar sucesso quando o gateway nao confirmou.
      const compensatory = action === 'cancel' ? 'cancel_pending' : 'reactivate_pending'
      await prisma.subscription
        .update({ where: { id: sub.id }, data: { gatewayStatus: compensatory } })
        .catch((persistErr) =>
          console.error(
            '[SubscriptionService.syncGatewayAutoRenewal] falha ao gravar estado compensatorio:',
            persistErr,
          ),
        )
      throw err
    }

    // Sucesso confirmado pelo gateway -> persiste o status alvo (reconciliado)
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { gatewayStatus: target },
    })

    return { eligible: true, called: true, gatewayStatus: target }
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
