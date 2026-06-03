// ============================================================================
// FootStock Motor — OrderMatcher
// Verifica ordens LIMIT e OCO a cada tick e executa quando condições atingidas.
// Rastreabilidade: INT-012, INT-013 / TASK-3
// ============================================================================

import { PrismaClient, Prisma } from '@prisma/client'
import type Redis from 'ioredis'
import { logger } from '../utils/logger'
import { settleOrderFill } from './settlement'
import type { PrismaOrder } from '../types/prisma.types'

const BATCH_SIZE = 100

export class OrderMatcher {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  /**
   * Verifica ordens LIMIT e OCO pendentes a cada tick.
   * Executa quando o preço-alvo é atingido (com price improvement).
   */
  async checkLimitOrders(currentPrices: Record<string, number>): Promise<void> {
    const orders = await this.prisma.order.findMany({
      where: { type: { in: ['LIMIT', 'OCO'] }, status: 'OPEN' },
      take: BATCH_SIZE,
      include: { asset: true },
      orderBy: { createdAt: 'asc' },
    })

    if (orders.length === 0) return

    await Promise.allSettled(
      orders.map(async (order: PrismaOrder & { asset: { ticker: string } }) => {
        const currentPrice = currentPrices[order.asset.ticker]
        if (currentPrice === undefined) return

        const limitPrice = order.price ? Number(order.price) : null
        if (limitPrice === null) return

        if (order.type === 'LIMIT') {
          await this._checkLimitTrigger(order, currentPrice, limitPrice)
        } else if (order.type === 'OCO') {
          await this._checkOcoTrigger(order, currentPrice)
        }
      })
    )
  }

  private async _checkLimitTrigger(
    order: PrismaOrder & { asset: { ticker: string } },
    currentPrice: number,
    limitPrice: number,
  ): Promise<void> {
    const shouldExecute =
      (order.side === 'BUY' && currentPrice <= limitPrice) ||
      (order.side === 'SELL' && currentPrice >= limitPrice)

    if (!shouldExecute) return

    const priceImprovement = order.side === 'BUY' ? limitPrice - currentPrice : currentPrice - limitPrice

    logger.info(
      `[OrderMatcher] LIMIT ${order.side} orderId=${order.id} ` +
      `limitPrice=${limitPrice} executionPrice=${currentPrice} improvement=${priceImprovement.toFixed(4)}`
    )

    await this._executeLimitOrder(order, currentPrice)
  }

  private async _checkOcoTrigger(
    order: PrismaOrder & { asset: { ticker: string } },
    currentPrice: number,
  ): Promise<void> {
    if (!order.groupId) return

    // Os campos stopLossPrice e takeProfitPrice estão em metadata (usamos price para take-profit)
    // OCO perna take-profit: side=SELL, type=OCO, price=takeProfitPrice
    // OCO perna stop-loss: side=SELL, type=OCO, price=stopLossPrice (identificado por ser o menor)
    // Buscar par OCO
    const pair = await this.prisma.order.findMany({
      where: { groupId: order.groupId, status: 'OPEN', type: 'OCO' },
      include: { asset: true },
    })

    if (pair.length < 2) {
      // Uma perna já foi processada
      return
    }

    // Determinar pernas por preço (menor = stop-loss, maior = take-profit)
    const prices = pair.map((p: PrismaOrder & { asset: { ticker: string } }) => Number(p.price ?? 0))
    const stopLossOrder = pair[prices.indexOf(Math.min(...prices))]
    const takeProfitOrder = pair[prices.indexOf(Math.max(...prices))]

    // Verificar take-profit (preço subiu acima)
    if (currentPrice >= Number(takeProfitOrder.price)) {
      await this._executeOcoLeg(takeProfitOrder, stopLossOrder, currentPrice, 'Take Profit executado (OCO)')
      return
    }

    // Verificar stop-loss (preço caiu abaixo)
    if (currentPrice <= Number(stopLossOrder.price)) {
      await this._executeOcoLeg(stopLossOrder, takeProfitOrder, currentPrice, 'Stop Loss executado (OCO)')
    }
  }

  private async _executeLimitOrder(
    order: PrismaOrder & { asset: { ticker: string } },
    executionPrice: number,
  ): Promise<void> {
    try {
      const result = await this.prisma.$transaction(
        (tx: Prisma.TransactionClient) => settleOrderFill(tx, order, executionPrice),
        { isolationLevel: 'Serializable' },
      )

      if (!result.settled) {
        if (result.reason === 'INSUFFICIENT_BALANCE') {
          await this._notifyCancelled(order, 'Saldo insuficiente no momento da execução LIMIT. Ordem cancelada.')
        }
        return
      }

      await this.redis.publish(
        `orders:executed:${order.userId}`,
        JSON.stringify({ orderId: order.id, ticker: order.asset.ticker, price: executionPrice })
      )
      logger.info(`[OrderMatcher] LIMIT OK orderId=${order.id} ticker=${order.asset.ticker} price=${executionPrice}`)
    } catch (err) {
      logger.error(`[OrderMatcher] LIMIT fail orderId=${order.id}: ${String(err)}`)
    }
  }

  private async _executeOcoLeg(
    executedLeg: PrismaOrder & { asset: { ticker: string } },
    cancelledLeg: PrismaOrder & { asset: { ticker: string } },
    executionPrice: number,
    reason: string,
  ): Promise<void> {
    try {
      // Settlement da perna disparada + cancelamento de TODAS as outras pernas do
      // grupo na MESMA transação (atômico, anti-corrida entre ticks).
      const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const r = await settleOrderFill(tx, executedLeg, executionPrice)
        if (!r.settled) return r
        if (executedLeg.groupId) {
          await tx.order.updateMany({
            where: {
              groupId: executedLeg.groupId,
              id: { not: executedLeg.id },
              status: { in: ['OPEN', 'PARTIAL'] },
            },
            data: { status: 'CANCELLED' },
          })
        }
        return r
      }, { isolationLevel: 'Serializable' })

      if (!result.settled) {
        if (result.reason === 'INSUFFICIENT_BALANCE') {
          await this._notifyCancelled(executedLeg, 'Saldo insuficiente ao disparar OCO. Ordem cancelada.')
        }
        return
      }

      await Promise.allSettled([
        this.redis.publish(
          `orders:executed:${executedLeg.userId}`,
          JSON.stringify({ orderId: executedLeg.id, ticker: executedLeg.asset.ticker, price: executionPrice })
        ),
        this.redis.publish(
          `orders:cancelled:${executedLeg.userId}`,
          JSON.stringify({ orderId: cancelledLeg.id, motivo: reason })
        ),
        this.redis.publish(
          `notifications:${executedLeg.userId}`,
          JSON.stringify({ type: 'ORDER_CANCELLED', orderId: cancelledLeg.id, motivo: reason })
        ),
      ])

      logger.info(`[OrderMatcher] OCO executado: ${executedLeg.id} (${reason}), grupo ${executedLeg.groupId} cancelado`)
    } catch (err) {
      logger.error(`[OrderMatcher] OCO fail: ${String(err)}`)
    }
  }

  private async _notifyCancelled(
    order: PrismaOrder & { asset: { ticker: string } },
    motivo: string,
  ): Promise<void> {
    await Promise.allSettled([
      this.redis.publish(
        `orders:cancelled:${order.userId}`,
        JSON.stringify({ orderId: order.id, ticker: order.asset.ticker, motivo })
      ),
      this.redis.publish(
        `notifications:${order.userId}`,
        JSON.stringify({ type: 'ORDER_CANCELLED', orderId: order.id, ticker: order.asset.ticker, motivo })
      ),
    ])
  }
}
