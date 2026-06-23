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
import { notificationService } from '@/lib/notifications'
import { PLAN_HIERARCHY, type PlanType } from '@/lib/enums'
import { getGateway } from '@/lib/gateways/GatewayFactory'
import { GatewayType } from '@/lib/gateways/IGateway'
import type { GatewayCheckoutInput } from '@/lib/gateways/IGateway'
import { Prisma } from '@prisma/client'
import type { SubscriptionGateway } from '@prisma/client'
import { captureException } from '@/lib/monitoring/sentry'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'
import { leagueEventRecorder } from '@/lib/services/leagues/LeagueEventRecorder'
import { leagueAutoEnrollService } from './LeagueAutoEnrollService'
import { buildGatewayReturnUrls } from './payment-return-urls'
import { DAILY_ORDER_LIMITS_BY_PLAN, ALLOWED_ORDER_TYPES_BY_PLAN } from './plan-order-limits'

export interface CheckoutDTO {
  planType: PlanType
  period: 'monthly' | 'yearly'
  gateway: string
  userEmail?: string
  amount?: number // calculado internamente se não fornecido
  // FU-023-5: caminho Pix usa /v1/payments direto (na rota), nao a preferencia de
  // redirect do gateway. Quando true, createCheckout cria a Subscription PENDING mas
  // PULA a chamada /checkout/preferences do gateway (que geraria preference + merchant_order
  // orfaos). redirectUrl volta como string vazia nesse caso (o caminho Pix nao a consome).
  skipGatewayCheckout?: boolean
}

export interface CheckoutResult {
  redirectUrl: string
  subscriptionId: string
}

/**
 * Resultado explícito de upgradeUser, consumido pelo webhook para decidir se deve
 * registrar Payment PAID / comissão / analytics. Antes o retorno era void e qualquer
 * skip silencioso (estado terminal) era indistinguível de uma ativação real.
 * - ACTIVATED:       assinatura passou a ACTIVE nesta chamada.
 * - ALREADY_ACTIVE:  já estava ACTIVE (idempotência / renovação) — pagamento ainda é válido.
 * - NOT_ACTIVATABLE: estado terminal (CANCELLED/EXPIRED/SUSPENDED/CANCELLATION_LOCK) —
 *                    NÃO registrar pagamento como PAID.
 */
export type UpgradeResult = 'ACTIVATED' | 'ALREADY_ACTIVE' | 'NOT_ACTIVATABLE'

/**
 * Dados da conversao de afiliado retornados por processAffiliateCommission quando uma
 * AffiliateTransaction PENDING e criada. `null` quando nao ha comissao a creditar (sem
 * codigo de referido, codigo inativo, auto-referencia ou valor <= 0). Consumido por
 * applyPaymentConfirmedEffects para disparar o evento de analytics FORA da transacao.
 */
type AffiliateCommissionResult = {
  affiliateUserId: string
  affiliateCode: string
  affiliateType: string
  commissionAmount: number
} | null

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
      select: { planType: true, adminRole: true, email: true },
    })

    // Contas administrativas são operacionais e não entram em fluxo de assinatura/billing.
    if (user?.adminRole) {
      throw Object.assign(new Error('Contas administrativas não podem contratar assinatura.'), {
        code: 'AUTH-009',
        statusCode: 403,
      })
    }

    // Player sem planType (estado transitório pos-registro) trata como JOGADOR para canUpgrade.
    const effectiveCurrentPlan = (user?.planType ?? 'JOGADOR') as PlanType
    if (user && !canUpgrade(effectiveCurrentPlan, dto.planType)) {
      // Permite downgrade via checkout apenas se a assinatura atual está em
      // CANCELLATION_LOCK e o destino é realmente um plano inferior.
      const lockedSub = await prisma.subscription.findFirst({
        where: {
          userId,
          status: 'CANCELLATION_LOCK',
          planType: effectiveCurrentPlan as never,
        },
      })
      const isDowngradeFromLockedPlan =
        lockedSub != null &&
        PLAN_HIERARCHY[dto.planType] < PLAN_HIERARCHY[lockedSub.planType as PlanType]

      if (!isDowngradeFromLockedPlan) {
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

    // Criar subscription PENDING.
    // FU-023-2: o INSERT colide com o indice unico parcial M060
    // (subscriptions_user_plan_pending_active_uq em (user_id, plan_type) WHERE status IN
    // ('PENDING','ACTIVE')) quando duas requisicoes concorrentes do mesmo (userId, planType)
    // passam ambas pela guarda de idempotencia antes de qualquer INSERT. O Prisma sinaliza isso
    // como P2002; SubscriptionService.createSubscription ja o traduz para PAYMENT_054/409 no ponto
    // do INSERT. Aqui mantemos uma malha de seguranca caso o P2002 cru escape de outro caminho:
    // traduzimos para o mesmo 409 CONFLICT em vez de deixar vazar como 500/DECLINED generico
    // (anti dupla-cobranca + Zero Silencio).
    let subscription: Awaited<ReturnType<typeof subscriptionService.createSubscription>>
    try {
      subscription = await subscriptionService.createSubscription({
        userId,
        planType: dto.planType,
        gateway: dto.gateway,
        period: dto.period.toUpperCase(),
        amount,
        startsAt: now,
        expiresAt,
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw Object.assign(
          new Error('Já existe uma assinatura pendente ou ativa para este plano'),
          { code: 'PAYMENT_054', statusCode: 409 }
        )
      }
      throw err
    }

    // FU-023-5: no caminho Pix a rota faz POST /v1/payments direto e nao consome redirectUrl.
    // Pular a preferencia do gateway (/checkout/preferences) evita preference + merchant_order
    // orfaos. Cartao/redirect continuam criando a preferencia normalmente.
    if (dto.skipGatewayCheckout) {
      return { redirectUrl: '', subscriptionId: subscription.id }
    }

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
        userEmail:   dto.userEmail ?? user?.email ?? '',
        ...buildGatewayReturnUrls(appUrl, subscription.id, dto.planType),
      }
      const result = await gateway.createCheckout(input)
      redirectUrl = result.redirectUrl
    } catch (err) {
      // Subscription permanece PENDING — não excluir (para auditoria).
      // FU-023-4: propagar codigo/statusCode ORIGINAL do gateway em vez de achatar tudo para
      // DECLINED/422. Um erro de config (PAYMENT_010/500) ou indisponibilidade (PAYMENT_050/503)
      // nao deve virar 422 (que sinaliza "verifique seus dados") — semantica e status corretos
      // permitem a UI e o webhook/cron distinguirem falha do cliente de falha de infra.
      const code = (err as { code?: unknown }).code
      const statusCode = (err as { statusCode?: unknown }).statusCode
      if (typeof code === 'string' && typeof statusCode === 'number') {
        const message = err instanceof Error ? err.message : String(err)
        throw Object.assign(new Error(message), { code, statusCode })
      }
      throwPaymentError('DECLINED', String(err))
    }

    return { redirectUrl: redirectUrl!, subscriptionId: subscription.id }
  }

  /**
   * Ativa plano após confirmação de webhook — operação idempotente.
   * `paymentRef` = identificador do PAGAMENTO que confirmou esta ativação
   * (gatewayTransactionId no webhook, paymentId na recuperação MP). É o
   * occurrence_marker de `pagamento_confirmado` (ver Task 11 > "Idempotencia":
   * occurrence_marker = paymentId para pagamento_*). Sem ele, uma renovação que
   * reativa a MESMA subscription (dunning/FIX-01) colidiria na idempotency_key da
   * ativação original e o cliente não receberia a confirmação da renovação
   * (Zero Silêncio). Opcional para retrocompat; ausente cai no subscriptionId.
   */
  async upgradeUser(userId: string, subscriptionId: string, paymentRef?: string): Promise<UpgradeResult> {
    const [subscription, user] = await Promise.all([
      prisma.subscription.findUnique({ where: { id: subscriptionId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { planType: true, adminRole: true } }),
    ])

    if (!subscription) {
      throwPaymentError('NOT_FOUND', `subscriptionId=${subscriptionId} não encontrada`)
    }

    // Defesa contra IDs cruzados: ativar/cancelar deve operar só na assinatura do próprio
    // usuário. Sem isto, uma chamada com (userId=A, subscriptionId=B) cancelaria as ACTIVE de A
    // e ativaria a assinatura de B.
    if (subscription.userId !== userId) {
      throwPaymentError(
        'NOT_FOUND',
        `subscriptionId=${subscriptionId} não pertence a userId=${userId}`
      )
    }

    if (user?.adminRole) {
      // C5 (task-008): condição PERMANENTE — uma conta admin não vira não-admin por reenvio.
      // O marcador `retryable: false` permite ao webhook tratá-la como terminal e quebrar o
      // loop de 503, em vez de string-matchar o code. A política a montante (bloquear no
      // checkout ou permitir admin assinar) depende da decisão da task-001/task-004.
      throw Object.assign(new Error('Contas administrativas não podem ter assinatura ativa.'), {
        code: 'AUTH-009',
        statusCode: 403,
        retryable: false,
      })
    }

    // Idempotência: já ACTIVE → skip silencioso (PAYMENT_052)
    if (subscription.status === 'ACTIVE') return 'ALREADY_ACTIVE'

    // R3-guard: não reativar assinatura em estado terminal a partir de webhook atrasado.
    // PENDING (primeira cobrança) e PAST_DUE/TRIAL/TRIALING (recuperação de dunning/trial)
    // permanecem ativáveis; CANCELLED/EXPIRED/SUSPENDED/CANCELLATION_LOCK não devem voltar
    // a ACTIVE por um PAYMENT_CONFIRMED tardio (reversão de cancelamento tem fluxo próprio).
    const NON_ACTIVATABLE_STATUSES = ['CANCELLED', 'EXPIRED', 'SUSPENDED', 'CANCELLATION_LOCK']
    // ST006 — estados não-ACTIVE a partir dos quais um pagamento confirmado pode ativar a
    // assinatura: a cobrança inicial (PENDING) e a recuperação de dunning/trial
    // (PAST_DUE/TRIAL/TRIALING). Espelha o conjunto ativável do guard de estado terminal acima.
    const ACTIVATABLE_RECOVERY_STATUSES = ['PENDING', 'PAST_DUE', 'TRIAL', 'TRIALING']
    if (NON_ACTIVATABLE_STATUSES.includes(subscription.status)) {
      console.warn(
        `[PlanService.upgradeUser] Ignorando ativação de assinatura em estado terminal: ` +
        `subscriptionId=${subscriptionId} status=${subscription.status}`
      )
      return 'NOT_ACTIVATABLE'
    }

    // G-02: registrar plano anterior para cálculo de bônus diferencial em T+7
    const previousPlanType = user?.planType ?? null
    const effectivePreviousPlanType = (previousPlanType ?? 'JOGADOR') as PlanType
    const targetPlanType = subscription.planType as PlanType

    // Downgrade pago só continua válido enquanto a assinatura superior ainda está
    // em CANCELLATION_LOCK. Se o usuário reverteu a LENDA antes do webhook da
    // CRAQUE chegar, a PENDING fica obsoleta e não pode derrubar o plano restaurado.
    if (
      PLAN_HIERARCHY[targetPlanType] < PLAN_HIERARCHY[effectivePreviousPlanType]
    ) {
      const lockedSub = await prisma.subscription.findFirst({
        where: {
          userId,
          status: 'CANCELLATION_LOCK',
          planType: effectivePreviousPlanType as never,
        },
        select: { id: true, planType: true },
      })
      if (!lockedSub) {
        // ST006 — cobrir todos os estados ativáveis-por-recuperação, não só PENDING. Uma
        // subscription PAST_DUE/TRIAL obsoleta (cujo plano superior já foi restaurado) precisa
        // ser cancelada aqui; antes, com o filtro só-PENDING, ela escapava do cancelamento e
        // caía na transação de ativação (que aceita PAST_DUE/TRIAL), aplicando um downgrade
        // obsoleto que derrubava o plano restaurado.
        await prisma.subscription.updateMany({
          where: {
            id: subscriptionId,
            userId,
            status: { in: ACTIVATABLE_RECOVERY_STATUSES as never[] },
          },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        })
        console.warn(
          `[PlanService.upgradeUser] Downgrade obsoleto ignorado: ` +
          `subscriptionId=${subscriptionId} currentPlan=${effectivePreviousPlanType} ` +
          `targetPlan=${targetPlanType} status=${subscription.status}`
        )
        return 'NOT_ACTIVATABLE'
      }
    }

    const isUpgrade = PLAN_HIERARCHY[targetPlanType] > PLAN_HIERARCHY[effectivePreviousPlanType]

    // Calcular bônus diferencial (apenas upgrades elegíveis)
    const upgradeBonusAmount = isUpgrade
      ? calcUpgradeBonusAmount(effectivePreviousPlanType, targetPlanType)
      : 0
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    // R3: encerrar assinaturas ACTIVE anteriores na MESMA transação + preservar bônus pendente.
    // Estes valores são preenchidos dentro da transação (leitura consistente).
    let scheduledBonusAmount = upgradeBonusAmount
    let bonusScheduleDate = sevenDaysFromNow

    await prisma.$transaction(async (tx) => {
      // Assinaturas abertas anteriores deste usuário (qualquer plano), exceto a que está sendo ativada.
      // CANCELLATION_LOCK substituída por downgrade pago deve sair do ciclo T+7d.
      // (A liquidação forçada T+48h foi descontinuada — FIX-10/FU-023-3 — e não há
      // mais cron dependente de forcedLiquidationAt.)
      const priorOpen = await tx.subscription.findMany({
        where: { userId, status: { in: ['ACTIVE', 'CANCELLATION_LOCK'] as never[] }, id: { not: subscriptionId } },
        select: {
          id: true,
          status: true,
          cancelledAt: true,
          bonusAmount: true,
          bonusScheduledAt: true,
          bonusCreditedAt: true,
        },
      })

      for (const prior of priorOpen) {
        // Preservar bônus pendente (agendado e ainda não creditado): rolar para a nova assinatura.
        // bonus-credit só credita status=ACTIVE, então sem isto o bônus da assinatura anterior
        // seria perdido (ex.: upgrade CRAQUE->LENDA cairia de 23000 para 20000).
        const isPendingBonus = prior.bonusScheduledAt !== null && prior.bonusCreditedAt === null
        if (isPendingBonus) {
          scheduledBonusAmount += prior.bonusAmount ? Number(prior.bonusAmount) : 0
          if (prior.bonusScheduledAt && prior.bonusScheduledAt < bonusScheduleDate) {
            bonusScheduleDate = prior.bonusScheduledAt // manter a promessa de data mais cedo
          }
        }

        // Semântica "superseded by upgrade": CANCELLED + cancelledAt encerra a assinatura sem
        // refund nem notificação de cancelamento. Marcar bonusCreditedAt evita qualquer
        // crédito futuro caso o filtro do bonus-credit mude (o valor já foi transferido).
        await tx.subscription.update({
          where: { id: prior.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: prior.cancelledAt ?? new Date(),
            cancellationLockStartedAt: null,
            cancellationLockExpiresAt: null,
            bonusScheduledAt: null,
            bonusCreditedAt: isPendingBonus ? new Date() : prior.bonusCreditedAt,
          },
        })
      }

      const hasBonusToScheduleTx = scheduledBonusAmount > 0
      // Revalidação de status DENTRO da transação (fecha corrida ativação x refund/cancelamento).
      // O status lido fora da tx pode ter mudado: um refund concorrente que setou CANCELLED
      // seria sobrescrito de volta a ACTIVE por um where:{id} cego. O guard notIn garante
      // que só ativamos se a assinatura ainda está num estado ativável; count=0 aborta a tx.
      const activated = await tx.subscription.updateMany({
        where: {
          id: subscriptionId,
          userId,
          status: { notIn: [...NON_ACTIVATABLE_STATUSES, 'ACTIVE'] as never[] },
        },
        data: {
          status:           'ACTIVE',
          previousPlanType: isUpgrade ? effectivePreviousPlanType as never : null, // G-02
          bonusScheduledAt: hasBonusToScheduleTx ? bonusScheduleDate : null,
          bonusAmount:      hasBonusToScheduleTx ? scheduledBonusAmount : null,
        },
      })
      if (activated.count !== 1) {
        throw Object.assign(
          new Error(
            `[PlanService.upgradeUser] Ativação abortada: assinatura ${subscriptionId} ` +
            `mudou de estado durante a transação (provável refund/cancelamento concorrente).`
          ),
          { code: 'PAYMENT_ACTIVATION_RACE', statusCode: 409 }
        )
      }
      await tx.user.update({
        where: { id: userId },
        data:  { planType: subscription.planType },
      })
    })

    const hasBonusToSchedule = scheduledBonusAmount > 0

    // Notificação real (FIX-25) — persiste + email best-effort, idempotente POR PAGAMENTO.
    // occurrence_marker = paymentRef (paymentId/gatewayTransactionId), não subscriptionId:
    // a renovação reativa a mesma subscription (dunning/FIX-01) mas é um pagamento NOVO, então
    // precisa de uma idempotency_key nova para não ser deduplicada (Zero Silêncio em renovação).
    // Fallback ao subscriptionId só quando o call site não conhece o pagamento (retrocompat).
    await notificationService.notify({
      type:     'pagamento_confirmado',
      userId,
      entityId: paymentRef ?? subscriptionId,
      payload: {
        planType: subscription.planType,
        amount:   subscription.amount,
        subscriptionId,
        paymentRef,
      },
    })

    // Notificação de bônus agendado — quando há bônus a creditar (diferencial + pendente preservado)
    if (hasBonusToSchedule) {
      const bonusDate = bonusScheduleDate.toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
      await prisma.notification.create({
        data: {
          userId,
          type: 'BONUS_SCHEDULED',
          title: 'Bônus de upgrade agendado',
          body: `Seu bônus de FS$ ${scheduledBonusAmount.toLocaleString('pt-BR')} será creditado em ${bonusDate}.`,
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

    return 'ACTIVATED'
  }

  /**
   * Reconciliacao de pagamento aprovado SEM webhook (recuperacao). Resolve o status real do
   * pagamento no gateway por paymentId; se 'approved', valida gateway + valor da subscription e
   * reusa o MESMO caminho idempotente do webhook (upgradeUser + payment.upsert por
   * gatewayTransactionId). Seguro para reexecutar: upgradeUser retorna ALREADY_ACTIVE quando ja
   * ativo e o upsert dedupa por transacao. Consumido pelo endpoint admin de replay e pelo cron
   * reconcile-payments. Fecha o gap residual do bug do HMAC (item 12): antes, upgradeUser so era
   * acionado pelo webhook, sem fallback. So Mercado Pago por ora (gateway do incidente).
   */
  async reconcileApprovedPayment(
    gateway: GatewayType,
    paymentId: string
  ): Promise<
    | { ok: true; action: 'ACTIVATED' | 'ALREADY_ACTIVE'; subscriptionId: string; userId: string }
    | { ok: false; reason: string; detail?: string }
  > {
    if (gateway !== GatewayType.MERCADO_PAGO) {
      return { ok: false, reason: 'GATEWAY_NOT_SUPPORTED', detail: String(gateway) }
    }
    const gw = getGateway(gateway) as unknown as {
      getPaymentDetails(
        id: string
      ): Promise<{ status?: string; externalReference?: string; amount?: number; liveMode?: boolean } | null>
    }
    const details = await gw.getPaymentDetails(paymentId)
    if (!details) return { ok: false, reason: 'PAYMENT_STATUS_UNRESOLVED' }
    // Defesa em profundidade (espelha o webhook, commit 0837831): nunca ativar plano a partir de
    // um pagamento de TESTE do MP (live_mode=false). Rejeitar apenas quando explicitamente false.
    if (details.liveMode === false) {
      return { ok: false, reason: 'TEST_PAYMENT', detail: 'live_mode=false' }
    }
    if (details.status !== 'approved') {
      return { ok: false, reason: 'PAYMENT_NOT_APPROVED', detail: details.status ?? 'desconhecido' }
    }
    const subscriptionId = details.externalReference ?? ''
    if (!subscriptionId) return { ok: false, reason: 'NO_EXTERNAL_REFERENCE' }

    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { userId: true, amount: true, gateway: true, planType: true },
    })
    if (!subscription) return { ok: false, reason: 'SUBSCRIPTION_NOT_FOUND', detail: subscriptionId }
    if (String(subscription.gateway) !== 'MERCADO_PAGO') {
      return { ok: false, reason: 'GATEWAY_MISMATCH', detail: String(subscription.gateway) }
    }
    // Hardening: valor pago bate com o da subscription (tolerancia +-1 centavo), igual ao webhook.
    const paidCents = details.amount ? Math.round(details.amount * 100) : 0
    if (Math.abs(paidCents - Number(subscription.amount)) > 1) {
      return {
        ok: false,
        reason: 'AMOUNT_MISMATCH',
        detail: `pago=${paidCents} esperado=${Number(subscription.amount)}`,
      }
    }

    let upgradeResult: UpgradeResult
    try {
      upgradeResult = await this.upgradeUser(subscription.userId, subscriptionId, paymentId)
    } catch (err) {
      const code = (err as { code?: string })?.code ?? 'UPGRADE_ERROR'
      return { ok: false, reason: code, detail: err instanceof Error ? err.message : String(err) }
    }
    if (upgradeResult === 'NOT_ACTIVATABLE') {
      return { ok: false, reason: 'NOT_ACTIVATABLE', detail: subscriptionId }
    }

    // Efeitos pos-ativacao compartilhados com o webhook (Payment + bonus de liga + analytics +
    // comissao de afiliado), idempotentes. Garante que um pagamento recuperado fora do webhook
    // gere os MESMOS efeitos (item 12), nao apenas a ativacao do plano.
    await this.applyPaymentConfirmedEffects({
      userId: subscription.userId,
      subscriptionId,
      amountCents: paidCents,
      gateway: subscription.gateway,
      gatewayTransactionId: paymentId,
      planType: subscription.planType as 'CRAQUE' | 'LENDA',
    })

    return {
      ok: true,
      action: upgradeResult === 'ALREADY_ACTIVE' ? 'ALREADY_ACTIVE' : 'ACTIVATED',
      subscriptionId,
      userId: subscription.userId,
    }
  }

  /**
   * Efeitos pos-ativacao de um pagamento confirmado, compartilhados entre o webhook e a
   * reconciliacao server-side (replay/cron): registro de Payment, bonus de liga PLAN_UPGRADED,
   * analytics payment_completed e comissao de afiliado. O Payment.upsert e sempre idempotente
   * por gatewayTransactionId; os efeitos best-effort (liga/analytics/comissao) so disparam na
   * PRIMEIRA consolidacao do pagamento (gate por status PAID previo) para nao duplicar em replay.
   *
   * FIX-05 (atomicidade + sinal observavel): o Payment.upsert e a criacao da comissao de afiliado
   * (AffiliateTransaction PENDING — a fila de reconciliacao consumida pelo cron
   * affiliate-commission) acontecem na MESMA `$transaction`. Antes, a comissao rodava DEPOIS do
   * upsert e qualquer falha era engolida por um `console.error`: o Payment ficava PAID mas a
   * comissao do afiliado sumia em silencio (perda de receita irrecuperavel). Agora, se a comissao
   * falhar ao persistir, a transacao inteira faz rollback e webhook/cron reprocessam de forma
   * idempotente (payment.upsert por gatewayTransactionId, upgradeUser -> ALREADY_ACTIVE,
   * createMany skipDuplicates), e a falha vira sinal observavel (Sentry + log [ALERT]) ao inves
   * de desaparecer. Efeitos externos nao-DB (liga/analytics) ficam FORA da transacao.
   */
  async applyPaymentConfirmedEffects(params: {
    userId: string
    subscriptionId: string
    amountCents: number
    gateway: SubscriptionGateway
    gatewayTransactionId: string
    planType: 'CRAQUE' | 'LENDA'
  }): Promise<void> {
    const { userId, subscriptionId, amountCents, gateway, gatewayTransactionId, planType } = params

    const existing = await prisma.payment.findUnique({
      where: { gatewayTransactionId },
      select: { status: true },
    })
    const firstConsolidation = existing?.status !== 'PAID'

    // Atomiza Payment.upsert + comissao de afiliado. Falha na comissao -> rollback do Payment ->
    // reprocessamento idempotente (zero perda silenciosa). A comissao so e criada na primeira
    // consolidacao para nao duplicar em replay/cron.
    let commission: AffiliateCommissionResult = null
    try {
      commission = await prisma.$transaction(async (trx) => {
        await trx.payment.upsert({
          where: { gatewayTransactionId },
          update: { status: 'PAID', processedAt: new Date() },
          create: {
            userId,
            subscriptionId,
            amount: amountCents,
            gateway,
            gatewayTransactionId,
            status: 'PAID',
            processedAt: new Date(),
          },
        })

        if (!firstConsolidation) return null

        return this.processAffiliateCommission(
          {
            userId,
            subscriptionId,
            subscriptionAmount: amountCents,
            gatewayTransactionId,
            planType,
          },
          trx
        )
      })
    } catch (err) {
      // Zero Silencio: a comissao de afiliado nao pode falhar despercebida. Eleva o antigo
      // console.error a sinal OBSERVAVEL (Sentry.captureException + log [ALERT] estruturado) e
      // RE-LANCA para que webhook/cron reprocessem atomicamente — o rollback ja preservou a
      // consistencia (Payment + comissao all-or-nothing).
      captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { area: 'affiliate_commission', signal: 'ALERT' },
        userId,
        subscriptionId,
        gatewayTransactionId,
        planType,
      })
      console.error(
        `[PlanService][ALERT] Falha atomica Payment+comissao de afiliado — rollback aplicado, ` +
          `reprocessamento idempotente esperado. userId=${userId} subscriptionId=${subscriptionId} ` +
          `transactionId=${gatewayTransactionId}`,
        err
      )
      throw err
    }

    // Best-effort apenas na primeira consolidacao do pagamento — evita duplicar bonus de liga,
    // analytics e comissao quando o replay/cron reprocessa um pagamento que o webhook ja tratou.
    // Efeitos externos (nao-DB) ficam FORA da transacao para nao bloquear nem participar do rollback.
    if (!firstConsolidation) return

    leagueEventRecorder
      .recordForAllActiveLeagues(userId, 'PLAN_UPGRADED', { planType })
      .catch(() => {})

    const paidCount = await prisma.payment.count({ where: { userId, status: 'PAID' } })
    mixpanelServer.trackPaymentCompleted(userId, {
      plan: planType,
      gateway,
      is_first_payment: paidCount <= 1,
    })

    if (commission) {
      mixpanelServer.trackAffiliateConversion(commission.affiliateUserId, {
        affiliateCode: commission.affiliateCode,
        affiliateType: commission.affiliateType,
        plan: planType,
        commissionAmount: commission.commissionAmount.toFixed(2),
      })
    }
  }

  /**
   * Cria AffiliateTransaction (PENDING) quando um assinante referido confirma pagamento.
   * Idempotente: o dedup real e o `@unique` em `gatewayTransactionId` no banco (uma comissao
   * por evento de pagamento) combinado com `skipDuplicates=true`. NAO existe constraint composta
   * (affiliateCodeId, subscriptionId, transactionType) — a chave de idempotencia e a transacao do
   * gateway, que por isso e obrigatoria (assert non-null antes do write): em Postgres multiplos
   * NULL nao colidem, entao gravar a comissao sem a chave reintroduziria duplicidade sob replay.
   * Movido da rota do webhook para ser reusado pela reconciliacao server-side (item 12).
   *
   * FIX-05: aceita um client `db` (default `prisma`) para rodar dentro da `$transaction` de
   * `applyPaymentConfirmedEffects` (atomicidade com o Payment.upsert). NAO engole erros — deixa
   * a excecao propagar para que a transacao faca rollback e o caller emita o sinal observavel +
   * reprocesse. Retorna os dados da conversao (ou `null` quando nao ha comissao a creditar) para
   * que o caller dispare o evento de analytics FORA da transacao.
   *
   * Unidades: `subscriptionAmount` chega em CENTAVOS; `amount` gravado fica em FS$ (1 FS$ = R$1).
   */
  private async processAffiliateCommission(
    params: {
      userId: string
      subscriptionId: string
      /** Valor da assinatura em CENTAVOS (amountCents). Convertido para reais antes do pct. */
      subscriptionAmount: number
      gatewayTransactionId?: string
      planType: 'CRAQUE' | 'LENDA'
    },
    db: Prisma.TransactionClient | typeof prisma = prisma
  ): Promise<AffiliateCommissionResult> {
    const { userId, subscriptionId, subscriptionAmount, gatewayTransactionId } = params
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { referredByCode: true },
    })
    if (!user?.referredByCode) return null

    const affiliateCode = await db.affiliateCode.findFirst({
      where: {
        code: user.referredByCode,
        active: true,
        affiliateType: { in: ['TIME_PARCEIRO', 'INFLUENCIADOR'] },
      },
      select: {
        id: true,
        userId: true,
        commissionPercentage: true,
        affiliateType: true,
        code: true,
      },
    })
    if (!affiliateCode) return null
    // Auto-referencia: afiliado nao ganha comissao de si mesmo.
    if (affiliateCode.userId === userId) return null

    const commissionPct = Number(affiliateCode.commissionPercentage)
    // subscriptionAmount chega em CENTAVOS (amountCents). A comissao gravada em
    // AffiliateTransaction.amount e denominada em FS$ (1 FS$ = R$1) e creditada
    // direto no fsBalance pelo cron affiliate-commission, entao converte
    // centavos -> reais ANTES de aplicar o pct. Ex: R$39,90 (3990c) @ 10% -> 3,99 FS$.
    const subscriptionAmountReais = subscriptionAmount / 100
    const commissionAmount = Math.round(subscriptionAmountReais * commissionPct * 100) / 100
    if (commissionAmount <= 0) return null

    // FIX-16: assert non-null da chave de idempotencia. O unico dedup da comissao e o `@unique`
    // de gatewayTransactionId; gravar com a chave ausente (NULL) reintroduziria duplicidade sob
    // replay (multiplos NULL nao colidem no Postgres). Sem a chave a transacao falha (rollback +
    // sinal observavel no caller) em vez de criar uma comissao nao-deduplicavel.
    if (!gatewayTransactionId) {
      throw new Error(
        '[PlanService] processAffiliateCommission: gatewayTransactionId ausente — chave de ' +
          'idempotencia obrigatoria para a comissao de afiliado (dedup via @unique no banco).'
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.affiliateTransaction as any).createMany({
      data: [
        {
          affiliateCodeId: affiliateCode.id,
          referredUserId: userId,
          subscriptionId,
          gatewayTransactionId,
          transactionType: 'SUBSCRIPTION_RENEWAL',
          amount: commissionAmount,
          commissionPercentageAtTime: commissionPct,
          status: 'PENDING',
        },
      ],
      skipDuplicates: true,
    })

    return {
      affiliateUserId: affiliateCode.userId,
      affiliateCode: affiliateCode.code,
      affiliateType: affiliateCode.affiliateType as string,
      commissionAmount,
    }
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
