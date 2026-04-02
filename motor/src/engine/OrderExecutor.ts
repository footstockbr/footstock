// ============================================================================
// Foot Stock Motor — OrderExecutor
// Processa ordens MARKET pendentes a cada tick em batch seguro.
// Rastreabilidade: INT-011 / TASK-2/ST001
// ============================================================================

import { PrismaClient } from '@prisma/client'
import type Redis from 'ioredis'
import { logger } from '../utils/logger'
import { validateTransition } from './order-contract'
import { calculateFee } from './fee-constants'
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
      orders.map(async (order: PrismaOrder & { asset: { ticker: string; currentPrice: PrismaDecimal } }) => {
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
      // Executar atomicamente via Prisma transaction inline
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } })

        // Cálculos de taxa (INTAKE canônico: taxa fixa por faixa de valor)
        const operationValue = order.quantity * price
        const feeAmount = calculateFee(operationValue)

        const leverageDiv = order.leverageMultiplier === 2 ? 2 : 1
        const totalCost = order.side === 'BUY'
          ? operationValue / leverageDiv + feeAmount
          : -(operationValue - feeAmount)

        const newBalance = Number(user.fsBalance) - (order.side === 'BUY' ? totalCost : -totalCost)

        if (order.side === 'BUY' && newBalance < 0) {
          throw new Error(`Saldo insuficiente para ordem ${order.id}`)
        }

        // Validar transição de estado antes de atualizar
        validateTransition(order.status as any, 'FILLED' as any, order.id)

        // Atualizar ordem
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'FILLED', executedPrice: price, fee: feeAmount, executedAt: new Date() },
        })

        // Atualizar saldo
        await tx.user.update({ where: { id: order.userId }, data: { fsBalance: newBalance } })

        // Upsert position LONG
        if (order.side === 'BUY') {
          const existing = await tx.position.findFirst({
            where: { userId: order.userId, assetId: order.assetId, side: 'LONG', status: 'OPEN' },
          })
          if (existing) {
            const newQty = existing.quantity + order.quantity
            const newAvg = (existing.quantity * Number(existing.avgPrice) + order.quantity * price) / newQty
            await tx.position.update({ where: { id: existing.id }, data: { quantity: newQty, avgPrice: newAvg } })
          } else {
            // Alavancagem 2x (Lenda): leverageAmount = metade do valor operado (parte emprestada)
            const leverageAmount = order.leverageMultiplier === 2
              ? (order.quantity * price) / 2
              : 0
            const dailyInterestRate = order.leverageMultiplier === 2 ? 0.003 : 0

            await tx.position.create({
              data: {
                userId: order.userId, assetId: order.assetId,
                quantity: order.quantity, avgPrice: price,
                totalInvested: order.quantity * price, side: 'LONG', status: 'OPEN',
                leverageMultiplier: order.leverageMultiplier,
                leverageAmount,
                dailyInterestRate,
                openedAt: new Date(),
              },
            })
          }
        } else {
          const existing = await tx.position.findFirst({
            where: { userId: order.userId, assetId: order.assetId, side: 'LONG', status: 'OPEN' },
          })
          if (existing) {
            const newQty = existing.quantity - order.quantity
            await tx.position.update({
              where: { id: existing.id },
              data: newQty > 0 ? { quantity: newQty } : { quantity: 0, status: 'CLOSED' },
            })
          }
        }

        // Transaction record
        await tx.transaction.create({
          data: {
            userId: order.userId, assetId: order.assetId, orderId: order.id,
            type: order.type, financialType: 'TRADE', side: order.side,
            quantity: order.quantity, price, fee: feeAmount,
            totalAmount: Math.abs(totalCost),
            fsAmount: order.side === 'BUY' ? -totalCost : totalCost,
            balanceBefore: Number(user.fsBalance),
            balanceAfter: newBalance,
          },
        })
      })

      // Notificar via Redis
      const startMs = Date.now()
      await this.redis.publish(
        `orders:executed:${order.userId}`,
        JSON.stringify({
          orderId: order.id,
          ticker: order.asset.ticker,
          price,
          quantity: order.quantity,
          side: order.side,
          durationMs: Date.now() - startMs,
        })
      )

      // Métrica para admin dashboard
      await this.redis.incr('motor:metrics:orders_executed').catch(() => {})

      logger.info(`[OrderExecutor] OK orderId=${order.id} ticker=${order.asset.ticker} price=${price}`)
    } catch (err) {
      logger.error(`[OrderExecutor] FAIL orderId=${order.id}: ${String(err)}`)
      throw err
    }
  }
}
