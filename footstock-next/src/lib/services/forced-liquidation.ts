// ============================================================================
// FootStock — Forced Liquidation (FIX-08)
// Liquidação compulsória de posições RESTRITAS (SHORT, alavancada) + cancelamento
// de ordens OCO/SCHEDULED quando um usuário é rebaixado para um plano incompatível.
//
// Fonte da verdade da liquidação no fluxo de refund (rota self-service + webhook
// REFUND_COMPLETED). A lógica nasceu no cron T+48h `cancellation-lock` (código morto
// removido pelo FIX-10), porém esse cron nunca disparava (forcedLiquidationAt era
// sempre null). Aqui ela vira um serviço reutilizável e síncrono, chamado no momento
// do estorno/rebaixamento — garantindo que NUNCA se rebaixa deixando posição órfã.
// ============================================================================

import { prisma } from '@/lib/prisma'
import { shortService } from '@/lib/services/ShortService'
import { orderService } from '@/lib/services/OrderService'
import { leverageService } from '@/lib/services/LeverageService'

export interface RestrictedPosition {
  id: string
  side: 'SHORT' | 'LONG'
  isLeveraged: boolean
  ticker: string
  quantity: number
  currentPrice: number
}

export interface LiquidationOutcome {
  /** Posições restritas encontradas no início + ordens OCO/SCHEDULED pendentes. */
  found: number
  /** Posições encerradas + ordens canceladas com sucesso. */
  liquidated: number
  /** Posições/ordens que falharam ao encerrar (suporte deve ser notificado). */
  failed: number
  /** Posições restritas que continuam OPEN após a tentativa (recontagem real). */
  remaining: number
  /** true quando não sobrou nenhuma posição restrita aberta E nada falhou. */
  cleared: boolean
}

/**
 * Posições incompatíveis com o plano JOGADOR que precisam ser liquidadas:
 * - SHORTs abertos
 * - Posições LONG alavancadas (leverageMultiplier > 1)
 * Ordens OCO/SCHEDULED são tratadas separadamente em `liquidateRestrictedPositions`.
 */
export async function getRestrictedPositions(userId: string): Promise<RestrictedPosition[]> {
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

/** Conta posições restritas abertas sem carregar os relacionamentos (check barato). */
export async function countRestrictedPositions(userId: string): Promise<number> {
  return prisma.position.count({
    where: {
      userId,
      status: 'OPEN',
      OR: [
        { side: 'SHORT' },
        { side: 'LONG', leverageMultiplier: { gt: 1 } },
      ],
    },
  })
}

/**
 * Liquida posições SHORT e alavancadas a preço de mercado e cancela ordens
 * OCO/SCHEDULED pendentes. Best-effort por posição (uma falha não aborta as demais),
 * mas SEMPRE recontabiliza as posições restritas restantes ao final para que o
 * chamador decida bloquear (rota self-service) ou apenas alertar (webhook).
 *
 * @param reason rótulo de auditoria (ex.: REFUND_COOLING_OFF, REFUND_COMPLETED_WEBHOOK)
 */
export async function liquidateRestrictedPositions(
  userId: string,
  subscriptionId: string,
  reason: string,
): Promise<LiquidationOutcome> {
  const positions = await getRestrictedPositions(userId)

  let liquidated = 0
  let failed = 0
  let foundOrders = 0

  for (const pos of positions) {
    try {
      if (pos.side === 'SHORT') {
        await shortService.closeShort(userId, pos.id, pos.currentPrice, reason)
      } else if (pos.isLeveraged) {
        const didClose = await leverageService.forceCloseLeveraged(pos.id, pos.currentPrice, reason)
        if (!didClose) {
          failed++
          continue
        }
      }

      await prisma.adminMarketAction.create({
        data: {
          adminId: userId, // actor = sistema (userId do assinante)
          action: 'FORCE_SELL',
          reason,
          details: {
            subscriptionId,
            positionId: pos.id,
            side: pos.side,
            ticker: pos.ticker,
            quantity: pos.quantity,
            priceAtExecution: pos.currentPrice,
          },
        },
      }).catch((err) => console.error('[forced-liquidation] Falha ao registrar auditoria:', err))

      liquidated++
    } catch (err) {
      console.error(`[forced-liquidation] Falha ao liquidar posição ${pos.id} (reason=${reason}):`, err)
      failed++
    }
  }

  // Cancelar ordens OCO e SCHEDULED pendentes (incompatíveis com JOGADOR).
  try {
    const pendingOrders = await prisma.order.findMany({
      where: { userId, status: { in: ['OPEN', 'PARTIAL'] }, type: { in: ['OCO', 'SCHEDULED'] } },
      select: { id: true },
    })
    foundOrders = pendingOrders.length
    for (const order of pendingOrders) {
      try {
        await orderService.cancelOrder(userId, order.id)
        liquidated++
      } catch (err) {
        console.error(`[forced-liquidation] Falha ao cancelar ordem ${order.id} (reason=${reason}):`, err)
        failed++
      }
    }
  } catch (err) {
    console.error(`[forced-liquidation] Falha ao buscar ordens OCO/SCHEDULED (reason=${reason}):`, err)
  }

  // Recontagem real: a única fonte da verdade sobre "sobrou posição órfã".
  const remaining = await countRestrictedPositions(userId)

  return {
    found: positions.length + foundOrders,
    liquidated,
    failed,
    remaining,
    cleared: remaining === 0 && failed === 0,
  }
}
