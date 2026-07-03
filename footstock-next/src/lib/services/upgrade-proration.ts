/**
 * M066 — Ledger de estorno pró-rata de upgrade (Fase 2 do estudo
 * UPGRADE-PRICING-STRATEGY-2026-07-03, desenho ajustado por DOIS reviews codex).
 *
 * Princípios (não-negociáveis):
 *  - OUTBOX DURÁVEL (review F1): o registro PaymentRefund REQUESTED nasce DENTRO da
 *    transação do upgrade (PlanService.upgradeUser). Um crash entre o commit e a execução
 *    deixa um REQUESTED órfão que o sweep do reconcile-cron completa — nunca um upgrade
 *    ativo com compensação prometida e sem rastro.
 *  - CONSOLIDAÇÃO ÚNICA (review F2/F3): os EFEITOS financeiros (Payment.refundedAmountCents,
 *    clawback de comissão, notificação) são aplicados por consolidateExpectedRefund sob CAS
 *    em `effectsAppliedAt IS NULL` — exatamente uma vez, independente do caminho (retorno
 *    SÍNCRONO do gateway ou eco de webhook pós-crash). O webhook NÃO tem lógica financeira
 *    própria: chama a mesma função.
 *  - Estorno parcial NUNCA promove Payment a REFUNDED inteiro: acumula em
 *    refundedAmountCents; REFUNDED só quando o acumulado cobre o valor cheio.
 *  - Falha transitória => FAILED_RETRYABLE, re-tentada pelo sweep (X-Idempotency-Key do MP
 *    por paymentId+cents torna a repetição do gateway inócua).
 *  - Parcial não suportado (ex. MP 3024) => FAILED_UNSUPPORTED + fallback FS$ 1.3x
 *    ("bônus promocional de migração", nunca "reembolso").
 *  - Clawback: apenas comissão PENDING (comissão PAID segue política do refund total —
 *    responsabilidade operacional; decisão registrada no PDCA).
 */

import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'
import { getGateway } from '@/lib/gateways/GatewayFactory'
import { GatewayType, GatewayRetryableError } from '@/lib/gateways/IGateway'
import { UPGRADE_PRORATION_FALLBACK_FS_MULTIPLIER, residualToFsCredit } from './plan-logic'
import { Prisma, type PaymentRefund } from '@prisma/client'

export const UPGRADE_PRORATION_REASON = 'UPGRADE_PRORATION'

export interface UpgradeProrationRefundIntent {
  /** Assinatura NOVA (a do upgrade) — âncora da idempotência do evento. */
  newSubscriptionId: string
  userId: string
  /** Assinatura ANTIGA superseded, dona do pagamento estornado. */
  priorSubscriptionId: string
  priorAmountCents: number
  paymentDbId: string
  gatewayPaymentId: string
  gateway: string
  residualCents: number
}

type RefundMeta = {
  userId?: string
  priorSubscriptionId?: string
  priorAmountCents?: number
  gateway?: string
}

export function isUpgradeProrationRefundEnabled(): boolean {
  return env.UPGRADE_PRORATION_REFUND_ENABLED === 'true'
}

export function upgradeProrationRefundFloorCents(): number {
  const raw = Number(env.UPGRADE_PRORATION_REFUND_FLOOR_CENTS ?? '200')
  return Number.isFinite(raw) && raw >= 0 ? Math.trunc(raw) : 200
}

export function upgradeProrationIdempotencyKey(newSubscriptionId: string): string {
  return `upgrade-proration-${newSubscriptionId}`
}

/**
 * OUTBOX (review F1): cria o registro REQUESTED dentro da transação do upgrade. Idempotente
 * pelo unique de idempotencyKey (upsert com update vazio preserva estado avançado em replay).
 * Aceita o TransactionClient da própria tx de ativação.
 */
export async function createUpgradeProrationRefundOutbox(
  tx: Prisma.TransactionClient,
  intent: UpgradeProrationRefundIntent
): Promise<string> {
  const row = await tx.paymentRefund.upsert({
    where: { idempotencyKey: upgradeProrationIdempotencyKey(intent.newSubscriptionId) },
    update: {},
    create: {
      paymentId: intent.paymentDbId,
      gatewayPaymentId: intent.gatewayPaymentId,
      amountCents: intent.residualCents,
      reason: UPGRADE_PRORATION_REASON,
      expected: true,
      idempotencyKey: upgradeProrationIdempotencyKey(intent.newSubscriptionId),
      metadata: {
        userId: intent.userId,
        newSubscriptionId: intent.newSubscriptionId,
        priorSubscriptionId: intent.priorSubscriptionId,
        priorAmountCents: intent.priorAmountCents,
        gateway: intent.gateway,
      },
    },
    select: { id: true },
  })
  return row.id
}

export type ConsolidateResult = 'EFFECTS_APPLIED' | 'STATUS_ONLY' | 'NOOP'

/**
 * CONSOLIDAÇÃO ÚNICA (review F2/F3): transiciona o status do ledger E aplica os efeitos
 * financeiros exatamente uma vez (CAS em effectsAppliedAt IS NULL). Chamada pelo executor
 * síncrono (toStatus SUCCEEDED) e pelo eco de webhook (toStatus WEBHOOK_CONFIRMED).
 * A notificação ao usuário só dispara quando ESTA chamada aplicou os efeitos.
 */
export async function consolidateExpectedRefund(
  refundId: string,
  params: { toStatus: 'SUCCEEDED' | 'WEBHOOK_CONFIRMED'; gatewayRefundId?: string | null }
): Promise<ConsolidateResult> {
  const refund = await prisma.paymentRefund.findUnique({ where: { id: refundId } })
  if (!refund) return 'NOOP'
  const meta = (refund.metadata ?? {}) as RefundMeta

  const allowedFrom =
    params.toStatus === 'SUCCEEDED'
      ? ['REQUESTED', 'FAILED_RETRYABLE']
      : ['REQUESTED', 'SUCCEEDED', 'FAILED_RETRYABLE']

  const result = await prisma.$transaction(async (tx) => {
    const statusCas = await tx.paymentRefund.updateMany({
      where: { id: refund.id, status: { in: allowedFrom as never[] } },
      data: {
        status: params.toStatus,
        ...(params.gatewayRefundId !== undefined ? { gatewayRefundId: params.gatewayRefundId } : {}),
        errorMessage: null,
      },
    })

    // Gate de exatamente-uma-vez dos efeitos — independente de qual caminho chegou primeiro.
    const effectsCas = await tx.paymentRefund.updateMany({
      where: {
        id: refund.id,
        effectsAppliedAt: null,
        status: { in: ['SUCCEEDED', 'WEBHOOK_CONFIRMED'] as never[] },
      },
      data: { effectsAppliedAt: new Date() },
    })
    if (effectsCas.count === 1) {
      await applyRefundEffects(tx, refund, meta)
      return 'EFFECTS_APPLIED' as const
    }
    return statusCas.count === 1 ? ('STATUS_ONLY' as const) : ('NOOP' as const)
  })

  if (result === 'EFFECTS_APPLIED' && meta.userId) {
    await notifyRefundApplied(meta.userId, refund.amountCents)
  }
  return result
}

/** Efeitos financeiros do estorno confirmado — SEMPRE dentro da tx do consolidate. */
async function applyRefundEffects(
  tx: Prisma.TransactionClient,
  refund: PaymentRefund,
  meta: RefundMeta
): Promise<void> {
  // Acumular o estornado; REFUNDED só quando cobre o valor cheio (nunca promover parcial).
  const payment = await tx.payment.findUnique({
    where: { id: refund.paymentId },
    select: { amount: true, refundedAmountCents: true },
  })
  if (payment) {
    const newRefunded = payment.refundedAmountCents + refund.amountCents
    const nextStatus = newRefunded >= payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED'
    await tx.payment.updateMany({
      where: { id: refund.paymentId, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] as never[] } },
      data: { refundedAmountCents: newRefunded, status: nextStatus as never },
    })
  }

  // Clawback proporcional da comissão PENDING da assinatura ANTIGA (comissão sobre o líquido).
  // Base imutável: fração = estornado/valor_original do ciclo. PAID não é revertido (política
  // igual ao refund total — responsabilidade operacional do admin).
  if (meta.priorSubscriptionId && meta.priorAmountCents && meta.priorAmountCents > 0) {
    const fraction = refund.amountCents / meta.priorAmountCents
    const pendings = await tx.affiliateTransaction.findMany({
      where: { subscriptionId: meta.priorSubscriptionId, status: 'PENDING' },
      select: { id: true, amount: true },
    })
    for (const p of pendings) {
      const current = Number(p.amount)
      const reduced = Math.round(current * (1 - fraction) * 100) / 100
      if (reduced <= 0) {
        await tx.affiliateTransaction.update({ where: { id: p.id }, data: { status: 'VOIDED' } })
      } else {
        await tx.affiliateTransaction.update({
          where: { id: p.id },
          data: { amount: new Prisma.Decimal(reduced) } as never,
        })
      }
    }
  }
}

async function notifyRefundApplied(userId: string, amountCents: number): Promise<void> {
  const reais = (amountCents / 100).toFixed(2).replace('.', ',')
  await prisma.notification
    .create({
      data: {
        userId,
        type: 'UPGRADE_PRORATION_REFUND',
        title: 'Estorno do tempo não usado',
        body:
          `Estornamos R$ ${reais} referentes aos dias não usados do seu plano anterior. ` +
          `O valor retorna em até 7 dias úteis pelo mesmo meio de pagamento.`,
        isRead: false,
      },
    })
    .catch((err) =>
      console.error('[upgrade-proration] Erro ao notificar estorno (não-bloqueante):', err)
    )
}

export type UpgradeProrationExecuteResult =
  | 'SUCCEEDED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_UNSUPPORTED'
  | 'SKIPPED'

/**
 * Executa (ou re-tenta) um estorno REQUESTED/FAILED_RETRYABLE do ledger: chama o gateway e
 * consolida via consolidateExpectedRefund. Idempotente: repetição do gateway é inócua
 * (X-Idempotency-Key por paymentId+cents) e os efeitos locais têm gate próprio. NUNCA lança.
 */
export async function executeUpgradeProrationRefund(
  refundId: string
): Promise<UpgradeProrationExecuteResult> {
  let refund: PaymentRefund | null = null
  try {
    refund = await prisma.paymentRefund.findUnique({ where: { id: refundId } })
  } catch (err) {
    console.error(`[upgrade-proration][ALERT] falha ao carregar refund ${refundId}:`, err)
    return 'SKIPPED'
  }
  if (!refund) return 'SKIPPED'
  if (refund.status !== 'REQUESTED' && refund.status !== 'FAILED_RETRYABLE') return 'SKIPPED'

  const meta = (refund.metadata ?? {}) as RefundMeta
  // Hoje o único gateway com recorrência real é o MP; o ledger guarda o gateway para o futuro.
  const gatewayType =
    meta.gateway === 'MERCADO_PAGO' || meta.gateway === undefined
      ? GatewayType.MERCADO_PAGO
      : (meta.gateway as GatewayType)

  try {
    const result = await getGateway(gatewayType).refundPayment(
      refund.gatewayPaymentId,
      refund.amountCents
    )
    await consolidateExpectedRefund(refund.id, {
      toStatus: 'SUCCEEDED',
      gatewayRefundId: result.refundId ?? null,
    })
    return 'SUCCEEDED'
  } catch (err) {
    if (err instanceof GatewayRetryableError) {
      await prisma.paymentRefund
        .updateMany({
          where: { id: refund.id, status: { in: ['REQUESTED', 'FAILED_RETRYABLE'] } },
          data: { status: 'FAILED_RETRYABLE', errorMessage: String(err.message).slice(0, 500) },
        })
        .catch(() => {})
      console.error(
        `[upgrade-proration][ALERT] estorno transitório falhou (retry via reconcile-cron). ` +
          `refund=${refund.id} payment=${refund.gatewayPaymentId}:`,
        err
      )
      return 'FAILED_RETRYABLE'
    }

    // Terminal (inclui MP 3024 "partial refund unsupported"): fallback FS$ 1.3x — a
    // compensação NUNCA falha silenciosamente (Zero Silêncio).
    await applyFsFallback(refund.id, meta.userId, refund.amountCents, err)
    return 'FAILED_UNSUPPORTED'
  }
}

/**
 * Fallback do estorno terminalmente rejeitado: credita FS$ (residual × 1.3) direto no
 * fsBalance com extrato BONUS, sob o MESMO CAS do ledger (um runner só).
 */
async function applyFsFallback(
  refundId: string,
  userId: string | undefined,
  residualCents: number,
  cause: unknown
): Promise<void> {
  const fsCredit = residualToFsCredit(residualCents, UPGRADE_PRORATION_FALLBACK_FS_MULTIPLIER)
  try {
    const applied = await prisma.$transaction(async (tx) => {
      const cas = await tx.paymentRefund.updateMany({
        where: { id: refundId, status: { in: ['REQUESTED', 'FAILED_RETRYABLE'] } },
        data: {
          status: 'FAILED_UNSUPPORTED',
          effectsAppliedAt: new Date(),
          errorMessage: `fallback FS$ ${fsCredit} aplicado — ${String(
            cause instanceof Error ? cause.message : cause
          ).slice(0, 400)}`,
        },
      })
      if (cas.count === 0 || !userId || fsCredit <= 0) return false

      const user = await tx.user.findUnique({ where: { id: userId }, select: { fsBalance: true } })
      const before = user ? Number(user.fsBalance) : 0
      await tx.user.update({ where: { id: userId }, data: { fsBalance: { increment: fsCredit } } })
      await tx.transaction.create({
        data: {
          userId,
          financialType: 'BONUS',
          totalAmount: fsCredit,
          fsAmount: fsCredit,
          balanceBefore: before,
          balanceAfter: before + fsCredit,
          assetId: null,
          type: null,
          side: null,
          quantity: null,
          price: null,
          fee: null,
        } as never,
      })
      return true
    })

    if (applied && userId) {
      await prisma.notification
        .create({
          data: {
            userId,
            type: 'UPGRADE_PRORATION_REFUND',
            title: 'Bônus promocional de migração',
            body:
              `Não foi possível estornar no seu meio de pagamento. Em compensação, creditamos ` +
              `FS$ ${fsCredit.toLocaleString('pt-BR')} (1,3× o valor dos dias não usados) na sua conta.`,
            isRead: false,
          },
        })
        .catch(() => {})
    }
    console.error(
      `[upgrade-proration][ALERT] estorno parcial rejeitado pelo gateway — fallback FS$ ` +
        `${fsCredit} ${applied ? 'APLICADO' : 'não aplicado (CAS perdido/sem user)'} ` +
        `(refund=${refundId}):`,
      cause
    )
  } catch (err) {
    console.error(
      `[upgrade-proration][ALERT] FALHA no fallback FS$ do refund ${refundId} — compensação ` +
        `pendente de intervenção manual:`,
      err
    )
  }
}

/**
 * Sweep de re-tentativa (chamado pelo reconcile-cron): re-executa estornos FAILED_RETRYABLE
 * e REQUESTED órfãos (criados há 10+ min sem consolidação — ex. crash entre o commit do
 * upgrade e a execução pós-commit; o outbox durável garante que o registro existe).
 * Corrida sweep×execução original: gateway idempotente por X-Idempotency-Key + efeitos
 * locais com gate effectsAppliedAt => repetição é inócua (review F3).
 */
export async function sweepPendingUpgradeProrationRefunds(
  limit = 20
): Promise<{ scanned: number; succeeded: number; retryable: number; unsupported: number }> {
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000)
  const rows = await prisma.paymentRefund.findMany({
    where: {
      reason: UPGRADE_PRORATION_REASON,
      OR: [
        { status: 'FAILED_RETRYABLE' },
        { status: 'REQUESTED', createdAt: { lt: tenMinAgo } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  })
  let succeeded = 0
  let retryable = 0
  let unsupported = 0
  for (const row of rows) {
    const r = await executeUpgradeProrationRefund(row.id)
    if (r === 'SUCCEEDED') succeeded++
    else if (r === 'FAILED_RETRYABLE') retryable++
    else if (r === 'FAILED_UNSUPPORTED') unsupported++
  }
  return { scanned: rows.length, succeeded, retryable, unsupported }
}
