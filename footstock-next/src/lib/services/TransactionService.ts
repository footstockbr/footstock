// ============================================================================
// Foot Stock — TransactionService
// Execução atômica de ordens via Prisma transaction + extrato e posições.
// Rastreabilidade: INT-011, INT-018 / TASK-2
// ============================================================================

import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import { ORDER_STATUS } from '@/lib/enums'
import { calculateFee } from '@/lib/services/plan-order-limits'
import { validateTransition } from '@/lib/contracts/order-contract'
import { verifyNonNegativeBalance } from '@/lib/contracts/transaction-contract'
import { AppError } from '@/lib/services/OrderService'
import type { Order, Position, Transaction } from '@prisma/client'

export interface PositionWithPnL extends Position {
  currentPrice: number
  currentValue: number
  pnl: number
  pnlPercent: number
}

export interface TransactionFilters {
  page?: number
  limit?: number
  ticker?: string
  financialType?: string
}

export interface PaginatedResult<T> {
  data: T[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

export class TransactionService {
  /**
   * Executa uma ordem de forma atômica (Prisma transaction).
   * Atualiza saldo, cria transaction record e faz upsert da position.
   */
  async executeOrder(
    order: Order & { asset: { ticker: string; currentPrice: import('@prisma/client').Prisma.Decimal } },
    executionPrice: number,
  ): Promise<{ transaction: Transaction; position: Position }> {
    return await prisma.$transaction(async (tx) => {
      // Buscar usuário com dados mais recentes (lock implícito no Prisma)
      const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } })

      const operationValue = Number(order.quantity) * executionPrice
      const feeAmount = calculateFee(operationValue)

      let totalCost: number
      let fsAmount: number

      if (order.side === 'BUY') {
        const leverageDiv = 1  // leverage removed from order schema
        totalCost = operationValue / leverageDiv + feeAmount
        fsAmount = -totalCost
      } else {
        // SELL: recebe valor - taxa
        totalCost = operationValue - feeAmount
        fsAmount = totalCost
      }

      const balanceBefore = Number(user.fsBalance)
      const newBalance = balanceBefore + fsAmount

      // Race condition protection: re-verificar saldo em BUY
      if (order.side === 'BUY' && newBalance < 0) {
        throw new AppError('ORDER_050', 402, {
          required: Math.abs(fsAmount),
          available: balanceBefore,
          message: 'Saldo insuficiente (verificação de race condition).',
        })
      }

      // Validação de invariante
      if (!verifyNonNegativeBalance(newBalance)) {
        throw new AppError('ORDER_050', 402, { message: 'Operação resultaria em saldo negativo.' })
      }

      // Validar transição de status ANTES do update
      validateTransition(order.status as import('@/lib/enums').OrderStatus, ORDER_STATUS.EXECUTED, order.id)

      // Atualizar order status
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'EXECUTED' as import('@prisma/client').OrderStatus, feeAmount, executedAt: new Date() },
      })

      // Atualizar saldo do usuário
      await tx.user.update({
        where: { id: order.userId },
        data: { fsBalance: newBalance },
      })

      // Upsert position
      let position: Position
      const existingPos = await tx.position.findFirst({
        where: { userId: order.userId, ticker: order.ticker, side: 'LONG', status: 'OPEN' },
      })

      if (order.side === 'BUY') {
        if (existingPos) {
          const existingQty = Number(existingPos.quantity)
          const existingAvg = Number(existingPos.avgPrice)
          const orderQty = Number(order.quantity)
          const newQty = existingQty + orderQty
          const newAvg = (existingQty * existingAvg + orderQty * executionPrice) / newQty
          position = await tx.position.update({
            where: { id: existingPos.id },
            data: {
              quantity: newQty,
              avgPrice: newAvg,
            },
          })
        } else {
          position = await tx.position.create({
            data: {
              userId: order.userId,
              ticker: order.ticker,
              quantity: Number(order.quantity),
              avgPrice: executionPrice,
              side: 'LONG',
            },
          })
        }
      } else {
        // SELL: reduzir position
        if (!existingPos || Number(existingPos.quantity) < Number(order.quantity)) {
          throw new AppError('ORDER_050', 402, { message: 'Posição insuficiente para venda.' })
        }
        const newQty = Number(existingPos.quantity) - Number(order.quantity)
        position = await tx.position.update({
          where: { id: existingPos.id },
          data: newQty > 0
            ? { quantity: newQty }
            : { quantity: 0, status: 'CLOSED' },
        })
      }

      // Criar registro de transação
      const transaction = await tx.transaction.create({
        data: {
          userId: order.userId,
          ticker: order.ticker,
          orderId: order.id,
          type: order.side === 'BUY' ? 'BUY' : 'SELL',
          amount: order.quantity,
          fsAmount,
          balanceBefore,
          balanceAfter: newBalance,
        },
      })

      return { transaction, position }
    })
  }

  /**
   * Extrato de transações paginado com filtros.
   */
  async getTransactions(userId: string, filters: TransactionFilters): Promise<PaginatedResult<Transaction>> {
    const page = filters.page ?? 1
    const limit = Math.min(filters.limit ?? 20, 100)
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = { userId }
    if (filters.ticker) {
      where.ticker = filters.ticker
    }

    const [data, total] = await Promise.all([
      prisma.transaction.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.transaction.count({ where }),
    ])

    return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
  }

  /**
   * Posições abertas do usuário com P&L calculado em tempo real.
   */
  async getPositions(userId: string): Promise<PositionWithPnL[]> {
    // Tentar cache Redis
    const cacheKey = `positions:${userId}`
    try {
      const cached = await redis.get(cacheKey)
      if (cached) return JSON.parse(cached) as PositionWithPnL[]
    } catch { /* Redis indisponível */ }

    const positions = await prisma.position.findMany({
      where: { userId, status: 'OPEN', quantity: { gt: 0 } },
      include: { asset: true },
    })

    const result: PositionWithPnL[] = await Promise.all(
      positions.map(async (pos) => {
        let currentPrice: number

        // Tentar preço do Redis (mais recente)
        try {
          const redisPriceStr = await redis.get(`price:${pos.asset.ticker}`)
          currentPrice = redisPriceStr ? parseFloat(redisPriceStr) : Number(pos.asset.currentPrice)
        } catch {
          currentPrice = Number(pos.asset.currentPrice)
        }

        const avgPrice = Number(pos.avgPrice)
        const qty = Number(pos.quantity)
        const currentValue = qty * currentPrice
        const invested = avgPrice * qty
        const pnl = currentValue - invested
        const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0

        return {
          ...pos,
          currentPrice,
          currentValue,
          pnl,
          pnlPercent,
        }
      })
    )

    // Cachear por 30 segundos
    try {
      await redis.setex(cacheKey, 30, JSON.stringify(result))
    } catch { /* silencioso */ }

    return result
  }
}

export const transactionService = new TransactionService()
