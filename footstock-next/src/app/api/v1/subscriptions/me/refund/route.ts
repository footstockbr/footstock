import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { isWithinCoolingOff } from '@/lib/services/plan-logic'
import { getGateway } from '@/lib/gateways/GatewayFactory'
import { GatewayRetryableError, GatewayType } from '@/lib/gateways/IGateway'
import type { PlanType } from '@/types'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'

// POST /api/v1/subscriptions/me/refund
// Reembolso CDC Art. 49: acao explicita, separada do cancelamento simples.
// Estorna de fato no gateway (Mercado Pago) ANTES de rebaixar o plano —
// nunca rebaixa sem confirmar o estorno (evita "perdeu acesso sem receber de volta").
export async function POST() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const sub = await prisma.subscription.findFirst({
      where: {
        userId: auth.user.id,
        status: { in: ['ACTIVE', 'CANCELLATION_LOCK', 'PAST_DUE', 'TRIAL', 'TRIALING'] },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!sub) return errors.notFound('Nenhuma assinatura ativa encontrada.')

    const now = new Date()
    const eligibleForRefund = isWithinCoolingOff({
      planType: sub.planType as PlanType,
      startsAt: sub.startsAt,
      expiresAt: sub.expiresAt,
      status: sub.status,
      cancelledAt: sub.cancelledAt,
      cancellationLockExpiresAt: sub.cancellationLockExpiresAt,
    }, now)

    if (!eligibleForRefund) {
      return errors.validation('O prazo de 7 dias para solicitar reembolso integral ja expirou.')
    }

    // Localiza o pagamento PAID mais recente desta assinatura — é o que será estornado.
    const payment = await prisma.payment.findFirst({
      where: { subscriptionId: sub.id, status: 'PAID' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, gateway: true, gatewayTransactionId: true, amount: true },
    })

    // Estorno real no gateway (apenas quando há pagamento PAID rastreável).
    // Sem Payment PAID (ex.: ativação manual/admin sem cobrança), não há o que estornar
    // no gateway — segue só com o downgrade, registrando que não houve estorno externo.
    let refundOutcome: { refundId: string; status: string; alreadyRefunded: boolean } | null = null
    if (payment) {
      try {
        const gateway = getGateway(payment.gateway as unknown as GatewayType)
        refundOutcome = await gateway.refundPayment(payment.gatewayTransactionId)
      } catch (err) {
        // Transitório (timeout/5xx): não rebaixa, pede retry.
        if (err instanceof GatewayRetryableError) {
          console.error('[subscriptions/me/refund] estorno transitório — retry:', err.message)
          return errors.server('Não foi possível concluir o estorno agora. Tente novamente em instantes.')
        }
        // Terminal (estorno rejeitado pelo gateway): não rebaixa, informa o usuário.
        const code = (err as { code?: string })?.code
        const statusCode = (err as { statusCode?: number })?.statusCode ?? 422
        console.error('[subscriptions/me/refund] estorno rejeitado pelo gateway:', err)
        return errors.validation(
          code === 'PAYMENT_057'
            ? 'Estorno automático indisponível para este meio de pagamento. Entre em contato com o suporte.'
            : `Não foi possível processar o estorno (código ${code ?? statusCode}). Entre em contato com o suporte.`,
        )
      }
    } else {
      console.warn(`[subscriptions/me/refund] subscription ${sub.id} sem Payment PAID — downgrade sem estorno de gateway`)
    }

    // Estorno confirmado (ou nada a estornar): efetiva cancelamento + downgrade em transação.
    const updatedSub = await prisma.$transaction(async (tx) => {
      const s = await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          refundRequested: true,
          previousPlanType: sub.planType as never,
          cancellationLockStartedAt: null,
          cancellationLockExpiresAt: null,
          forcedLiquidationAt: null,
          forcedLiquidationExecutedAt: null,
          bonusScheduledAt: null,
        },
      })

      // Marca o Payment como REFUNDED para histórico e idempotência do webhook MP
      if (payment) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'REFUNDED' },
        })
      }

      await tx.user.update({
        where: { id: auth.user.id },
        data: { planType: 'JOGADOR', fsBalance: 2000 },
      })

      return s
    })

    const openShortCount = await prisma.position.count({
      where: { userId: auth.user.id, side: 'SHORT', status: 'OPEN' },
    }).catch(() => 0)

    mixpanelServer.trackSubscriptionCancelled(auth.user.id, {
      plan: sub.planType as PlanType,
      cancellation_reason: 'cooling_off_refund',
      within_trial: true,
      had_open_shorts: openShortCount > 0,
    })

    await prisma.notification.create({
      data: {
        userId: auth.user.id,
        type: 'PLAN_CANCEL_ALERT',
        title: 'Cancelamento e reembolso confirmados',
        body: refundOutcome?.alreadyRefunded
          ? 'Seu plano foi cancelado. O estorno já havia sido processado anteriormente.'
          : payment
            ? 'Seu plano foi cancelado e o estorno foi solicitado ao Mercado Pago. O valor retorna em até 7 dias úteis pelo mesmo meio de pagamento.'
            : 'Seu plano foi cancelado.',
        isRead: false,
      },
    }).catch((err) => {
      console.error('[subscriptions/me/refund POST] Erro ao criar notificacao:', err)
    })

    return ok({
      id: updatedSub.id,
      planType: updatedSub.planType,
      status: updatedSub.status,
      cancelledAt: updatedSub.cancelledAt?.toISOString() ?? null,
      refundRequested: updatedSub.refundRequested,
      isEligibleForRefund: true,
      cancellationMode: 'REFUND',
      refund: refundOutcome
        ? { processed: true, refundId: refundOutcome.refundId, alreadyRefunded: refundOutcome.alreadyRefunded }
        : { processed: false, reason: 'no_paid_payment' },
    })
  } catch (err) {
    console.error('[subscriptions/me/refund POST] Erro:', err)
    return errors.server()
  }
}
