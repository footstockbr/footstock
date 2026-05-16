// ============================================================================
// FootStock — PlanService: orquestra checkout, upgrade e validação de arrependimento
// Usa IGatewayAdapter para desacoplar de module-12
// ============================================================================

import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'
import { BaseService } from './base'
import { subscriptionService } from './SubscriptionService'
import {
  calcSubscriptionAmount,
  isWithinCoolingOff,
  canUpgrade,
  calcUpgradeBonusAmount,
  type SubscriptionForLogic,
} from './plan-logic'
import { throwPaymentError } from '@/lib/errors/payment-errors'
import { NotificationStub } from '@/lib/notifications/stubs/NotificationStub'
import type { PlanType } from '@/lib/enums'
import { getGateway } from '@/lib/gateways/GatewayFactory'
import { GatewayType } from '@/lib/gateways/IGateway'
import type { GatewayCheckoutInput } from '@/lib/gateways/IGateway'
import { leagueAutoEnrollService } from './LeagueAutoEnrollService'
import { DAILY_ORDER_LIMITS_BY_PLAN, ALLOWED_ORDER_TYPES_BY_PLAN } from './plan-order-limits'

export interface CheckoutDTO {
  planType: PlanType
  period: 'monthly' | 'yearly'
  gateway: string
  amount?: number // calculado internamente se não fornecido
}

export interface CheckoutResult {
  redirectUrl: string
  subscriptionId: string
}

// Mapeia string de gateway para GatewayType enum
function resolveGatewayType(gateway: string): GatewayType {
  const map: Record<string, GatewayType> = {
    MERCADO_PAGO: GatewayType.MERCADO_PAGO,
    PAGSEGURO:    GatewayType.PAGSEGURO,
    PAYPAL:       GatewayType.PAYPAL,
  }
  return map[gateway.toUpperCase()] ?? GatewayType.MERCADO_PAGO
}

// Período de expiração por período de assinatura (meses)
function calcExpiresAt(startsAt: Date, period: 'monthly' | 'yearly'): Date {
  const expires = new Date(startsAt)
  if (period === 'yearly') {
    expires.setFullYear(expires.getFullYear() + 1)
  } else {
    expires.setMonth(expires.getMonth() + 1)
  }
  return expires
}

export class PlanService extends BaseService {
  constructor() {
    super()
  }

  /** Cria intenção de checkout e retorna redirectUrl para o gateway externo */
  async createCheckout(userId: string, dto: CheckoutDTO): Promise<CheckoutResult> {
    // Validar: Jogador não requer checkout
    if (dto.planType === 'JOGADOR') {
      throwPaymentError('INVALID_GATEWAY', 'Plano Jogador não requer checkout')
    }

    // Verificar plano atual do usuário
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { planType: true, adminRole: true },
    })

    // Contas administrativas são operacionais e não entram em fluxo de assinatura/billing.
    if (user?.adminRole) {
      throw Object.assign(new Error('Contas administrativas não podem contratar assinatura.'), {
        code: 'AUTH_009',
        statusCode: 403,
      })
    }

    // Player sem planType (estado transitório pos-registro) trata como JOGADOR para canUpgrade.
    const effectiveCurrentPlan = (user?.planType ?? 'JOGADOR') as PlanType
    if (user && !canUpgrade(effectiveCurrentPlan, dto.planType)) {
      // Permite downgrade via checkout apenas se assinatura atual está em CANCELLATION_LOCK
      const lockedSub = await prisma.subscription.findFirst({
        where: { userId, status: 'CANCELLATION_LOCK' },
      })
      if (!lockedSub) {
        throw Object.assign(new Error('Não é possível fazer downgrade via checkout'), {
          code: 'PAYMENT_054',
          statusCode: 422,
        })
      }
    }

    // Verificar assinatura ACTIVE existente do mesmo plano
    const existingActive = await prisma.subscription.findFirst({
      where: { userId, planType: dto.planType as never, status: 'ACTIVE' },
    })
    if (existingActive) {
      throw Object.assign(new Error('Você já possui este plano ativo'), {
        code: 'ORDER_081',
        statusCode: 409,
      })
    }

    // Idempotência: verificar PENDING recente (últimos 5min) para mesma combinação
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const recentPending = await prisma.subscription.findFirst({
      where: {
        userId,
        planType: dto.planType as never,
        period: dto.period.toUpperCase() as never,
        status: 'PENDING',
        createdAt: { gte: fiveMinutesAgo },
      },
    })
    if (recentPending) {
      // Reutilizar — não chamar gateway novamente
      const redirectUrl = `${env.NEXT_PUBLIC_APP_URL}/planos?payment=pending&sub=${recentPending.id}`
      return { redirectUrl, subscriptionId: recentPending.id }
    }

    // Calcular amount
    const amount = dto.amount ?? calcSubscriptionAmount(dto.planType, dto.period)
    const now = new Date()
    const expiresAt = calcExpiresAt(now, dto.period)

    // Criar subscription PENDING
    const subscription = await subscriptionService.createSubscription({
      userId,
      planType: dto.planType,
      gateway: dto.gateway,
      period: dto.period.toUpperCase(),
      amount,
      startsAt: now,
      expiresAt,
    })

    // Chamar gateway via GatewayFactory (module-12)
    const appUrl = env.NEXT_PUBLIC_APP_URL
    const gatewayType = resolveGatewayType(dto.gateway)
    const gateway = getGateway(gatewayType)

    let redirectUrl: string
    try {
      const input: GatewayCheckoutInput = {
        planType:    dto.planType,
        period:      dto.period,
        amount,
        currency:    'BRL',
        subscriptionId: subscription.id,
        userId,
        userEmail:   '', // preenchido no caller quando disponível
        successUrl:  `${appUrl}/planos?payment=success&sub=${subscription.id}`,
        failureUrl:  `${appUrl}/planos?payment=failed`,
        pendingUrl:  `${appUrl}/planos?payment=pending&sub=${subscription.id}`,
      }
      const result = await gateway.createCheckout(input)
      redirectUrl = result.redirectUrl
    } catch (err) {
      // Subscription permanece PENDING — não excluir (para auditoria)
      throwPaymentError('DECLINED', String(err))
    }

    return { redirectUrl: redirectUrl!, subscriptionId: subscription.id }
  }

  /** Ativa plano após confirmação de webhook — operação idempotente */
  async upgradeUser(userId: string, subscriptionId: string): Promise<void> {
    const [subscription, user] = await Promise.all([
      prisma.subscription.findUnique({ where: { id: subscriptionId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { planType: true, adminRole: true } }),
    ])

    if (!subscription) {
      throwPaymentError('NOT_FOUND', `subscriptionId=${subscriptionId} não encontrada`)
    }

    if (user?.adminRole) {
      throw Object.assign(new Error('Contas administrativas não podem ter assinatura ativa.'), {
        code: 'AUTH_009',
        statusCode: 403,
      })
    }

    // Idempotência: já ACTIVE → skip silencioso (PAYMENT_052)
    if (subscription.status === 'ACTIVE') return

    // G-02: registrar plano anterior para cálculo de bônus diferencial em T+7
    const previousPlanType = user?.planType ?? null
    const isUpgrade = previousPlanType !== null && previousPlanType !== subscription.planType

    // Calcular bônus diferencial (apenas upgrades elegíveis)
    const upgradeBonusAmount = isUpgrade
      ? calcUpgradeBonusAmount(previousPlanType as PlanType, subscription.planType as PlanType)
      : 0
    const hasBonusToSchedule = isUpgrade && upgradeBonusAmount > 0
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    // Transaction atômica: ativar subscription + atualizar user + agendar bônus T+7 (apenas upgrades)
    await prisma.$transaction([
      prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
          status:           'ACTIVE',
          previousPlanType: isUpgrade ? previousPlanType as never : null, // G-02
          bonusScheduledAt: hasBonusToSchedule ? sevenDaysFromNow : null,
          bonusAmount:      hasBonusToSchedule ? upgradeBonusAmount : null,
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data:  { planType: subscription.planType },
      }),
    ])

    // Notificação via G-003 stub
    await NotificationStub.notify(userId, 'PAYMENT_CONFIRMED', {
      planType: subscription.planType,
      amount:   subscription.amount,
      subscriptionId,
    })

    // Notificação de bônus agendado — apenas quando há upgrade com bônus elegível (T-021)
    if (hasBonusToSchedule) {
      const bonusDate = sevenDaysFromNow.toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
      await prisma.notification.create({
        data: {
          userId,
          type: 'BONUS_SCHEDULED',
          title: 'Bônus de upgrade agendado',
          body: `Seu bônus de FS$ ${upgradeBonusAmount.toLocaleString('pt-BR')} será creditado em ${bonusDate}.`,
          isRead: false,
        },
      }).catch((err) =>
        console.error('[PlanService.upgradeUser] Erro ao criar notificação BONUS_SCHEDULED:', err)
      )
    }

    // Auto-enroll na liga pública da nova divisão após upgrade.
    // Operação best-effort — não reverte a transação em caso de falha.
    leagueAutoEnrollService
      .enrollUserInPublicLeague(userId, subscription.planType as PlanType)
      .catch((err) =>
        console.error('[PlanService.upgradeUser] Falha no auto-enroll de liga:', err)
      )
  }

  /**
   * Retorna o limite diário de criação de ordens para o plano informado.
   * Retorna `null` para Lenda (ilimitado) e número inteiro para os demais.
   */
  getDailyOrderLimit(plan: string): number | null {
    const limit = DAILY_ORDER_LIMITS_BY_PLAN[plan as PlanType]
    if (limit === undefined || limit === Infinity) return null
    return limit
  }

  /**
   * Retorna os tipos de ordem permitidos para o plano informado.
   * Jogador: ['MARKET']
   * Craque: ['MARKET', 'LIMIT', 'SCHEDULED']
   * Lenda: ['MARKET', 'LIMIT', 'OCO', 'SCHEDULED']
   */
  getAllowedOrderTypes(plan: string): string[] {
    return ALLOWED_ORDER_TYPES_BY_PLAN[plan as PlanType] ?? ['MARKET']
  }

  /** Verifica se usuário está elegível para arrependimento (CDC Art. 49) */
  async validateArrependimento(subscriptionId: string): Promise<boolean> {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    })
    if (!subscription) return false

    const subForLogic: SubscriptionForLogic = {
      planType: subscription.planType as PlanType,
      startsAt: subscription.startsAt,
      expiresAt: subscription.expiresAt!,
      status: subscription.status,
      cancelledAt: subscription.cancelledAt,
    }

    return isWithinCoolingOff(subForLogic, new Date())
  }
}

export const planService = new PlanService()
