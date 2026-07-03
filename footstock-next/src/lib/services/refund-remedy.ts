/**
 * M067 — Remédio do arrependimento (CDC Art. 49) por tipo de contratação.
 *
 * Indicação do review /mcp:codex (2026-07-03): o arrependimento de um UPGRADE deve
 * desfazer O UPGRADE — restaurar o plano anterior até o fim do período que já estava
 * pago — e reverter as compensações de migração (crédito FS$ pró-rata M066), NUNCA
 * jogar o usuário para JOGADOR nem resetar o fsBalance (que apagaria ganhos legítimos
 * e o bônus da contratação original).
 *
 * Regras:
 *  - DOWNGRADE_JOGADOR (contratação inicial): comportamento clássico — plano JOGADOR
 *    imediato + fsBalance resetado para 2000 (baseline do plano gratuito).
 *  - RESTORE_PREVIOUS (upgrade): plano anterior restaurado como entitlement
 *    NÃO-RECORRENTE até o expiresAt original (o preapproval antigo foi cancelado
 *    terminalmente no upgrade — não há como religar a recorrência sem novo consent;
 *    cancelAtPeriodEnd=true + gatewayStatus='cancelled' documentam isso e o
 *    subscription-expiry faz o downgrade natural no vencimento).
 *  - Se a compensação de migração foi EM DINHEIRO (refund parcial M066 executado),
 *    restaurar o plano anterior seria dupla compensação (os dias não usados já
 *    voltaram em espécie) => cai no DOWNGRADE_JOGADOR clássico.
 *  - Crédito FS$ imediato (1.2x) e fallback (1.3x) são revertidos do fsBalance
 *    (clamp em 0) com lançamento negativo no extrato.
 *  - Bônus T+7 da sub do upgrade: se JÁ creditado, reverte apenas o DIFERENCIAL
 *    (a porção rolada da contratação original pertence ao usuário de qualquer forma);
 *    se NÃO creditado, a porção rolada volta a ser agendada na sub restaurada com a
 *    data original preservada.
 */

import { calcUpgradeBonusAmount, residualToFsCredit, UPGRADE_PRORATION_FALLBACK_FS_MULTIPLIER } from './plan-logic'
import type { Prisma, Subscription } from '@prisma/client'
import type { PlanType } from '@/lib/enums'

export type RefundRemedy =
  | { kind: 'DOWNGRADE_JOGADOR' }
  | {
      kind: 'RESTORE_PREVIOUS'
      priorSubscriptionId: string
      priorPlanType: PlanType
      priorExpiresAt: Date
      /** FS$ a debitar do saldo: crédito pró-rata imediato + fallback 1.3x + diferencial já creditado. */
      fsToRevert: number
      /** Porção rolada do bônus a re-agendar na sub restaurada (null quando já creditada/inexistente). */
      rolledBonusToRestore: { amount: number; scheduledAt: Date } | null
    }

type ProrationMeta = {
  proration?: {
    entries?: Array<{
      priorSubscriptionId?: string
      compensation?: string
      fsCredit?: number
      residualCents?: number
    }>
  }
}

/**
 * Resolve o remédio do arrependimento para a assinatura vigente. Somente LEITURA —
 * usado pelo GET /me (para a copy do modal) e pela rota de refund (antes da execução).
 */
export async function resolveRefundRemedy(
  db: Prisma.TransactionClient,
  sub: Pick<
    Subscription,
    'id' | 'planType' | 'previousPlanType' | 'upgradeProrationMeta' | 'bonusAmount' | 'bonusScheduledAt' | 'bonusCreditedAt'
  >,
  now: Date = new Date()
): Promise<RefundRemedy> {
  // Só há upgrade a desfazer quando a sub nasceu de uma troca a partir de plano PAGO.
  if (!sub.previousPlanType || sub.previousPlanType === 'JOGADOR') {
    return { kind: 'DOWNGRADE_JOGADOR' }
  }

  const meta = (sub.upgradeProrationMeta ?? {}) as ProrationMeta
  const entries = meta.proration?.entries ?? []
  const priorEntry = entries.find((e) => e.priorSubscriptionId)
  if (!priorEntry?.priorSubscriptionId) return { kind: 'DOWNGRADE_JOGADOR' }

  const prior = await db.subscription.findUnique({
    where: { id: priorEntry.priorSubscriptionId },
    select: { id: true, planType: true, status: true, expiresAt: true },
  })
  // Sem sub anterior íntegra e com tempo pago restante, não há o que restaurar.
  if (
    !prior ||
    prior.status !== 'CANCELLED' ||
    prior.planType !== sub.previousPlanType ||
    prior.expiresAt == null ||
    prior.expiresAt.getTime() <= now.getTime()
  ) {
    return { kind: 'DOWNGRADE_JOGADOR' }
  }

  // Compensação de migração em DINHEIRO já executada => restaurar seria dupla compensação.
  let fallbackFsCredited = 0
  // Formato mantido em sincronia com upgrade-proration.upgradeProrationIdempotencyKey
  // (não importar o módulo aqui: ele puxa env/gateway e este resolver precisa ser puro).
  const ledger = await db.paymentRefund.findUnique({
    where: { idempotencyKey: `upgrade-proration-${sub.id}` },
    select: { status: true, amountCents: true },
  })
  if (ledger) {
    if (ledger.status === 'SUCCEEDED' || ledger.status === 'WEBHOOK_CONFIRMED') {
      return { kind: 'DOWNGRADE_JOGADOR' }
    }
    if (ledger.status === 'FAILED_UNSUPPORTED') {
      // Fallback FS$ 1.3x foi creditado no lugar do dinheiro — reverter junto.
      fallbackFsCredited = residualToFsCredit(ledger.amountCents, UPGRADE_PRORATION_FALLBACK_FS_MULTIPLIER)
    }
  }

  // Crédito FS$ pró-rata imediato (1.2x) creditado na ativação do upgrade.
  const immediateFsCredited = entries
    .filter((e) => e.compensation === 'FS_CREDIT')
    .reduce((acc, e) => acc + (Number(e.fsCredit) || 0), 0)

  // Bônus T+7 da sub do upgrade: diferencial + porção rolada da contratação original.
  const differential = calcUpgradeBonusAmount(prior.planType as PlanType, sub.planType as PlanType)
  const totalBonus = sub.bonusAmount !== null ? Number(sub.bonusAmount) : 0
  const rolled = Math.max(0, totalBonus - differential)

  let creditedBonusToRevert = 0
  let rolledBonusToRestore: { amount: number; scheduledAt: Date } | null = null
  if (sub.bonusCreditedAt != null) {
    // Bônus já caiu no saldo: reverter só o diferencial do upgrade — a porção rolada
    // pertence à contratação original (o usuário a teria recebido de qualquer forma).
    creditedBonusToRevert = differential
  } else if (rolled > 0) {
    rolledBonusToRestore = {
      amount: rolled,
      scheduledAt: sub.bonusScheduledAt ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    }
  }

  const fsToRevert =
    Math.round((immediateFsCredited + fallbackFsCredited + creditedBonusToRevert) * 100) / 100

  return {
    kind: 'RESTORE_PREVIOUS',
    priorSubscriptionId: prior.id,
    priorPlanType: prior.planType as PlanType,
    priorExpiresAt: prior.expiresAt,
    fsToRevert,
    rolledBonusToRestore,
  }
}

/**
 * Executa o remédio RESTORE_PREVIOUS dentro da transação do refund (a sub do upgrade
 * já foi marcada CANCELLED+refundRequested pelo caller). Reverte FS$ com clamp em 0 e
 * lançamento negativo no extrato (auditoria).
 */
export async function applyRestorePreviousRemedy(
  tx: Prisma.TransactionClient,
  params: { userId: string; remedy: Extract<RefundRemedy, { kind: 'RESTORE_PREVIOUS' }> }
): Promise<{ fsReverted: number }> {
  const { userId, remedy } = params

  // Restaurar a sub anterior como entitlement NÃO-RECORRENTE até o vencimento original.
  await tx.subscription.update({
    where: { id: remedy.priorSubscriptionId },
    data: {
      status: 'ACTIVE',
      cancelledAt: null,
      cancelAtPeriodEnd: true,
      gatewayStatus: 'cancelled',
      ...(remedy.rolledBonusToRestore
        ? {
            bonusAmount: remedy.rolledBonusToRestore.amount,
            bonusScheduledAt: remedy.rolledBonusToRestore.scheduledAt,
            bonusCreditedAt: null,
          }
        : {}),
    },
  })

  // Plano anterior de volta; fsBalance ajustado (NUNCA reset — ganhos legítimos ficam).
  const userRow = await tx.user.findUnique({ where: { id: userId }, select: { fsBalance: true } })
  const balance = userRow ? Number(userRow.fsBalance) : 0
  const fsReverted = Math.min(balance, Math.max(0, remedy.fsToRevert))
  await tx.user.update({
    where: { id: userId },
    data: { planType: remedy.priorPlanType as never, fsBalance: balance - fsReverted },
  })

  if (fsReverted > 0) {
    await tx.transaction.create({
      data: {
        userId,
        financialType: 'BONUS',
        totalAmount: -fsReverted,
        fsAmount: -fsReverted,
        balanceBefore: balance,
        balanceAfter: balance - fsReverted,
        assetId: null,
        type: null,
        side: null,
        quantity: null,
        price: null,
        fee: null,
      } as never,
    })
  }

  return { fsReverted }
}
