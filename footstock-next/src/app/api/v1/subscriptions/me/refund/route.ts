import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { isWithinCoolingOff } from '@/lib/services/plan-logic'
import { getGateway } from '@/lib/gateways/GatewayFactory'
import { GatewayRetryableError, GatewayType } from '@/lib/gateways/IGateway'
import type { PlanType } from '@/types'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'
import { liquidateRestrictedPositions } from '@/lib/services/forced-liquidation'

const REFUND_CONFIRMED_STATUSES = new Set(['approved', 'refunded', 'succeeded', 'success', 'completed'])

function isRefundConfirmed(outcome: { status: string; alreadyRefunded: boolean }): boolean {
  return outcome.alreadyRefunded || REFUND_CONFIRMED_STATUSES.has(outcome.status.toLowerCase())
}

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

    // FIX-08: liquidação compulsória de posições restritas (SHORT, alavancada) +
    // cancelamento de ordens OCO/SCHEDULED ANTES de estornar e rebaixar. O downgrade
    // para JOGADOR deixa essas posições órfãs (sem cobertura de margem/plano), então
    // nunca rebaixamos sem encerrá-las. Caminho self-service: se a liquidação não
    // conseguir zerar as posições restritas, BLOQUEIA o refund (plano e pagamento
    // permanecem intactos) em vez de deixar posição órfã.
    const liquidation = await liquidateRestrictedPositions(auth.user.id, sub.id, 'REFUND_COOLING_OFF')
    if (!liquidation.cleared) {
      console.error(
        `[subscriptions/me/refund] liquidação incompleta — refund bloqueado: ` +
        `sub=${sub.id} remaining=${liquidation.remaining} failed=${liquidation.failed}`,
      )
      return errors.validation(
        'Não foi possível encerrar automaticamente suas posições restritas (short, alavancada ou OCO). ' +
        'Seu plano e seu pagamento permanecem inalterados. Tente novamente em instantes ou contate o suporte.',
      )
    }

    // Localiza o pagamento PAID mais recente desta assinatura — é o que será estornado.
    const payment = await prisma.payment.findFirst({
      where: { subscriptionId: sub.id, status: 'PAID' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, gateway: true, gatewayTransactionId: true, amount: true },
    })

    // Estorno real no gateway (apenas quando há pagamento PAID rastreável).
    // Assinatura paga sem Payment PAID não pode perder acesso neste fluxo: sem o
    // identificador do gateway, não há confirmação verificável de estorno.
    let refundOutcome: { refundId: string; status: string; alreadyRefunded: boolean } | null = null
    if (payment) {
      try {
        const gateway = getGateway(payment.gateway as unknown as GatewayType)
        refundOutcome = await gateway.refundPayment(payment.gatewayTransactionId)
        if (!isRefundConfirmed(refundOutcome)) {
          console.warn(
            `[subscriptions/me/refund] estorno ainda nao confirmado pelo gateway: ` +
            `payment=${payment.id} status=${refundOutcome.status}`
          )
          return errors.server('O estorno foi solicitado, mas ainda não foi confirmado pelo gateway. Tente novamente em instantes.')
        }
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
    } else if (sub.amount > 0) {
      console.error(`[subscriptions/me/refund] subscription ${sub.id} paga sem Payment PAID — downgrade bloqueado`)
      return errors.validation('Pagamento pago não encontrado para estorno automático. Entre em contato com o suporte.')
    } else {
      console.warn(`[subscriptions/me/refund] subscription ${sub.id} sem Payment PAID — downgrade sem estorno de gateway`)
    }

    // Estorno confirmado (ou nada a estornar): efetiva cancelamento + downgrade em transação.
    const { subscription: updatedSub, stateChanged } = await prisma.$transaction(async (tx) => {
      if (payment) {
        const paymentUpdate = await tx.payment.updateMany({
          where: { id: payment.id, status: 'PAID' },
          data: { status: 'REFUNDED' },
        })
        if (paymentUpdate.count === 0) {
          const currentSub = await tx.subscription.findUniqueOrThrow({ where: { id: sub.id } })
          return { subscription: currentSub, stateChanged: false }
        }
      }

      const subUpdate = await tx.subscription.updateMany({
        where: {
          id: sub.id,
          status: { in: ['ACTIVE', 'CANCELLATION_LOCK', 'PAST_DUE', 'TRIAL', 'TRIALING'] },
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          refundRequested: true,
          previousPlanType: sub.planType as never,
          cancellationLockStartedAt: null,
          cancellationLockExpiresAt: null,
          bonusScheduledAt: null,
        },
      })

      if (subUpdate.count === 0) {
        const currentSub = await tx.subscription.findUniqueOrThrow({ where: { id: sub.id } })
        return { subscription: currentSub, stateChanged: false }
      }

      await tx.user.update({
        where: { id: auth.user.id },
        data: { planType: 'JOGADOR', fsBalance: 2000 },
      })

      const currentSub = await tx.subscription.findUniqueOrThrow({ where: { id: sub.id } })
      return { subscription: currentSub, stateChanged: true }
    })

    if (stateChanged) {
      const openShortCount = await prisma.position.count({
        where: { userId: auth.user.id, side: 'SHORT', status: 'OPEN' },
      }).catch(() => 0)

      mixpanelServer.trackSubscriptionCancelled(auth.user.id, {
        plan: sub.planType as PlanType,
        cancellation_reason: 'cooling_off_refund',
        within_trial: true,
        had_open_shorts: openShortCount > 0,
      })

      const liquidationNote = liquidation.liquidated > 0
        ? ` ${liquidation.liquidated} posição(ões) restrita(s) (short, alavancada ou OCO) foram encerradas automaticamente, pois são incompatíveis com o plano Jogador.`
        : ''

      await prisma.notification.create({
        data: {
          userId: auth.user.id,
          type: 'PLAN_CANCEL_ALERT',
          title: 'Cancelamento e reembolso confirmados',
          body: (refundOutcome?.alreadyRefunded
            ? 'Seu plano foi cancelado. O estorno já havia sido processado anteriormente.'
            : payment
              ? 'Seu plano foi cancelado e o estorno foi confirmado pelo Mercado Pago. O valor retorna em até 7 dias úteis pelo mesmo meio de pagamento.'
              : 'Seu plano foi cancelado.') + liquidationNote,
          isRead: false,
        },
      }).catch((err) => {
        console.error('[subscriptions/me/refund POST] Erro ao criar notificacao:', err)
      })
    }

    return ok({
      id: updatedSub.id,
      planType: updatedSub.planType,
      status: updatedSub.status,
      cancelledAt: updatedSub.cancelledAt?.toISOString() ?? null,
      refundRequested: updatedSub.refundRequested,
      isEligibleForRefund: true,
      cancellationMode: 'REFUND',
      idempotent: !stateChanged,
      refund: refundOutcome
        ? { processed: true, refundId: refundOutcome.refundId, alreadyRefunded: refundOutcome.alreadyRefunded }
        : { processed: false, reason: 'no_paid_payment' },
      liquidation: { positionsClosed: liquidation.liquidated, restrictedRemaining: liquidation.remaining },
    })
  } catch (err) {
    console.error('[subscriptions/me/refund POST] Erro:', err)
    return errors.server()
  }
}
