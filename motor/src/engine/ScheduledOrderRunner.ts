// ============================================================================
// FootStock Motor — ScheduledOrderRunner
// Executa ordens SCHEDULED no horário programado respeitando sessão de mercado.
// Rastreabilidade: INT-015 / TASK-3/ST003
// ============================================================================

import { PrismaClient, Prisma } from '@prisma/client'
import type Redis from 'ioredis'
import { SessionManager } from './SessionManager'
import { logger } from '../utils/logger'
import { settleOrderFill } from './settlement'
import type { PrismaOrder } from '../types/prisma.types'

export class ScheduledOrderRunner {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly sessionManager: SessionManager,
  ) {}

  /**
   * Verifica e executa ordens SCHEDULED cujo horário chegou.
   * Ordens aguardam sessão TRADING para serem executadas.
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

    if (session !== 'TRADING') {
      logger.info(`[ScheduledOrderRunner] ${orders.length} ordens aguardando sessão TRADING (atual: ${session})`)
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

      const result = await this.prisma.$transaction(
        (tx: Prisma.TransactionClient) => settleOrderFill(tx, order, price),
        { isolationLevel: 'Serializable' },
      )

      if (!result.settled) {
        if (result.reason === 'INSUFFICIENT_BALANCE') {
          logger.warn(`[ScheduledOrderRunner] INSUFFICIENT_BALANCE: ordem agendada ${order.id} cancelada no fill`)
          await Promise.allSettled([
            this.redis.publish(
              `orders:cancelled:${order.userId}`,
              JSON.stringify({ orderId: order.id, ticker: order.asset.ticker, motivo: 'INSUFFICIENT_BALANCE' })
            ),
            this.redis.publish(
              `notifications:${order.userId}`,
              JSON.stringify({
                type: 'ORDER_CANCELLED', orderId: order.id, ticker: order.asset.ticker,
                motivo: 'Saldo insuficiente no momento da execução agendada. Ordem cancelada.',
              })
            ),
          ])
        }
        return
      }

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
