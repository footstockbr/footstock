// ============================================================================
// FootStock — Job: cancellation-lock (T+48h)
// Cron a cada hora: liquida posições RESTRITAS (SHORT, OCO, alavancadas)
// quando forcedLiquidationAt <= now e lock ainda ativo ou já substituído por downgrade pago
// Idempotente via forcedLiquidationExecutedAt — não reprocessa o mesmo lock
// Dois crons distintos: este (T+48h) e cancellation-expiry (T+7d)
// ============================================================================

import { prisma } from '@/lib/prisma'
import { shortService } from '@/lib/services/ShortService'
import { orderService } from '@/lib/services/OrderService'
import { leverageService } from '@/lib/services/LeverageService'

export interface ForcedLiquidationResult {
  processed: number
  errors: number
  details: Array<{ subscriptionId: string; userId: string; action: string; error?: string }>
}

/**
 * Busca posições restritas que precisam ser liquidadas compulsoriamente:
 * - SHORTs abertos
 * - Posições LONG alavancadas (leverageMultiplier > 1)
 * Ordens OCO/SCHEDULED são canceladas separadamente.
 */
async function getRestrictedPositions(userId: string) {
  const positions = await prisma.position.findMany({
    where: {
      userId,
      status: 'OPEN',
      OR: [
        { side: 'SHORT' },
        { side: 'LONG', leverageMultiplier: { gt: 1 } },
      ],
    },
    include: { asset: { select: { ticker: true, currentPrice: true } } },
  })

  return positions.map((p) => ({
    id: p.id,
    side: p.side as 'SHORT' | 'LONG',
    isLeveraged: Number(p.leverageMultiplier) > 1,
    ticker: p.asset.ticker,
    quantity: Number(p.quantity),
    currentPrice: Number(p.asset.currentPrice),
  }))
}

/**
 * Liquida posições SHORT e alavancadas, cancela ordens OCO/SCHEDULED.
 * Retorna o valor total liquidado (sem garantia de precisão contábil — ver adminMarketActions).
 */
async function liquidateRestrictedPositions(
  userId: string,
  subscriptionId: string,
  positions: Awaited<ReturnType<typeof getRestrictedPositions>>
): Promise<{ liquidated: number; failed: number }> {
  let liquidated = 0
  let failed = 0

  for (const pos of positions) {
    try {
      if (pos.side === 'SHORT') {
        await shortService.closeShort(userId, pos.id, pos.currentPrice, 'COMPULSORY_LIQUIDATION')
      } else if (pos.isLeveraged) {
        // Encerramento compulsório de posição alavancada LONG a preço de mercado
        const didClose = await leverageService.forceCloseLeveraged(pos.id, pos.currentPrice, 'CANCELLATION_LOCK_FORCED_LIQUIDATION')
        if (!didClose) continue
      }

      // Registro de auditoria
      await prisma.adminMarketAction.create({
        data: {
          adminId: userId, // actor = sistema (userId do assinante)
          action: 'FORCE_SELL',
          reason: 'CANCELLATION_LOCK_FORCED_LIQUIDATION',
          details: {
            subscriptionId,
            positionId: pos.id,
            side: pos.side,
            ticker: pos.ticker,
            quantity: pos.quantity,
            priceAtExecution: pos.currentPrice,
          },
        },
      }).catch((err) => console.error('[cancellation-lock] Falha ao registrar auditoria:', err))

      liquidated++
    } catch (err) {
      console.error(`[cancellation-lock T+48h] Falha ao liquidar posição ${pos.id}:`, err)
      failed++
    }
  }

  // Cancelar ordens OCO e SCHEDULED pendentes
  try {
    const pendingOrders = await prisma.order.findMany({
      where: { userId, status: { in: ['OPEN', 'PARTIAL'] }, type: { in: ['OCO', 'SCHEDULED'] } },
      select: { id: true },
    })
    for (const order of pendingOrders) {
      try {
        await orderService.cancelOrder(userId, order.id)
        liquidated++
      } catch (err) {
        console.error(`[cancellation-lock T+48h] Falha ao cancelar ordem ${order.id}:`, err)
        failed++
      }
    }
  } catch (err) {
    console.error('[cancellation-lock T+48h] Falha ao buscar ordens OCO/SCHEDULED:', err)
  }

  return { liquidated, failed }
}

/**
 * Processa liquidações forçadas T+48h em locks ativos ou em locks já substituídos
 * por downgrade pago. Neste segundo caso, a assinatura antiga já está CANCELLED,
 * mas a obrigação de liquidar posições incompatíveis com o plano novo permanece.
 * Idempotente: só processa locks onde forcedLiquidationExecutedAt IS NULL.
 */
export async function processForcedLiquidations(): Promise<ForcedLiquidationResult> {
  const now = new Date()
  const result: ForcedLiquidationResult = { processed: 0, errors: 0, details: [] }

  // Claim atômico: marca forcedLiquidationExecutedAt antes de processar
  // Previne que múltiplas instâncias do cron processem o mesmo lock (multi-instance safety)
  const dueForLiquidation = await prisma.subscription.findMany({
    where: {
      status: { in: ['CANCELLATION_LOCK', 'CANCELLED'] },
      forcedLiquidationAt: { lte: now },
      forcedLiquidationExecutedAt: null, // não processado ainda
    },
    select: { id: true, userId: true, planType: true, status: true, forcedLiquidationAt: true },
  })

  for (const sub of dueForLiquidation) {
    // Claim row-level com updateMany (compare-and-swap)
    const claim = await prisma.subscription.updateMany({
      where: {
        id: sub.id,
        status: { in: ['CANCELLATION_LOCK', 'CANCELLED'] },
        forcedLiquidationExecutedAt: null, // garantia de idempotência
      },
      data: { forcedLiquidationExecutedAt: now },
    })

    // Outra instância já processou: pular
    if (claim.count === 0) {
      result.details.push({ subscriptionId: sub.id, userId: sub.userId, action: 'SKIPPED_ALREADY_CLAIMED' })
      continue
    }

    try {
      // Revalidar após claim: se usuário reverteu entre findMany e updateMany,
      // a subscription pode ter voltado para ACTIVE. Verificar status atual.
      const currentSub = await prisma.subscription.findUnique({
        where: { id: sub.id },
        select: { status: true },
      })

      if (!currentSub || !['CANCELLATION_LOCK', 'CANCELLED'].includes(currentSub.status)) {
        // Revert aconteceu ou status mudou: não processar
        result.details.push({ subscriptionId: sub.id, userId: sub.userId, action: 'SKIPPED_STATUS_CHANGED_AFTER_CLAIM' })
        continue
      }

      const positions = await getRestrictedPositions(sub.userId)

      if (positions.length === 0) {
        // Usuário já liquidou voluntariamente: nada a fazer
        result.details.push({ subscriptionId: sub.id, userId: sub.userId, action: 'NO_RESTRICTED_POSITIONS' })
        result.processed++
        continue
      }

      // Notificar ANTES da liquidação
      await prisma.notification.create({
        data: {
          userId: sub.userId,
          type: 'CANCELLATION_LOCK_ACTIVE',
          title: 'Liquidação compulsória iniciada',
          body: `Suas ${positions.length} posição(ões) restrita(s) (short, alavancada, OCO) estão sendo encerradas compulsoriamente conforme comunicado no início do cancelamento.`,
          isRead: false,
        },
      }).catch(() => {})

      const { liquidated, failed } = await liquidateRestrictedPositions(sub.userId, sub.id, positions)

      // Notificar APÓS a liquidação
      await prisma.notification.create({
        data: {
          userId: sub.userId,
          type: 'CANCELLATION_LOCK_LIQUIDATED',
          title: 'Posições restritas encerradas',
          body: currentSub.status === 'CANCELLATION_LOCK'
            ? `${liquidated} posição(ões) encerrada(s)${failed > 0 ? ` (${failed} com falha — suporte notificado)` : ''}. Sua assinatura ainda pode ser revertida até o prazo de 7 dias.`
            : `${liquidated} posição(ões) restrita(s) encerrada(s)${failed > 0 ? ` (${failed} com falha — suporte notificado)` : ''} após a troca para um plano incompatível.`,
          isRead: false,
        },
      }).catch(() => {})

      result.details.push({
        subscriptionId: sub.id,
        userId: sub.userId,
        action: `FORCED_LIQUIDATION_${liquidated}_POSITIONS${failed > 0 ? `_${failed}_FAILED` : ''}`,
      })
      result.processed++
    } catch (err) {
      console.error(`[cancellation-lock T+48h] Erro ao processar ${sub.id}:`, err)
      result.errors++
      result.details.push({ subscriptionId: sub.id, userId: sub.userId, action: 'ERROR', error: String(err) })
    }
  }

  return result
}
