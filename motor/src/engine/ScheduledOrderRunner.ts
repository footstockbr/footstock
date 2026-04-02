// ============================================================================
// Foot Stock Motor — ScheduledOrderRunner
// Executa ordens SCHEDULED no horário programado respeitando sessão de mercado.
// Rastreabilidade: INT-015 / TASK-3/ST003
// ============================================================================

import { PrismaClient } from '@prisma/client'
import type Redis from 'ioredis'
import { SessionManager } from './SessionManager'
import { logger } from '../utils/logger'
import { validateTransition } from './order-contract'
import { calculateFee } from './fee-constants'
import type { PrismaOrder } from '../types/prisma.types'

export class ScheduledOrderRunner {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly sessionManager: SessionManager,
  ) {}

  /**
   * Verifica e executa ordens SCHEDULED cujo horário chegou.
   * Ordens aguardam sessão NEGOCIACAO para serem executadas.
   */
  async checkScheduledOrders(currentPrices: Record<string, number>): Promise<void> {
    const now = new Date()
    const session = this.sessionManager.getCurrentSession()

    const orders = await this.prisma.order.findMany({
      where: {
        type: 'SCHEDULED',
        status: 'OPEN',
        scheduledAt: { lte: now },
      },
      include: { asset: true },
      orderBy: { scheduledAt: 'asc' },
    })

    if (orders.length === 0) return

    if (session !== 'NEGOCIACAO') {
      logger.info(`[ScheduledOrderRunner] ${orders.length} ordens aguardando sessão NEGOCIACAO (atual: ${session})`)
      return
    }

    await Promise.allSettled(
      orders.map(async (order: PrismaOrder & { asset: { ticker: string } }) => {
        const price = currentPrices[order.asset.ticker]
        if (price === undefined || price <= 0) {
          logger.warn(`[ScheduledOrderRunner] ticker sem preço: ${order.asset.ticker}`)
          return
        }

        await this._executeScheduled(order, price, now)
      })
    )
  }

  private async _executeScheduled(
    order: PrismaOrder & { asset: { ticker: string } },
    price: number,
    now: Date,
  ): Promise<void> {
    try {
      const executionDelay = order.scheduledAt
        ? now.getTime() - order.scheduledAt.getTime()
        : 0

      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } })
        const operationValue = order.quantity * price
        const feeAmount = calculateFee(operationValue)

        const totalCost = order.side === 'BUY'
          ? operationValue + feeAmount
          : -(operationValue - feeAmount)

        const newBalance = Number(user.fsBalance) + (order.side === 'BUY' ? -totalCost : -totalCost)

        if (order.side === 'BUY' && newBalance < 0) {
          throw new Error(`Saldo insuficiente para ordem agendada ${order.id}`)
        }

        validateTransition(order.status as any, 'FILLED' as any, order.id)

        await tx.order.update({
          where: { id: order.id },
          data: { status: 'FILLED', executedPrice: price, fee: feeAmount, executedAt: now },
        })
        await tx.user.update({ where: { id: order.userId }, data: { fsBalance: newBalance } })
        await tx.transaction.create({
          data: {
            userId: order.userId, assetId: order.assetId, orderId: order.id,
            type: 'SCHEDULED', financialType: 'TRADE', side: order.side,
            quantity: order.quantity, price, fee: feeAmount,
            totalAmount: Math.abs(totalCost),
            fsAmount: order.side === 'BUY' ? -Math.abs(totalCost) : Math.abs(totalCost),
            balanceBefore: Number(user.fsBalance), balanceAfter: newBalance,
          },
        })
      })

      await this.redis.publish(
        `orders:executed:${order.userId}`,
        JSON.stringify({ orderId: order.id, ticker: order.asset.ticker, price, executionDelay })
      )

      logger.info(`[ScheduledOrderRunner] OK orderId=${order.id} delay=${executionDelay}ms`)
    } catch (err) {
      logger.error(`[ScheduledOrderRunner] FAIL orderId=${order.id}: ${String(err)}`)
    }
  }
}
