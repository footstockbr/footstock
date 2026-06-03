// ============================================================================
// FootStock Motor — OrderExecutor
// Processa ordens MARKET pendentes a cada tick em batch seguro.
// Rastreabilidade: INT-011 / TASK-2/ST001
// ============================================================================

import { PrismaClient, Prisma } from '@prisma/client'
import type Redis from 'ioredis'
import { logger } from '../utils/logger'
import { settleOrderFill } from './settlement'
import type { PrismaOrder, PrismaDecimal } from '../types/prisma.types'

const BATCH_SIZE = 50

export class OrderExecutor {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  /**
   * Processa ordens MARKET pendentes com os preços atuais do tick.
   * Chama TransactionService via HTTP interno ou executa inline (Railway env).
   */
  async processPendingMarketOrders(currentPrices: Record<string, number>): Promise<void> {
    const orders = await this.prisma.order.findMany({
      where: { type: 'MARKET', status: 'OPEN' },
      take: BATCH_SIZE,
      include: { asset: true },
      orderBy: { createdAt: 'asc' },
    })

    if (orders.length === 0) return

    const results = await Promise.allSettled(
      orders.map(async (order: PrismaOrder & { asset: { ticker: string; currentPrice: PrismaDecimal; isHalted: boolean } }) => {
        // Rejeitar ordens MARKET em ativos suspensos por circuit breaker / halt admin
        if (order.asset.isHalted) {
          logger.warn(`[OrderExecutor] ASSET_HALTED: cancelando MARKET ordem ${order.id} para ${order.asset.ticker}`)
          await this._cancelHaltedMarketOrder(order)
          return
        }

        const price = currentPrices[order.asset.ticker]
        if (price === undefined || price <= 0) {
          logger.warn(`[OrderExecutor] skip: ticker sem preço no tick: ${order.asset.ticker}`)
          return
        }

        await this._executeOrder(order, price)
      })
    )

    const failed = results.filter(r => r.status === 'rejected')
    if (failed.length > 0) {
      logger.error(`[OrderExecutor] ${failed.length} ordens falharam no batch`)
    }
  }

  private async _executeOrder(
    order: PrismaOrder & { asset: { ticker: string; currentPrice: PrismaDecimal } },
    price: number,
  ): Promise<void> {
    try {
      // Liquidação unificada (debit-on-execute) — settlement é a autoridade financeira.
      const result = await this.prisma.$transaction(
        (tx: Prisma.TransactionClient) => settleOrderFill(tx, order, price),
        { isolationLevel: 'Serializable' },
      )

      if (!result.settled) {
        if (result.reason === 'INSUFFICIENT_BALANCE') {
          logger.warn(`[OrderExecutor] INSUFFICIENT_BALANCE: ordem ${order.id} cancelada no fill (${order.asset.ticker})`)
          await Promise.allSettled([
            this.redis.publish(
              `orders:cancelled:${order.userId}`,
              JSON.stringify({ orderId: order.id, ticker: order.asset.ticker, motivo: 'INSUFFICIENT_BALANCE' })
            ),
            this.redis.publish(
              `notifications:${order.userId}`,
              JSON.stringify({
                type: 'ORDER_CANCELLED', orderId: order.id, ticker: order.asset.ticker,
                motivo: 'Saldo insuficiente no momento da execução. Ordem cancelada.',
              })
            ),
          ])
        }
        return
      }

      await this.redis.publish(
        `orders:executed:${order.userId}`,
        JSON.stringify({
          orderId: order.id, ticker: order.asset.ticker, price,
          quantity: order.quantity, side: order.side,
        })
      )
      await this.redis.incr('motor:metrics:orders_executed').catch(() => {})

      logger.info(`[OrderExecutor] OK orderId=${order.id} ticker=${order.asset.ticker} price=${price} fee=${result.feeAmount}`)
    } catch (err) {
      logger.error(`[OrderExecutor] FAIL orderId=${order.id}: ${String(err)}`)
      throw err
    }
  }

  /**
   * Cancela uma ordem MARKET para ativo suspenso (halt/circuit breaker).
   * debit-on-execute: a ordem NÃO reservou saldo na criação → cancela sem reembolso.
   */
  private async _cancelHaltedMarketOrder(
    order: PrismaOrder & { asset: { ticker: string; currentPrice: PrismaDecimal; isHalted: boolean } }
  ): Promise<void> {
    try {
      // CAS: só cancela se ainda OPEN/PARTIAL (anti-corrida com fill no mesmo tick)
      const claim = await this.prisma.order.updateMany({
        where: { id: order.id, status: { in: ['OPEN', 'PARTIAL'] } },
        data: { status: 'CANCELLED' },
      })
      if (claim.count !== 1) return

      await this.redis.publish(
        `orders:cancelled:${order.userId}`,
        JSON.stringify({ orderId: order.id, ticker: order.asset.ticker, motivo: 'ASSET_HALTED' })
      )

      logger.info(`[OrderExecutor] MARKET ordem ${order.id} cancelada por ASSET_HALTED (${order.asset.ticker})`)
    } catch (err) {
      logger.error(`[OrderExecutor] Falha ao cancelar ordem ${order.id} por halt: ${String(err)}`)
    }
  }
}
