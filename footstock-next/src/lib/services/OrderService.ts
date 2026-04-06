// ============================================================================
// Foot Stock — OrderService
// Criação, listagem, detalhe e cancelamento de ordens com 5 camadas de validação.
// Rastreabilidade: INT-011..020 / TASK-1
// ============================================================================

import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import { ORDER_STATUS, ORDER_TYPE, PLAN_TYPE, type PlanType } from '@/lib/enums'
import { calculateFee, DAILY_ORDER_LIMITS_BY_PLAN } from '@/lib/services/plan-order-limits'
import { validateTransition } from '@/lib/contracts/order-contract'
import { validateOrderForPlan, type CreateOrderDTO } from '@/lib/validators/order'
import { randomUUID } from 'crypto'
import type { Order } from '@prisma/client'

// ---------------------------------------------------------------------------
// Erros de domínio
// ---------------------------------------------------------------------------

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(code)
    this.name = 'AppError'
  }
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface OrderFilters {
  status?: string
  assetId?: string
  type?: string
  page?: number
  limit?: number
}

export interface PaginatedResult<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ---------------------------------------------------------------------------
// OrderService
// ---------------------------------------------------------------------------

export class OrderService {
  /**
   * Cria uma nova ordem com 5 camadas de validação de negócio.
   */
  async createOrder(userId: string, dto: CreateOrderDTO): Promise<Order> {
    // Buscar usuário
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new AppError('AUTH_001', 401)

    // Buscar ativo pelo ticker (assetId)
    const asset = await prisma.asset.findUnique({ where: { ticker: dto.ticker } })
    if (!asset) throw new AppError('ASSET_031', 422, { ticker: dto.ticker, message: 'Ativo não encontrado.' })

    // === Camada 1 — Validação de Plano ===
    const planValidation = validateOrderForPlan(dto, user.planType as PlanType)
    if (!planValidation.valid) {
      throw new AppError('ORDER_051', 403, {
        requiredPlan: planValidation.requiredPlan,
        message: planValidation.message,
      })
    }

    // === Camada 2 — Limite Diário ===
    if (user.planType !== PLAN_TYPE.LENDA) {
      await this._checkDailyLimit(userId, user.planType as PlanType)
    }

    // === Camada 3 — Ativo em Halt (circuit breaker) ===
    // Verificar tanto o flag DB (isHalted) quanto a chave Redis motor:halt:{ticker}
    if (asset.isHalted) {
      throw new AppError('ASSET_030', 423, {
        ticker: dto.ticker,
        message: 'Ativo temporariamente suspenso por circuit breaker.',
      })
    }

    const haltKey = await redis.get(`motor:halt:${dto.ticker}`).catch(() => null)
    if (haltKey !== null) {
      let haltReason: string | undefined
      try {
        const parsed = JSON.parse(haltKey) as { reason?: string }
        haltReason = parsed.reason
      } catch {
        // chave malformada — tratar como halt ativo
      }
      throw new AppError('ASSET_030', 422, {
        ticker: dto.ticker,
        message: haltReason
          ? `Ativo suspenso pelo administrador: ${haltReason}`
          : 'Ativo temporariamente suspenso pelo administrador.',
      })
    }

    // === Camada 4 — Sessão de Mercado (apenas MARKET) ===
    if (dto.type === ORDER_TYPE.MARKET) {
      await this._checkMarketSession()
    }

    // === Camada 5 — Saldo ===
    const executionPrice = Number(asset.currentPrice)
    const operationValue = dto.quantity * executionPrice
    const feeAmount = calculateFee(operationValue)
    let requiredBalance: number

    if (dto.side === 'BUY') {
      const leverageMultiplier = dto.leverage === 2 ? 0.5 : 1
      requiredBalance = operationValue * leverageMultiplier + feeAmount
    } else {
      // SELL: verificar que usuário tem a posição
      const position = await prisma.position.findFirst({
        where: { userId, assetId: asset.id, side: 'LONG' },
      })
      const ownedQty = Number(position?.quantity ?? 0)
      if (ownedQty < dto.quantity) {
        throw new AppError('ORDER_050', 402, {
          required: dto.quantity,
          available: ownedQty,
          message: `Saldo de ativos insuficiente. Você tem ${ownedQty} ${dto.ticker}, mas a ordem requer ${dto.quantity}.`,
        })
      }
      requiredBalance = 0 // SELL não requer saldo em FS$
    }

    // === Motor Health Check (MARKET apenas) ===
    if (dto.type === ORDER_TYPE.MARKET) {
      const motorHealth = await redis.get('motor:health').catch(() => null)
      if (motorHealth === 'offline') {
        throw new AppError('MOTOR_090', 503, { message: 'Motor de mercado temporariamente indisponível.' })
      }
    }

    // === Criação da Ordem com Debit Atômico ===
    // RESOLVED: race condition — debit e criação em prisma.$transaction atômico.
    // updateMany com WHERE fsBalance >= requiredBalance garante que saldo negativo
    // é impossível mesmo com requests concorrentes (sem lock separado).
    const leverageMultiplier = dto.leverage === 2 ? 2 : 1

    // OCO: criar par atomicamente com groupId compartilhado + debit atômico
    if (dto.type === ORDER_TYPE.OCO) {
      const groupId = randomUUID()
      const baseData = {
        userId,
        assetId: asset.id,
        type: 'OCO' as import('@prisma/client').OrderType,
        side: dto.side as import('@prisma/client').OrderSide,
        status: 'OPEN' as import('@prisma/client').OrderStatus,
        quantity: dto.quantity,
        fee: feeAmount,
        scheduledAt: null as Date | null,
      }

      const [debitResult, stopLossLeg, takeProfitLeg] = await prisma.$transaction([
        // Debit atômico: apenas se saldo suficiente
        prisma.user.updateMany({
          where: {
            id: userId,
            ...(requiredBalance > 0 ? { fsBalance: { gte: requiredBalance } } : {}),
          },
          data: requiredBalance > 0 ? { fsBalance: { decrement: requiredBalance } } : {},
        }),
        prisma.order.create({
          data: { ...baseData, price: dto.stopLossPrice! },
        }),
        prisma.order.create({
          data: { ...baseData, price: dto.takeProfitPrice! },
        }),
      ])

      if (requiredBalance > 0 && debitResult.count === 0) {
        throw new AppError('ORDER_002', 402, {
          required: requiredBalance,
          message: `Saldo insuficiente para criar a ordem.`,
        })
      }

      // Publicar ambas as pernas para o motor
      await Promise.allSettled([
        redis.publish('orders:pending', JSON.stringify({ orderId: stopLossLeg.id, assetId: asset.id, ticker: dto.ticker, groupId })),
        redis.publish('orders:pending', JSON.stringify({ orderId: takeProfitLeg.id, assetId: asset.id, ticker: dto.ticker, groupId })),
      ])

      await this._incrementDailyCounter(userId)

      // Retornar a primeira perna (stop loss) — ambas compartilham o groupId
      return stopLossLeg
    }

    // Ordem simples: debit + create em transação atômica
    const [debitResult, order] = await prisma.$transaction([
      prisma.user.updateMany({
        where: {
          id: userId,
          ...(requiredBalance > 0 ? { fsBalance: { gte: requiredBalance } } : {}),
        },
        data: requiredBalance > 0 ? { fsBalance: { decrement: requiredBalance } } : {},
      }),
      prisma.order.create({
        data: {
          userId,
          assetId: asset.id,
          type: dto.type as import('@prisma/client').OrderType,
          side: dto.side as import('@prisma/client').OrderSide,
          status: 'OPEN' as import('@prisma/client').OrderStatus,
          quantity: dto.quantity,
          price: dto.price ?? null,
          fee: feeAmount,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        },
      }),
    ])

    if (requiredBalance > 0 && debitResult.count === 0) {
      throw new AppError('ORDER_002', 402, {
        required: requiredBalance,
        message: `Saldo insuficiente para criar a ordem.`,
      })
    }

    // Publicar para o motor (MARKET → processamento imediato)
    if (dto.type === ORDER_TYPE.MARKET) {
      await redis.publish('orders:pending', JSON.stringify({ orderId: order.id, assetId: asset.id, ticker: dto.ticker }))
    }

    // Incrementar contador diário (Redis com TTL até meia-noite)
    await this._incrementDailyCounter(userId)

    return order
  }

  /**
   * Cancela uma ordem OPEN do usuário.
   */
  async cancelOrder(userId: string, orderId: string): Promise<Order> {
    const order = await prisma.order.findUnique({ where: { id: orderId } })

    if (!order || order.userId !== userId) {
      throw new AppError('ORDER_080', 404, { message: 'Ordem não encontrada.' })
    }

    if (order.status !== ORDER_STATUS.OPEN && order.status !== 'PARTIAL') {
      throw new AppError('ORDER_053', order.status === ORDER_STATUS.FILLED ? 409 : 422, {
        message: order.status === ORDER_STATUS.FILLED
          ? 'Ordem já foi executada.'
          : `Ordem não pode ser cancelada (status: ${order.status}).`,
      })
    }

    validateTransition(order.status as import('@/lib/enums').OrderStatus, ORDER_STATUS.CANCELLED, orderId)

    // Refund atômico: cancelar ordem + devolver saldo/margin
    const cancelled = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      })

      // Refund de saldo para ordens BUY
      if (order.side === 'BUY' && order.price) {
        const operationValue = Number(order.quantity) * Number(order.price)
        const fee = calculateFee(operationValue)
        const refundAmount = operationValue + fee
        await tx.user.update({
          where: { id: userId },
          data: { fsBalance: { increment: refundAmount } },
        })
      }

      // Liberar marginBlocked para ordens SHORT
      if (order.side === 'SELL') {
        const asset = await tx.asset.findUnique({ where: { id: order.assetId } })
        if (asset) {
          const position = await tx.position.findFirst({
            where: { userId, assetId: order.assetId, side: 'SHORT' },
          })
          if (position && Number(position.marginBlocked) > 0) {
            const marginToRelease = Number(order.quantity) * Number(asset.currentPrice) * 1.5
            await tx.position.update({
              where: { id: position.id },
              data: { marginBlocked: { decrement: Math.min(marginToRelease, Number(position.marginBlocked)) } },
            })
          }
        }
      }

      return updated
    })

    // Notificar motor e módulo de notificações
    await Promise.allSettled([
      redis.publish(`orders:cancelled:${userId}`, JSON.stringify({ orderId, motivo: 'Cancelado pelo usuário' })),
      redis.publish(`notifications:${userId}`, JSON.stringify({
        type: 'ORDER_CANCELLED',
        orderId,
        ticker: null, // assetId disponível na relation
        motivo: 'Cancelado pelo usuário',
      })),
    ])

    return cancelled
  }

  /**
   * Lista ordens do usuário com paginação e filtros.
   */
  async getOrders(userId: string, filters: OrderFilters): Promise<PaginatedResult<Order>> {
    const page = filters.page ?? 1
    const limit = Math.min(filters.limit ?? 20, 100)
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = { userId }
    if (filters.status) where.status = filters.status
    if (filters.type) where.type = filters.type

    // Filtro por assetId
    if (filters.assetId) {
      where.assetId = filters.assetId
    }

    const [data, total] = await Promise.all([
      prisma.order.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.order.count({ where }),
    ])

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }
  }

  /**
   * Busca uma ordem específica do usuário (com proteção IDOR).
   */
  async getOrder(userId: string, orderId: string): Promise<Order> {
    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order || order.userId !== userId) {
      throw new AppError('ORDER_080', 404, { message: 'Ordem não encontrada.' })
    }
    return order
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private async _checkDailyLimit(userId: string, planType: PlanType): Promise<void> {
    const limit = DAILY_ORDER_LIMITS_BY_PLAN[planType]
    if (limit === Infinity) return

    const today = new Date().toISOString().slice(0, 10)
    const redisKey = `order:daily:${userId}:${today}`

    let count: number
    try {
      const val = await redis.get(redisKey)
      count = val ? parseInt(val, 10) : 0
    } catch {
      // Fallback para banco se Redis indisponível
      const startOfDay = new Date(`${today}T00:00:00.000Z`)
      const endOfDay = new Date(`${today}T23:59:59.999Z`)
      count = await prisma.order.count({
        where: {
          userId,
          createdAt: { gte: startOfDay, lte: endOfDay },
          status: { not: 'CANCELLED' },
          type: { not: 'SCHEDULED' },
        },
      })
    }

    if (count >= limit) {
      const nextMidnight = new Date(`${today}T00:00:00.000Z`)
      nextMidnight.setDate(nextMidnight.getDate() + 1)
      throw new AppError('ORDER_052', 429, {
        limit,
        planType,
        resetAt: nextMidnight.toISOString(),
        message: `Limite diário de ${limit} ordens atingido para o plano ${planType}.`,
      })
    }
  }

  private async _checkMarketSession(): Promise<void> {
    try {
      const session = await redis.get('market:session')
      if (session && session !== 'NEGOCIACAO') {
        const messages: Record<string, string> = {
          FECHADO: 'Mercado fechado. Ordens MARKET são aceitas apenas durante o pregão.',
          PRE_ABERTURA: 'Mercado em pré-abertura. Aguarde o início do pregão.',
          CALL: 'Mercado em leilão de fechamento. Tente novamente após o pregão.',
          AFTER_MARKET: 'Mercado em after-market. Ordens MARKET não são aceitas nesta sessão.',
        }
        throw new AppError('SESS_040', 422, {
          session,
          message: messages[session] ?? 'Mercado indisponível para ordens MARKET.',
        })
      }
    } catch (err) {
      if (err instanceof AppError) throw err
      // Redis indisponível — permitir (fail open para não bloquear operações)
    }
  }

  private async _incrementDailyCounter(userId: string): Promise<void> {
    const today = new Date().toISOString().slice(0, 10)
    const redisKey = `order:daily:${userId}:${today}`
    try {
      const count = await redis.incr(redisKey)
      if (count === 1) {
        // Definir TTL até fim do dia (máx 24h)
        const now = new Date()
        const endOfDay = new Date(`${today}T23:59:59.000Z`)
        const ttl = Math.ceil((endOfDay.getTime() - now.getTime()) / 1000)
        if (ttl > 0) await redis.expire(redisKey, ttl)
      }
    } catch {
      // Falha silenciosa — o fallback do banco será usado na próxima validação
    }
  }
}

export const orderService = new OrderService()
