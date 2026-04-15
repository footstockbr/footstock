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
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'
import { LEVERAGE_DAILY_INTEREST_RATE } from '@/lib/constants/leverage'
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
  assetId?: string
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
    order: Order & { asset: { id: string; ticker: string; currentPrice: import('@prisma/client').Prisma.Decimal } },
    executionPrice: number,
  ): Promise<{ transaction: Transaction; position: Position }> {
    const result = await prisma.$transaction(async (tx) => {
      // Buscar usuário com dados mais recentes (lock implícito no Prisma)
      const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } })

      const operationValue = Number(order.quantity) * executionPrice
      const feeAmount = calculateFee(operationValue)

      let totalCost: number
      let fsAmount: number

      if (order.side === 'BUY') {
        // Para ordens alavancadas, o usuário já pagou 50% na criação da ordem (OrderService).
        // Na execução, registramos o custo real apenas do capital próprio (50% + fee).
        const levMult = Number(order.leverageMultiplier) >= 2 ? 2 : 1
        const ownFraction = levMult === 2 ? 0.5 : 1
        totalCost = operationValue * ownFraction + feeAmount
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
      validateTransition(order.status as import('@/lib/enums').OrderStatus, ORDER_STATUS.FILLED, order.id)

      // Atualizar order status
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'FILLED' as import('@prisma/client').OrderStatus, fee: feeAmount, executedAt: new Date() },
      })

      // Atualizar saldo do usuário
      await tx.user.update({
        where: { id: order.userId },
        data: { fsBalance: newBalance },
      })

      // Upsert position
      let position: Position
      const existingPos = await tx.position.findFirst({
        where: { userId: order.userId, assetId: order.assetId, side: 'LONG', status: 'OPEN' },
      })

      if (order.side === 'BUY') {
        const isLevered = Number(order.leverageMultiplier) >= 2
        // Crédito virtual = metade do nocional (plataforma financia a outra metade)
        const newLeverageAmount = isLevered ? (order.quantity * executionPrice) / 2 : 0

        if (existingPos) {
          const existingQty = Number(existingPos.quantity)
          const existingAvg = Number(existingPos.avgPrice)
          const orderQty = Number(order.quantity)
          const newQty = existingQty + orderQty
          const newAvg = (existingQty * existingAvg + orderQty * executionPrice) / newQty
          // Agregar leverageAmount da nova parcela alavancada à posição existente
          const updatedLeverageAmount = Number(existingPos.leverageAmount) + newLeverageAmount
          const updatedLeverageMult = isLevered
            ? Math.max(Number(existingPos.leverageMultiplier), 2)
            : Number(existingPos.leverageMultiplier)
          position = await tx.position.update({
            where: { id: existingPos.id },
            data: {
              quantity: newQty,
              avgPrice: newAvg,
              ...(isLevered && {
                leverageMultiplier: updatedLeverageMult,
                leverageAmount: updatedLeverageAmount,
                dailyInterestRate: LEVERAGE_DAILY_INTEREST_RATE,
              }),
            },
          })
        } else {
          position = await tx.position.create({
            data: {
              userId: order.userId,
              assetId: order.assetId,
              quantity: order.quantity,
              avgPrice: executionPrice,
              totalInvested: order.quantity * executionPrice,
              side: 'LONG',
              leverageMultiplier: isLevered ? 2 : 1,
              leverageAmount: newLeverageAmount,
              dailyInterestRate: isLevered ? LEVERAGE_DAILY_INTEREST_RATE : 0,
            },
          })
        }
      } else {
        // SELL: reduzir position
        if (!existingPos || Number(existingPos.quantity) < Number(order.quantity)) {
          throw new AppError('ORDER_050', 402, { message: 'Posição insuficiente para venda.' })
        }
        const existingQty = Number(existingPos.quantity)
        const sellQty = Number(order.quantity)
        const newQty = existingQty - sellQty

        // Amortizar leverageAmount proporcionalmente à quantidade vendida
        const existingLevAmount = Number(existingPos.leverageAmount)
        const amortizedLevAmount = existingLevAmount > 0
          ? (existingLevAmount * (sellQty / existingQty))
          : 0
        const newLevAmount = Math.max(0, existingLevAmount - amortizedLevAmount)

        position = await tx.position.update({
          where: { id: existingPos.id },
          data: newQty > 0
            ? {
                quantity: newQty,
                leverageAmount: newLevAmount,
                // Se leverageAmount zerou, resetar taxa de juros
                ...(newLevAmount <= 0 && { leverageMultiplier: 1, dailyInterestRate: 0 }),
              }
            : { quantity: 0, status: 'CLOSED', leverageAmount: 0, leverageMultiplier: 1, dailyInterestRate: 0 },
        })
      }

      // Transaction TRADE — registra a operação principal
      const transaction = await tx.transaction.create({
        data: {
          userId: order.userId,
          assetId: order.assetId,
          orderId: order.id,
          type: order.type,
          financialType: 'TRADE',
          side: order.side,
          quantity: order.quantity,
          price: executionPrice,
          fee: feeAmount,
          totalAmount: operationValue,
          fsAmount,
          balanceBefore,
          balanceAfter: newBalance,
        },
      })

      // Transaction FEE — linha separada no extrato para rastreabilidade da taxa
      // Idempotência: ignora se já existe FEE para esta ordem (proteção contra retry)
      const existingFee = await tx.transaction.findFirst({
        where: { orderId: order.id, financialType: 'FEE' },
        select: { id: true },
      })
      if (!existingFee) {
        await tx.transaction.create({
          data: {
            userId: order.userId,
            assetId: order.assetId,
            orderId: order.id,
            type: order.type,
            financialType: 'FEE',
            side: order.side,
            quantity: order.quantity,
            price: executionPrice,
            fee: feeAmount,
            totalAmount: feeAmount,
            fsAmount: -feeAmount,
            balanceBefore: null,
            balanceAfter: null,
          },
        })
      }

      return { transaction, position }
    })

    // EVT-013: rastrear execucao da ordem (North Star KPI)
    // Calcula execution_delay_ms e lê sessão de mercado do Redis de forma assíncrona
    const executionTimestamp = Date.now()
    const orderCreatedMs = order.createdAt instanceof Date ? order.createdAt.getTime() : new Date(order.createdAt).getTime()
    const executionDelayMs = executionTimestamp - orderCreatedMs

    // Buscar plano e sessão de forma assíncrona — analytics nunca bloqueia o retorno
    Promise.all([
      prisma.user.findUnique({ where: { id: order.userId }, select: { planType: true } }),
      redis.get('market:session').catch(() => null),
    ]).then(([user, sessionStr]) => {
      const plan = (user?.planType ?? 'JOGADOR') as 'JOGADOR' | 'CRAQUE' | 'LENDA'
      const marketSession = (sessionStr ?? 'TRADING') as 'PRE_MARKET' | 'TRADING' | 'CALL' | 'AFTER' | 'CLOSED'
      mixpanelServer.trackOrderExecuted(order.userId, {
        asset_ticker: order.asset.ticker,
        order_type: order.type as 'MARKET' | 'LIMIT' | 'SCHEDULED' | 'OCO' | 'SHORT',
        side: order.side as 'BUY' | 'SELL',
        plan,
        execution_delay_ms: executionDelayMs,
        market_session: marketSession,
      })
    }).catch(() => { /* analytics nunca deve quebrar o backend */ })

    // T-019: notificar usuário quando saldo chega a zero (fora da tx Prisma, sem bloquear resultado)
    // Re-lê o saldo do usuário de forma assíncrona para checar se chegou a zero
    prisma.user.findUnique({ where: { id: order.userId }, select: { fsBalance: true } })
      .then((u) => {
        if (u && Number(u.fsBalance) <= 0) {
          redis.publish(`notifications:${order.userId}`, JSON.stringify({
            type: 'BALANCE_ZERO',
            message: 'Seu saldo FS$ chegou a zero. Venda posicoes para negociar novamente.',
            balance: Number(u.fsBalance),
          })).catch(() => { /* silencioso */ })
        }
      })
      .catch(() => { /* silencioso */ })

    return result
  }

  /**
   * Extrato de transações paginado com filtros.
   */
  async getTransactions(userId: string, filters: TransactionFilters): Promise<PaginatedResult<Transaction>> {
    const page = filters.page ?? 1
    const limit = Math.min(filters.limit ?? 20, 100)
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = { userId }
    if (filters.assetId) {
      where.assetId = filters.assetId
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
