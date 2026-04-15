// ============================================================================
// Foot Stock Motor — OrderMatcher
// Verifica ordens LIMIT e OCO a cada tick e executa quando condições atingidas.
// Rastreabilidade: INT-012, INT-013 / TASK-3
// ============================================================================

import { PrismaClient, Prisma } from '@prisma/client'
import type Redis from 'ioredis'
import { logger } from '../utils/logger'
import { validateTransition } from './order-contract'
import { calculateFee } from './fee-constants'
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
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } })

        const operationValue = order.quantity * executionPrice
        const feeAmount = calculateFee(operationValue)

        const totalCost = order.side === 'BUY'
          ? operationValue + feeAmount
          : -(operationValue - feeAmount)

        const newBalance = Number(user.fsBalance) - totalCost

        if (order.side === 'BUY' && newBalance < 0) {
          throw new Error(`Saldo insuficiente no momento da execução LIMIT ${order.id}`)
        }

        validateTransition(order.status as any, 'FILLED' as any, order.id)

        await tx.order.update({
          where: { id: order.id },
          data: { status: 'FILLED', executedPrice: executionPrice, fee: feeAmount, executedAt: new Date() },
        })
        await tx.user.update({ where: { id: order.userId }, data: { fsBalance: newBalance } })
        await tx.transaction.create({
          data: {
            userId: order.userId, assetId: order.assetId, orderId: order.id,
            type: order.type, financialType: 'TRADE', side: order.side,
            quantity: order.quantity, price: executionPrice, fee: feeAmount,
            totalAmount: Math.abs(totalCost),
            fsAmount: order.side === 'BUY' ? -Math.abs(totalCost) : Math.abs(totalCost),
            balanceBefore: Number(user.fsBalance), balanceAfter: newBalance,
          },
        })
      })

      await this.redis.publish(
        `orders:executed:${order.userId}`,
        JSON.stringify({ orderId: order.id, ticker: order.asset.ticker, price: executionPrice })
      )
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
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Executar perna disparada
        const user = await tx.user.findUniqueOrThrow({ where: { id: executedLeg.userId } })
        const operationValue = executedLeg.quantity * executionPrice
        const feeAmount = calculateFee(operationValue)
        const proceeds = executedLeg.quantity * executionPrice - feeAmount

        validateTransition(executedLeg.status as any, 'FILLED' as any, executedLeg.id)
        validateTransition(cancelledLeg.status as any, 'CANCELLED' as any, cancelledLeg.id)

        await tx.order.update({
          where: { id: executedLeg.id },
          data: { status: 'FILLED', executedPrice: executionPrice, fee: feeAmount, executedAt: new Date() },
        })
        await tx.user.update({
          where: { id: executedLeg.userId },
          data: { fsBalance: { increment: proceeds } },
        })

        // Cancelar perna oposta
        await tx.order.update({ where: { id: cancelledLeg.id }, data: { status: 'CANCELLED' } })

        await tx.transaction.create({
          data: {
            userId: executedLeg.userId, assetId: executedLeg.assetId, orderId: executedLeg.id,
            type: 'OCO', financialType: 'TRADE', side: executedLeg.side,
            quantity: executedLeg.quantity, price: executionPrice, fee: feeAmount,
            totalAmount: proceeds, fsAmount: proceeds,
            balanceBefore: Number(user.fsBalance), balanceAfter: Number(user.fsBalance) + proceeds,
          },
        })
      })

      // Notificações
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

      logger.info(`[OrderMatcher] OCO executado: ${executedLeg.id} (${reason}), cancelado: ${cancelledLeg.id}`)
    } catch (err) {
      logger.error(`[OrderMatcher] OCO fail: ${String(err)}`)
    }
  }
}
