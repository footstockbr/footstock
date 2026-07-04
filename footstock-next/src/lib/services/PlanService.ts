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
  calcUpgradeBonusAmount,
  calcProRataResidualCents,
  residualToFsCredit,
  UPGRADE_PRORATION_FS_MULTIPLIER,
  type SubscriptionForLogic,
} from './plan-logic'
import {
  createUpgradeProrationRefundOutbox,
  executeUpgradeProrationRefund,
  isUpgradeProrationRefundEnabled,
  upgradeProrationRefundFloorCents,
  type UpgradeProrationRefundIntent,
} from './upgrade-proration'
import { throwPaymentError } from '@/lib/errors/payment-errors'
import { notificationService } from '@/lib/notifications'
import { PLAN_HIERARCHY, type PlanType } from '@/lib/enums'
import { getGateway } from '@/lib/gateways/GatewayFactory'
import { GatewayType } from '@/lib/gateways/IGateway'
import type { GatewayCheckoutInput, GatewaySubscriptionInput } from '@/lib/gateways/IGateway'
import { isRecurringEnabled } from '@/lib/gateways/recurring-flag'
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
  // M066 — consent log da tela de disclosure do upgrade (CDC 6º III/31 + Dec. 7.962/2013):
  // snapshot do que foi EXIBIDO ao usuário antes do clique. Persistido em
  // Subscription.upgradeProrationMeta.consent; fundido com a memória de cálculo na ativação.
  upgradeConsent?: { shownAt: string; snapshot?: Record<string, unknown> }
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

/**
 * Sentinela interno de applyRenewalCycle: a assinatura saiu do estado recuperável (CANCELLED/
 * CANCELLATION_LOCK ou CAS count 0) durante a transação. Lançado DENTRO da $transaction para forçar
 * ROLLBACK (não credita Payment nem estende), traduzido para 'RACE_CANCELLED' pelo chamador.
 */
class RenewalRaceError extends Error {
  constructor() {
    super('RENEWAL_RACE_CANCELLED')
    this.name = 'RenewalRaceError'
  }
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

    // Player sem planType (estado transitório pos-registro) trata como JOGADOR.
    const effectiveCurrentPlan = (user?.planType ?? 'JOGADOR') as PlanType
    // BUG CRÍTICO corrigido: o guard antigo usava `!canUpgrade(...)`, que é TRUE para o MESMO tier
    // (canUpgrade(CRAQUE,CRAQUE)=false). Assim, RENOVAR/RE-ASSINAR o próprio plano após ele expirar
    // (planType ainda CRAQUE/LENDA, mas SEM assinatura ACTIVE — janela de graça) caía em PAYMENT_054
    // "não é possível fazer downgrade" (copy catastroficamente errada) e o usuário NÃO conseguia
    // pagar para restaurar o acesso — bloqueio da venda no momento em que ele mais quer pagar.
    // Agora bloqueamos APENAS downgrade REAL (destino estritamente INFERIOR ao plano vigente).
    // Mesmo-tier (renovação) e upgrade seguem: existingActive (ORDER_081) + recuperação de PENDING
    // a jusante tratam a duplicidade quando há assinatura viva.
    const isRealDowngrade =
      user != null && PLAN_HIERARCHY[dto.planType] < PLAN_HIERARCHY[effectiveCurrentPlan]
    if (isRealDowngrade) {
      // Downgrade via checkout só é permitido a partir de CANCELLATION_LOCK do plano atual
      // para um destino realmente inferior.
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

    // M066 — guard anti-ciclagem (estudo upgrade-pricing 2026-07-03): 1 mudança de plano por
    // CICLO. Sem isto, ciclagem up/down repetida farmaria o crédito pró-rata multiplicado
    // (FS$ 1.2x/1.3x). Guard POR CICLO, nunca one-time-ever (lição da classe de lockouts com
    // guards one-time): detecta que a sub ACTIVE atual nasceu de uma troca (previousPlanType)
    // dentro do ciclo corrente (startsAt >= cycleStart). Após a RENOVAÇÃO (currentPeriodStart
    // avança além do startsAt), a troca volta a ser permitida automaticamente.
    let activeCurrentForUpgrade: {
      previousPlanType: unknown
      startsAt: Date
      expiresAt: Date | null
      currentPeriodStart: Date | null
      currentPeriodEnd: Date | null
      amount: number
    } | null = null
    if (effectiveCurrentPlan !== 'JOGADOR' && dto.planType !== effectiveCurrentPlan) {
      const activeCurrent = await prisma.subscription.findFirst({
        where: { userId, status: 'ACTIVE', planType: effectiveCurrentPlan as never },
        select: {
          previousPlanType: true,
          startsAt: true,
          expiresAt: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          amount: true,
        },
      })
      activeCurrentForUpgrade = activeCurrent
      if (activeCurrent?.previousPlanType) {
        const nowGuard = new Date()
        const cycleStart = activeCurrent.currentPeriodStart ?? activeCurrent.startsAt
        const cycleEnd = activeCurrent.currentPeriodEnd ?? activeCurrent.expiresAt
        const changedThisCycle =
          cycleStart != null &&
          cycleEnd != null &&
          nowGuard < cycleEnd &&
          activeCurrent.startsAt >= cycleStart
        if (changedThisCycle) {
          const nextChange = cycleEnd.toLocaleDateString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
          throw Object.assign(
            new Error(
              `Você pode alterar seu plano 1 vez por ciclo. Próxima troca disponível em ${nextChange}.`
            ),
            { code: 'PAYMENT_PLAN_CHANGE_LIMIT', statusCode: 429 }
          )
        }
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Recuperação de PENDING órfão (anti-lockout) — correção do incidente PAYMENT_054.
    //
    // CAUSA RAIZ: o índice único parcial M060 (subscriptions_user_plan_pending_active_uq)
    // bloqueia (user_id, plan_type) sobre status IN ('PENDING','ACTIVE') SEM filtro de
    // período e SEM filtro de tempo. A guarda de idempotência antiga reutilizava apenas
    // PENDING com createdAt>=5min E MESMO período — um predicado MAIS ESTREITO que o índice.
    // Resultado: qualquer PENDING abandonado (mais velho que 5min, OU de período diferente
    // mesmo dentro de 5min — ex.: trocou mensal->anual) não era reutilizado; o INSERT colidia
    // (P2002) e o checkout devolvia PAYMENT_054 ("plano não disponível a partir do seu plano
    // atual"). Como nenhum cron expira PENDING órfão, o (user, plano) ficava travado PARA
    // SEMPRE — o usuário não conseguia mais assinar. Aqui buscamos QUALQUER PENDING aberto de
    // (userId, planType) — exatamente a chave do índice — e decidimos por recuperabilidade.
    const openPending = await prisma.subscription.findFirst({
      where: { userId, planType: dto.planType as never, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, period: true, createdAt: true, billingMode: true, gatewaySubscriptionId: true, gateway: true },
    })
    if (openPending) {
      const isFresh = Date.now() - openPending.createdAt.getTime() < 5 * 60 * 1000
      const samePeriod = openPending.period === (dto.period.toUpperCase() as never)
      const holdsGatewaySub =
        openPending.billingMode === 'recurring' && openPending.gatewaySubscriptionId != null

      // (a) REUSE — PENDING FRESCO do MESMO período: o usuário pode estar concluindo a autorização
      //     agora (double-click / retry / lag de webhook). Vale para one-time E recorrente:
      //     reutilizar evita 2º preapproval e devolve o mesmo redirect de pendência (idempotência
      //     anti dupla-cobrança). NÃO é bloqueio — é a mesma tentativa.
      if (isFresh && samePeriod) {
        const redirectUrl = `${env.NEXT_PUBLIC_APP_URL}/planos?payment=pending&sub=${openPending.id}`
        return { redirectUrl, subscriptionId: openPending.id }
      }

      // (b) SUPERSEDE — PENDING ABANDONADO (stale) OU de período diferente. O usuário NÃO concluiu
      //     e TEM que poder tentar de novo. (BUG CRÍTICO corrigido aqui: o antigo `|| holdsGatewaySub`
      //     reutilizava INCONDICIONALMENTE, então um PENDING recorrente abandonado — com preapproval
      //     no gateway — bloqueava a assinatura PARA SEMPRE, matando a venda.) Recorrente com
      //     preapproval real exige NEUTRALIZAR o preapproval no gateway ANTES de liberar o lock
      //     único M060, senão o preapproval fica órfão e pode cobrar (cobrança-fantasma).
      if (holdsGatewaySub && openPending.gatewaySubscriptionId) {
        const oldGateway = getGateway(resolveGatewayType(openPending.gateway))

        // Anti-double-charge: se o preapproval FOI autorizado (webhook atrasado), o usuário JÁ
        // pagou/tem o plano — NUNCA cancelar/superseder um autorizado. Devolve o redirect de
        // pendência (transitório: webhook/reconcile ativa em ACTIVE). Só 'authorized' bloqueia o
        // supersede; 'pending'/'cancelled' seguem para o cancelamento terminal.
        let gatewaySubStatus: string | null = null
        try {
          const q = oldGateway as unknown as { getSubscriptionStatus?: (id: string) => Promise<{ status: string | null }> }
          gatewaySubStatus = q.getSubscriptionStatus
            ? (await q.getSubscriptionStatus(openPending.gatewaySubscriptionId)).status
            : null
        } catch {
          // FALHA transitória ao consultar o status: NÃO superseder às cegas. Se o preapproval
          // estiver 'authorized' (já pago) e cancelássemos, geraríamos DUPLA COBRANÇA. Fail-closed:
          // 503 retry — o usuário tenta de novo em instantes, quando o gateway responder o status.
          throw Object.assign(
            new Error('Não foi possível verificar sua tentativa anterior no provedor de pagamento. Tente novamente em instantes.'),
            { code: 'PAYMENT_SUPERSEDE_RETRY', statusCode: 503 },
          )
        }
        if (gatewaySubStatus === 'authorized') {
          const redirectUrl = `${env.NEXT_PUBLIC_APP_URL}/planos?payment=pending&sub=${openPending.id}`
          return { redirectUrl, subscriptionId: openPending.id }
        }

        // Preapproval DEFINITIVAMENTE MORTO ('cancelled' OU 'not_found'/404): não há nada vivo a
        // cancelar — ir DIRETO ao supersede local. Sem este short-circuit, um preapproval morto faria
        // getSubscriptionStatus/cancelSubscriptionTerminal falhar e devolver 503 em TODA tentativa,
        // sem nunca liberar o lock único M060 = bloqueio PERMANENTE da re-assinatura (lockout).
        if (gatewaySubStatus !== 'cancelled' && gatewaySubStatus !== 'not_found') {
          // 'pending'/'paused'/indeterminado (preapproval possivelmente VIVO): cancelar TERMINALMENTE
          // antes de liberar o lock (evita órfão/cobrança-fantasma). cancelSubscriptionTerminal é
          // idempotente em 404 (cobre o TOCTOU: preapproval morre entre a checagem e o cancel). Falha
          // real = FAIL-CLOSED 503 retry — melhor bloqueio transitório que preapproval órfão cobrando.
          try {
            await oldGateway.cancelSubscriptionTerminal(openPending.gatewaySubscriptionId)
          } catch {
            throw Object.assign(
              new Error('Não foi possível liberar sua tentativa anterior no provedor de pagamento. Tente novamente em instantes.'),
              { code: 'PAYMENT_SUPERSEDE_RETRY', statusCode: 503 },
            )
          }
        }
      }

      // Supersede local (CAS: guard status:'PENDING' — uma ativação concorrente vence e não é
      // sobrescrita). Libera o lock M060 e segue para um checkout fresco.
      await prisma.subscription.updateMany({
        where: { id: openPending.id, userId, status: 'PENDING' },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      })
    }

    // Calcular amount
    const amount = dto.amount ?? calcSubscriptionAmount(dto.planType, dto.period)
    const now = new Date()
    const expiresAt = calcExpiresAt(now, dto.period)

    // Criar subscription PENDING.
    // FU-023-2: o INSERT pode colidir com o índice único parcial M060
    // (subscriptions_user_plan_pending_active_uq em (user_id, plan_type) WHERE status IN
    // ('PENDING','ACTIVE')) numa CORRIDA GENUÍNA: dois POSTs concorrentes do mesmo
    // (userId, planType) que passaram AMBOS pela recuperação acima antes de qualquer INSERT.
    // O Prisma sinaliza P2002; SubscriptionService.createSubscription o pré-traduz para
    // {code:'PAYMENT_054', statusCode:409}. Em vez de devolver PAYMENT_054 — que o frontend
    // renderiza como "plano não disponível a partir do seu plano atual" (mensagem
    // CATASTROFICAMENTE errada para um conflito de pendência) — RE-RESOLVEMOS o estado real e
    // devolvemos a resposta semanticamente correta (Zero Silêncio, anti dupla-cobrança):
    //   • PENDING vencedor → aviso de pendência (mesma UX do reuse), NUNCA um erro.
    //   • ACTIVE (ativação concorrente) → ORDER_081 "você já possui este plano ativo".
    // Assim PAYMENT_054 fica reservado EXCLUSIVAMENTE para a guarda de downgrade (422) acima,
    // para a qual a copy do frontend é correta.
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
      const isConflict =
        (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') ||
        ((err as { statusCode?: number }).statusCode === 409 &&
          (err as { code?: string }).code === 'PAYMENT_054')
      if (isConflict) {
        const winner = await prisma.subscription.findFirst({
          where: {
            userId,
            planType: dto.planType as never,
            status: { in: ['PENDING', 'ACTIVE'] as never[] },
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true },
        })
        if (winner?.status === 'PENDING') {
          const redirectUrl = `${env.NEXT_PUBLIC_APP_URL}/planos?payment=pending&sub=${winner.id}`
          return { redirectUrl, subscriptionId: winner.id }
        }
        if (winner?.status === 'ACTIVE') {
          throw Object.assign(new Error('Você já possui este plano ativo'), {
            code: 'ORDER_081',
            statusCode: 409,
          })
        }
      }
      throw err
    }

    // FU-023-5: no caminho Pix a rota faz POST /v1/payments direto e nao consome redirectUrl.
    // Pular a preferencia do gateway (/checkout/preferences) evita preference + merchant_order
    // orfaos. Cartao/redirect continuam criando a preferencia normalmente.

    // M066 — consent log do upgrade (CDC 6º III/31 + Dec. 7.962/2013): snapshot do que a
    // tela de disclosure EXIBIU antes do clique, gravado na Subscription recém-criada.
    // Fundido com a memória de cálculo do pró-rata na ativação (upgradeUser). Best-effort:
    // falha aqui não bloqueia o checkout (o consent é prova documental, não gate).
    if (dto.upgradeConsent && effectiveCurrentPlan !== 'JOGADOR' && dto.planType !== effectiveCurrentPlan) {
      await prisma.subscription
        .update({
          where: { id: subscription.id },
          data: {
            upgradeProrationMeta: {
              consent: {
                shownAt: dto.upgradeConsent.shownAt,
                // Evidência auxiliar: o que o CLIENT diz ter exibido.
                clientSnapshot: dto.upgradeConsent.snapshot ?? null,
                // Prova primária (review codex F7): recomputado SERVER-SIDE no ato do checkout —
                // nunca confiar no payload do client como memória de cálculo.
                serverSnapshot: {
                  currentPlan: effectiveCurrentPlan,
                  targetPlan: dto.planType,
                  amountDueTodayCents: amount,
                  residualCents: activeCurrentForUpgrade
                    ? calcProRataResidualCents({
                        amountCents: activeCurrentForUpgrade.amount,
                        windowStart:
                          activeCurrentForUpgrade.currentPeriodStart ?? activeCurrentForUpgrade.startsAt,
                        windowEnd:
                          activeCurrentForUpgrade.currentPeriodEnd ??
                          activeCurrentForUpgrade.expiresAt ??
                          activeCurrentForUpgrade.startsAt,
                        now: new Date(),
                      })
                    : 0,
                },
                recordedAt: new Date().toISOString(),
              },
            } as never,
          },
        })
        .catch((consentErr) =>
          console.error(
            '[createCheckout] falha ao persistir consent log do upgrade (não-bloqueante):',
            consentErr
          )
        )
    }

    if (dto.skipGatewayCheckout) {
      return { redirectUrl: '', subscriptionId: subscription.id }
    }

    // Chamar gateway via GatewayFactory (module-12)
    const appUrl = env.NEXT_PUBLIC_APP_URL
    const gatewayType = resolveGatewayType(dto.gateway)
    const gateway = getGateway(gatewayType)

    // Task 004 — Ponto de roteamento recorrente vs one-time (INV-4: flag default OFF).
    // Com recurring_enabled.{gateway} ON, o checkout cria uma assinatura recorrente real
    // (auto-renewal) no gateway via createSubscription (D1) e marca billingMode=recurring.
    // Com o flag OFF (ou ausente/erro de leitura, que isRecurringEnabled resolve para false),
    // o fluxo permanece one-time IDENTICO ao atual (createCheckout / D2). Gateways sem suporte
    // a recorrencia lancam 501 explicito (task 003); a integracao MP cartao e a task 005.
    const recurringEnabled = await isRecurringEnabled(dto.gateway)
    if (recurringEnabled) {
      try {
        const subInput: GatewaySubscriptionInput = {
          planType:    dto.planType,
          period:      dto.period,
          amount,
          currency:    'BRL',
          subscriptionId: subscription.id,
          userId,
          userEmail:   dto.userEmail ?? user?.email ?? '',
          ...buildGatewayReturnUrls(appUrl, subscription.id),
        }
        const subResult = await gateway.createSubscription(subInput)
        // Persistir identidade recorrente do gateway + billingMode (schema M061 / task 002).
        // Se a persistência falhar APÓS o preapproval já ter sido criado no gateway, ele fica
        // ÓRFÃO (existe no gateway, sem espelho local — holdsGatewaySub seria falso e o supersede
        // futuro só cancelaria localmente, deixando o preapproval vivo e cobrável). Compensar
        // cancelando-o TERMINALMENTE antes de propagar o erro (best-effort + [ALERT]).
        try {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              billingMode:           'recurring',
              gatewaySubscriptionId: subResult.gatewaySubscriptionId,
              gatewayPlanId:         subResult.gatewayPlanId ?? null,
              gatewayStatus:         subResult.status ?? null,
            },
          })
        } catch (persistErr) {
          try {
            await gateway.cancelSubscriptionTerminal(subResult.gatewaySubscriptionId)
          } catch (compErr) {
            console.error(
              `[ALERT][createCheckout] preapproval ${subResult.gatewaySubscriptionId} criado no gateway ` +
              `mas NÃO persistido E NÃO cancelado — ÓRFÃO (cancelar manualmente):`, compErr,
            )
          }
          throw persistErr
        }
        return { redirectUrl: subResult.redirectUrl, subscriptionId: subscription.id }
      } catch (err) {
        // Mesma politica do one-time (FU-023-4): propagar code/statusCode ORIGINAL do gateway
        // (inclui o 501 NOT_IMPLEMENTED dos gateways sem recorrencia) em vez de achatar para
        // DECLINED/422. Subscription permanece PENDING (billingMode one_time) para auditoria.
        const code = (err as { code?: unknown }).code
        const statusCode = (err as { statusCode?: unknown }).statusCode
        if (typeof code === 'string' && typeof statusCode === 'number') {
          const message = err instanceof Error ? err.message : String(err)
          throw Object.assign(new Error(message), { code, statusCode })
        }
        throwPaymentError('DECLINED', String(err))
      }
    }

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
        ...buildGatewayReturnUrls(appUrl, subscription.id),
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
    // Preapprovals recorrentes das assinaturas anteriores SUPERSEDED por este upgrade — coletados
    // dentro da tx, cancelados TERMINALMENTE no gateway APÓS o commit (gateway I/O nunca dentro da tx).
    const priorRecurringToCancel: Array<{ gateway: SubscriptionGateway; gatewaySubscriptionId: string }> = []
    // M066 (upgrade pró-rata): intents de estorno parcial coletados na tx e executados PÓS-commit
    // via ledger (upgrade-proration.ts) — gateway I/O nunca dentro da tx; falha nunca bloqueia a
    // ativação já paga. Quando o estorno não se aplica (flag off / abaixo do piso / sem payment
    // PAID), a compensação vira crédito FS$ 1.2x somado ao bônus T+7 (Fase 1).
    // F1 (outbox): ids do ledger criados DENTRO da tx; execução pós-commit por id.
    const prorationRefundLedgerIds: string[] = []
    // F4: o crédito FS$ do pró-rata é compensação (não bônus de retenção) — creditado
    // IMEDIATAMENTE na ativação, nunca no bonusAmount T+7 cancelável.
    let immediateProrationFs = 0
    const prorationEntries: Array<Record<string, unknown>> = []
    const nowProration = new Date()
    const refundPathEnabled = isUpgradeProrationRefundEnabled()
    const refundFloorCents = upgradeProrationRefundFloorCents()

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
          billingMode: true,
          gateway: true,
          gatewaySubscriptionId: true,
          // M066: janela real do ciclo + valor pagos alimentam o pró-rata do tempo não usado.
          amount: true,
          planType: true,
          startsAt: true,
          expiresAt: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
        },
      })

      for (const prior of priorOpen) {
        // Preapproval recorrente anterior: registrar para cancelamento TERMINAL no gateway pós-tx —
        // senão o auto-renew do plano trocado continua cobrando (double-charge / captura órfã).
        if (prior.billingMode === 'recurring' && prior.gatewaySubscriptionId) {
          priorRecurringToCancel.push({ gateway: prior.gateway, gatewaySubscriptionId: prior.gatewaySubscriptionId })
        }

        // M066 — pró-rata do tempo não usado do plano antigo (estudo 2026-07-03).
        // Janela REAL do ciclo corrente (currentPeriod* quando existem; startsAt/expiresAt no
        // 1º ciclo ou pós-reconcile). Ceil a favor do usuário (calcProRataResidualCents).
        const windowStart = prior.currentPeriodStart ?? prior.startsAt
        const windowEnd = prior.currentPeriodEnd ?? prior.expiresAt
        const residualCents =
          prior.amount > 0 && windowStart && windowEnd
            ? calcProRataResidualCents({
                amountCents: prior.amount,
                windowStart,
                windowEnd,
                now: nowProration,
              })
            : 0
        if (residualCents > 0) {
          // Estorno em dinheiro (Fase 2) exige: flag ligada + residual acima do piso + um
          // Payment PAID rastreável da assinatura antiga. Qualquer condição ausente => FS$.
          let refundIntent: UpgradeProrationRefundIntent | null = null
          if (refundPathEnabled && residualCents >= refundFloorCents) {
            const lastPaid = await tx.payment.findFirst({
              where: { subscriptionId: prior.id, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] as never[] } },
              orderBy: { createdAt: 'desc' },
              select: { id: true, gatewayTransactionId: true, amount: true, refundedAmountCents: true },
            })
            // Nunca estornar além do que resta no pagamento (estornos anteriores acumulam).
            const refundable = lastPaid ? lastPaid.amount - lastPaid.refundedAmountCents : 0
            if (lastPaid && refundable >= residualCents) {
              refundIntent = {
                newSubscriptionId: subscriptionId,
                userId,
                priorSubscriptionId: prior.id,
                priorAmountCents: prior.amount,
                paymentDbId: lastPaid.id,
                gatewayPaymentId: lastPaid.gatewayTransactionId,
                gateway: String(prior.gateway),
                residualCents,
              }
            }
          }

          if (refundIntent) {
            // OUTBOX durável (review codex F1): REQUESTED nasce NA MESMA tx do upgrade — crash
            // pós-commit deixa órfão recuperável pelo sweep, nunca promessa sem rastro.
            const ledgerId = await createUpgradeProrationRefundOutbox(
              tx as never,
              refundIntent
            )
            prorationRefundLedgerIds.push(ledgerId)
            prorationEntries.push({
              priorSubscriptionId: prior.id,
              priorPlanType: prior.planType,
              priorAmountCents: prior.amount,
              windowStart: windowStart?.toISOString() ?? null,
              windowEnd: windowEnd?.toISOString() ?? null,
              residualCents,
              compensation: 'PARTIAL_REFUND',
              refundPaymentId: refundIntent.gatewayPaymentId,
            })
          } else {
            // Fase 1: crédito FS$ (residual × 1.2) IMEDIATO (review codex F4: compensação de
            // valor pago não pode morrer com o cancelamento do bônus T+7 — bonus-credit só
            // credita status ACTIVE). Copy: "bônus promocional de migração" (nunca "reembolso").
            const fsCredit = residualToFsCredit(residualCents, UPGRADE_PRORATION_FS_MULTIPLIER)
            immediateProrationFs = Math.round((immediateProrationFs + fsCredit) * 100) / 100
            prorationEntries.push({
              priorSubscriptionId: prior.id,
              priorPlanType: prior.planType,
              priorAmountCents: prior.amount,
              windowStart: windowStart?.toISOString() ?? null,
              windowEnd: windowEnd?.toISOString() ?? null,
              residualCents,
              compensation: 'FS_CREDIT',
              fsMultiplier: UPGRADE_PRORATION_FS_MULTIPLIER,
              fsCredit,
              creditedImmediately: true,
            })
          }
        }
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
      // M066: memória de cálculo do pró-rata + consent log da tela de upgrade (gravado pelo
      // checkout em upgradeProrationMeta.consent) fundidos num único JSON — prova documental
      // (CDC art. 6º VIII: fornecedor demonstra o que informou e como calculou).
      const existingMeta =
        subscription.upgradeProrationMeta && typeof subscription.upgradeProrationMeta === 'object'
          ? (subscription.upgradeProrationMeta as Record<string, unknown>)
          : {}
      const prorationMeta =
        prorationEntries.length > 0 || Object.keys(existingMeta).length > 0
          ? {
              ...existingMeta,
              proration: {
                computedAt: nowProration.toISOString(),
                refundPathEnabled,
                refundFloorCents,
                entries: prorationEntries,
              },
            }
          : undefined
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
          ...(prorationMeta !== undefined ? { upgradeProrationMeta: prorationMeta as never } : {}),
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
      // F4: crédito FS$ do pró-rata IMEDIATO, com extrato (mesmo shape do bonus-credit).
      if (immediateProrationFs > 0) {
        const userBalanceRow = await tx.user.findUnique({
          where: { id: userId },
          select: { fsBalance: true },
        })
        const balanceBefore = userBalanceRow ? Number(userBalanceRow.fsBalance) : 0
        await tx.user.update({
          where: { id: userId },
          data: { fsBalance: { increment: immediateProrationFs } },
        })
        await tx.transaction.create({
          data: {
            userId,
            financialType: 'BONUS',
            totalAmount: immediateProrationFs,
            fsAmount: immediateProrationFs,
            balanceBefore,
            balanceAfter: balanceBefore + immediateProrationFs,
            assetId: null,
            type: null,
            side: null,
            quantity: null,
            price: null,
            fee: null,
          } as never,
        })
      }
      // #5 CRÍTICO: religar o usuário suspenso por LAPSO DE EXPIRAÇÃO ao ativar um pagamento.
      // Sem isto, um assinante que caiu para status=SUSPENDED (subscription-expiry) e depois PAGOU
      // ficava SUSPENDED para sempre (sem login) mesmo com a assinatura ACTIVE. Escopo estrito em
      // status:'SUSPENDED' — NÃO toca BANNED (ban admin) nem nenhum outro estado.
      await tx.user.updateMany({
        where: { id: userId, status: 'SUSPENDED' },
        data:  { status: 'ACTIVE' },
      })
    })

    // Neutralizar TERMINALMENTE os preapprovals recorrentes anteriores superseded por este upgrade
    // (gateway I/O FORA da tx, só após o commit da ativação). Sem isto, o auto-renew do plano trocado
    // continua cobrando (double-charge). Best-effort + [ALERT]: não bloquear a ativação já paga; uma
    // cobrança residual do preapproval antigo é barrada pelo guard anti-ressurreição (applyRenewalCycle
    // -> RACE_CANCELLED, pois a sub anterior já está CANCELLED) e fica sinalizada para conciliação.
    for (const old of priorRecurringToCancel) {
      try {
        await getGateway(resolveGatewayType(old.gateway)).cancelSubscriptionTerminal(old.gatewaySubscriptionId)
      } catch (cancelErr) {
        console.error(
          `[PlanService.upgradeUser][ALERT] falha ao cancelar preapproval anterior ${old.gatewaySubscriptionId} ` +
          `(gateway ${old.gateway}) no upgrade do user ${userId} — RISCO de cobrança do plano trocado; cancelar manual:`,
          cancelErr,
        )
      }
    }

    // M066 (Fase 2): estornos do outbox executados AGORA (gateway -> consolidação síncrona).
    // executeUpgradeProrationRefund NUNCA lança; crash aqui deixa REQUESTED órfão que o sweep
    // do reconcile-cron completa (F1). Repetição é inócua (idempotency key + effects gate).
    for (const ledgerId of prorationRefundLedgerIds) {
      await executeUpgradeProrationRefund(ledgerId)
    }

    // F4: notificação do crédito FS$ imediato (best-effort, pós-commit).
    if (immediateProrationFs > 0) {
      await prisma.notification
        .create({
          data: {
            userId,
            type: 'UPGRADE_PRORATION_REFUND',
            title: 'Bônus promocional de migração',
            body:
              `Creditamos FS$ ${immediateProrationFs.toLocaleString('pt-BR')} na sua conta ` +
              `referentes aos dias não usados do seu plano anterior (1,2× o valor).`,
            isRead: false,
          },
        })
        .catch((err) =>
          console.error('[PlanService.upgradeUser] Erro ao notificar crédito pró-rata (não-bloqueante):', err)
        )
    }

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
        timeZone: 'America/Sao_Paulo',
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

  /** Avança uma data em um período (MONTHLY -> +1 mês, YEARLY -> +1 ano). Espelha o webhook. */
  private addSubscriptionPeriod(from: Date, period: 'MONTHLY' | 'YEARLY'): Date {
    const d = new Date(from)
    if (period === 'YEARLY') d.setFullYear(d.getFullYear() + 1)
    else d.setMonth(d.getMonth() + 1)
    return d
  }

  /**
   * Reconciliação de CICLO PAGO recorrente (item 4b): recupera uma RENOVAÇÃO cujo webhook
   * SUBSCRIPTION_RENEWED se perdeu — sem isto, um assinante que pagou pode expirar/suspender porque
   * o expiresAt local nunca foi estendido. Difere de reconcileApprovedPayment (que ATIVA via
   * upgradeUser e devolve NOT_ACTIVATABLE para EXPIRED/SUSPENDED): aqui ESTENDEMOS a vigência
   * espelhando o handler de renovação.
   *
   * MONEY-SAFE: só estende com um pagamento APROVADO real no gateway (searchApprovedPayment +
   * getPaymentDetails: approved + live_mode + valor bate), NUNCA pelo status do preapproval.
   * IDEMPOTENTE: a renovação é reivindicada via Payment.create (unique gatewayTransactionId) numa
   * transação — um caminho concorrente (webhook OU outra rodada do cron) colide em P2002 e vira
   * ALREADY_RECONCILED, sem dupla extensão. NUNCA ressuscita cancelamento do usuário (guard notIn
   * CANCELLED/CANCELLATION_LOCK, igual ao webhook).
   */
  async reconcileRenewalPayment(
    gateway: GatewayType,
    subscriptionId: string,
  ): Promise<
    | { ok: true; action: 'RENEWED' | 'ALREADY_RECONCILED' | 'NO_APPROVED_PAYMENT'; subscriptionId: string }
    | { ok: false; reason: string; detail?: string }
  > {
    if (gateway !== GatewayType.MERCADO_PAGO) {
      return { ok: false, reason: 'GATEWAY_NOT_SUPPORTED', detail: String(gateway) }
    }

    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        userId: true, amount: true, gateway: true, period: true,
        status: true, expiresAt: true, billingMode: true, gatewaySubscriptionId: true,
      },
    })
    if (!sub) return { ok: false, reason: 'SUBSCRIPTION_NOT_FOUND', detail: subscriptionId }
    if (String(sub.gateway) !== 'MERCADO_PAGO') return { ok: false, reason: 'GATEWAY_MISMATCH', detail: String(sub.gateway) }
    if (sub.billingMode !== 'recurring' || !sub.gatewaySubscriptionId) return { ok: false, reason: 'NOT_RECURRING' }
    // Só recupera lapso — NUNCA ressuscita cancelamento do usuário nem ativa PENDING (é outro caminho).
    if (['CANCELLED', 'CANCELLATION_LOCK', 'PENDING'].includes(String(sub.status))) {
      return { ok: false, reason: 'NOT_RECOVERABLE', detail: String(sub.status) }
    }

    const gw = getGateway(gateway) as unknown as {
      searchApprovedPaymentByExternalReference(ref: string): Promise<string | null>
      getPaymentDetails(id: string): Promise<{ status?: string; externalReference?: string; amount?: number; liveMode?: boolean } | null>
    }

    // Pagamento APROVADO real no MP para esta assinatura (external_reference = subscriptionId).
    const paymentId = await gw.searchApprovedPaymentByExternalReference(subscriptionId)
    if (!paymentId) return { ok: true, action: 'NO_APPROVED_PAYMENT', subscriptionId }

    const details = await gw.getPaymentDetails(paymentId)
    if (!details) return { ok: false, reason: 'PAYMENT_STATUS_UNRESOLVED' }
    // Recovery sem usuário no loop: exige confirmação POSITIVA de produção (não só "não é teste").
    if (details.liveMode !== true) return { ok: false, reason: 'TEST_PAYMENT', detail: `live_mode=${String(details.liveMode)}` }
    if (details.status !== 'approved') return { ok: false, reason: 'PAYMENT_NOT_APPROVED', detail: details.status ?? 'desconhecido' }
    if ((details.externalReference ?? '') !== subscriptionId) {
      return { ok: false, reason: 'EXTERNAL_REFERENCE_MISMATCH', detail: details.externalReference ?? '' }
    }
    const paidCents = details.amount ? Math.round(details.amount * 100) : 0
    if (Math.abs(paidCents - Number(sub.amount)) > 1) {
      return { ok: false, reason: 'AMOUNT_MISMATCH', detail: `pago=${paidCents} esperado=${Number(sub.amount)}` }
    }

    // Extensão ATÔMICA + money-safe, COMPARTILHADA com o webhook (serializa webhook x cron x replay
    // via Payment.create único — sem dupla extensão) e base recalculada FRESCA dentro da transação.
    const outcome = await this.applyRenewalCycle({
      subscriptionId,
      userId: sub.userId,
      paymentId,
      amountCents: paidCents,
      gateway: sub.gateway,
      period: sub.period as 'MONTHLY' | 'YEARLY',
    })
    if (outcome === 'ALREADY_RECONCILED') return { ok: true, action: 'ALREADY_RECONCILED', subscriptionId }
    if (outcome === 'RACE_CANCELLED') return { ok: false, reason: 'RACE_CANCELLED', detail: subscriptionId }

    console.warn(`[reconcileRenewalPayment] renovação recuperada (webhook perdido): sub=${subscriptionId} payment=${paymentId}`)
    return { ok: true, action: 'RENEWED', subscriptionId }
  }

  /**
   * Aplica UM ciclo de renovação de forma ATÔMICA e IDEMPOTENTE — ponto único compartilhado pelo
   * webhook SUBSCRIPTION_RENEWED e pela reconciliação server-side (reconcileRenewalPayment).
   *
   * Serialização (fix double-extension): a renovação é reivindicada por `Payment.create` (unique
   * gatewayTransactionId). Quem cria o Payment estende; qualquer caminho concorrente (webhook OU
   * cron OU replay) colide em P2002 e retorna ALREADY_RECONCILED — NUNCA há duas extensões para o
   * mesmo pagamento. A base de vigência é relida FRESCA dentro da transação (nunca estende a partir
   * de um expiresAt já estendido por outro caminho). Se a assinatura sair do estado recuperável
   * entre a leitura e a escrita (CANCELLED/CANCELLATION_LOCK, ou CAS count 0), a transação faz
   * ROLLBACK (RACE_CANCELLED): não registra Payment nem estende nem religa — evita ressuscitar
   * cancelamento e evita creditar um Payment que não honramos.
   */
  async applyRenewalCycle(params: {
    subscriptionId: string
    userId: string
    paymentId: string
    amountCents: number
    gateway: SubscriptionGateway
    period: 'MONTHLY' | 'YEARLY'
  }): Promise<'RENEWED' | 'ALREADY_RECONCILED' | 'RACE_CANCELLED'> {
    const { subscriptionId, userId, paymentId, amountCents, gateway, period } = params
    try {
      await prisma.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            subscriptionId,
            userId,
            amount: amountCents,
            gateway,
            gatewayTransactionId: paymentId,
            status: 'PAID',
            processedAt: new Date(),
          },
        })
        // Base FRESCA dentro da tx: nunca estende a partir de uma vigência já estendida por outro caminho.
        const fresh = await tx.subscription.findUnique({
          where: { id: subscriptionId },
          select: { status: true, expiresAt: true },
        })
        if (!fresh || fresh.status === 'CANCELLED' || fresh.status === 'CANCELLATION_LOCK') {
          throw new RenewalRaceError() // rollback: não credita Payment nem estende sub cancelada
        }
        const base = fresh.expiresAt && fresh.expiresAt.getTime() > Date.now() ? new Date(fresh.expiresAt) : new Date()
        const newExpiresAt = this.addSubscriptionPeriod(base, period)
        const upd = await tx.subscription.updateMany({
          where: { id: subscriptionId, status: { notIn: ['CANCELLED', 'CANCELLATION_LOCK'] as never[] } },
          data: {
            status: 'ACTIVE',
            gatewayStatus: 'authorized',
            currentPeriodStart: new Date(),
            currentPeriodEnd: newExpiresAt,
            expiresAt: newExpiresAt,
          },
        })
        if (upd.count === 0) throw new RenewalRaceError() // corrida: sub saiu do estado recuperável
        // Religa o assinante suspenso por lapso (escopo estrito SUSPENDED, não toca BANNED).
        await tx.user.updateMany({
          where: { id: userId, status: 'SUSPENDED' },
          data: { status: 'ACTIVE' },
        })
      })
      return 'RENEWED'
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') return 'ALREADY_RECONCILED'
      if (err instanceof RenewalRaceError) return 'RACE_CANCELLED'
      throw err
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
