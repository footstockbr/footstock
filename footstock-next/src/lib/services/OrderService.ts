// ============================================================================
// FootStock — OrderService
// Criação, listagem, detalhe e cancelamento de ordens com 5 camadas de validação.
// Rastreabilidade: INT-011..020 / TASK-1
// ============================================================================

import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import { ORDER_STATUS, ORDER_TYPE, PLAN_TYPE, type PlanType } from '@/lib/enums'
import { calculateFee } from '@/lib/services/plan-order-limits'
import { incrementDailyCounter, checkDailyOrderLimit } from '@/lib/middleware/checkDailyOrderLimit'
import { validateTransition } from '@/lib/contracts/order-contract'
import { validateOrderForPlan, type CreateOrderDTO } from '@/lib/validators/order'
import { leverageService } from '@/lib/services/LeverageService'
import { LEVERAGE_MULTIPLIER } from '@/lib/constants/leverage'
import { leagueEventRecorder } from '@/lib/services/leagues/LeagueEventRecorder'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'
import { AliasService } from '@/services/AliasService'
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
    hasNext: boolean
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

    // Resolver alias: FLA3 → URU3 (T-031). Normaliza antes de buscar.
    const resolvedTicker = await AliasService.resolve(dto.ticker)
    if (!resolvedTicker) throw new AppError('ASSET_031', 422, { message: 'Ativo não encontrado.' })
    // Substituir ticker pelo canônico para todo o fluxo downstream
    dto = { ...dto, ticker: resolvedTicker }

    // Buscar ativo pelo ticker canônico
    const asset = await prisma.asset.findUnique({ where: { ticker: resolvedTicker } })
    if (!asset) throw new AppError('ASSET_031', 422, { message: 'Ativo não encontrado.' })

    // === Camada 1 — Validação de Alavancagem (tem prioridade de contexto de liga PRO) ===
    // LeverageService verifica: liga PRO com permiteAlavancagem=true → qualquer plano pode usar 2x;
    //   liga PRO com permiteAlavancagem=false → bloqueia até LENDA;
    //   sem liga (ou liga não-PRO) → somente LENDA.
    // Deve rodar ANTES de validateOrderForPlan para que o resultado de liga PRO
    // possa sobrescrever a restrição de plano.
    if (dto.leverage === LEVERAGE_MULTIPLIER) {
      const levValidation = await leverageService.validateLeverage(userId, dto.leagueId)
      if (!levValidation.valid) {
        throw new AppError(levValidation.errorCode ?? 'ORDER_059', 403, {
          message: levValidation.message,
        })
      }
    }

    // === Camada 1b — Validação de Plano (exceto alavancagem — já validada acima) ===
    const planValidation = validateOrderForPlan(dto, user.planType as PlanType, { skipLeverageCheck: true })
    if (!planValidation.valid) {
      throw new AppError('ORDER_051', 403, {
        requiredPlan: planValidation.requiredPlan,
        message: planValidation.message,
      })
    }

    // === Camada 2 — Limite Diário (defense-in-depth; verificação primária no middleware HTTP) ===
    await this._checkDailyLimit(userId, user.planType as PlanType, dto.type)

    // === Camada 3 — Ativo em Halt (circuit breaker) ===
    // Verificar tanto o flag DB (isHalted) quanto a chave Redis motor:halt:{ticker}
    if (asset.isHalted) {
      const resumeAt = asset.haltReason === 'CIRCUIT_BREAKER'
        ? new Date(Date.now() + 300_000).toISOString()  // CB: 5min estimado
        : null
      throw new AppError('ASSET_030', 423, {
        ticker: dto.ticker,
        haltReason: asset.haltReason ?? 'CIRCUIT_BREAKER',
        resumeAt,
        message: 'Ativo temporariamente suspenso por circuit breaker.',
      })
    }

    const haltKey = await redis.get(`motor:halt:${dto.ticker}`).catch(() => null)
    if (haltKey !== null) {
      let haltReason: string | undefined
      let resumeAt: string | null = null
      try {
        const parsed = JSON.parse(haltKey) as { reason?: string; resumeAt?: number }
        haltReason = parsed.reason
        resumeAt = parsed.resumeAt ? new Date(parsed.resumeAt).toISOString() : null
      } catch {
        // chave malformada — tratar como halt ativo
      }
      throw new AppError('ASSET_030', 423, {
        ticker: dto.ticker,
        haltReason: haltReason ?? 'ADMIN_HALT',
        resumeAt,
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
      // T-019: saldo zero ou negativo bloqueia novas ordens BUY antes de qualquer cálculo
      const currentBalance = Number(user.fsBalance)
      if (currentBalance <= 0) {
        throw new AppError('INSUFFICIENT_BALANCE', 402, {
          code: 'INSUFFICIENT_BALANCE',
          message: 'Saldo FS$ zerado. Venda posicoes para negociar novamente.',
          balance: currentBalance,
        })
      }
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

    // === Motor Health Check (todos os tipos de ordem) ===
    // Verifica: (1) admin global-halt, (2) tick stale/ausente, (3) Redis indisponível.
    // Chaves corretas: motor:global-halt + market:tick:latest (motor:health nunca é publicada).
    const MOTOR_TICK_STALE_S = 10
    const motorGlobalHalt = await redis.exists('motor:global-halt').catch(() => 0)
    if (motorGlobalHalt) {
      throw new AppError('MOTOR_090', 503, { message: 'Motor de mercado pausado pelo administrador. Ordens suspensas temporariamente.' })
    }
    const tickRaw = await redis.get('market:tick:latest').catch(() => null)
    if (!tickRaw) {
      throw new AppError('MOTOR_090', 503, { message: 'Motor de mercado temporariamente indisponível.' })
    }
    const lastTickMs = parseInt(tickRaw, 10)
    if (isNaN(lastTickMs) || (Date.now() - lastTickMs) / 1_000 > MOTOR_TICK_STALE_S) {
      throw new AppError('MOTOR_090', 503, { message: 'Motor de mercado temporariamente indisponível.' })
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
        leverageMultiplier,
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

      leagueEventRecorder.recordForAllActiveLeagues(userId, 'OCO_ORDER_USED', { ticker: dto.ticker }).catch(() => {})

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
          leverageMultiplier,
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

    if (dto.type === ORDER_TYPE.LIMIT) {
      leagueEventRecorder.recordForAllActiveLeagues(userId, 'LIMIT_ORDER_USED', { ticker: dto.ticker }).catch(() => {})
    } else if (dto.scheduledAt) {
      leagueEventRecorder.recordForAllActiveLeagues(userId, 'SCHEDULED_ORDER_USED', { ticker: dto.ticker }).catch(() => {})
    }

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

    // Refund atômico: cancelar ordem + devolver saldo/margin com locking otimista na order
    const cancelled = await prisma.$transaction(async (tx) => {
      // CAS na order: garante que nenhum outro processo mudou o status entre o findUnique e agora
      const updateResult = await tx.order.updateMany({
        where: {
          id: orderId,
          version: order.version,
          status: { in: ['OPEN', 'PARTIAL'] },
        },
        data: {
          status: 'CANCELLED',
          version: { increment: 1 },
        },
      })

      if (updateResult.count === 0) {
        throw new AppError('ORDER_004', 409, {
          message: 'Atualização concorrente detectada. Recarregue e tente novamente.',
        })
      }

      const updated = await tx.order.findUnique({ where: { id: orderId } })
      if (!updated) throw new AppError('ORDER_080', 404, { message: 'Ordem não encontrada após cancelamento.' })

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
            // CAS na posição: garante consistência em execuções parciais concorrentes
            await tx.position.updateMany({
              where: { id: position.id, version: position.version },
              data: {
                marginBlocked: { decrement: Math.min(marginToRelease, Number(position.marginBlocked)) },
                version: { increment: 1 },
              },
            })
          }
        }
      }

      return updated
    })

    // EVT-014: rastrear cancelamento da ordem
    // Buscar ticker do ativo para analytics (async, sem bloquear retorno)
    prisma.asset.findUnique({ where: { id: order.assetId }, select: { ticker: true } })
      .then((asset) => {
        if (asset) {
          mixpanelServer.trackOrderCancelled(userId, {
            asset_ticker: asset.ticker,
            order_type: order.type as 'MARKET' | 'LIMIT' | 'SCHEDULED' | 'OCO' | 'SHORT',
            cancel_reason: 'USER_REQUEST',
          })
        }
      })
      .catch(() => { /* analytics nunca deve quebrar o backend */ })

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
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total },
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

  /**
   * Defense-in-depth: verifica limite diário no service layer.
   * A verificação primária é feita no middleware checkDailyOrderLimit (route layer).
   */
  private async _checkDailyLimit(userId: string, planType: PlanType, orderType: string): Promise<void> {
    const { block } = await checkDailyOrderLimit(userId, planType, orderType)
    if (block) {
      // Traduzir a resposta HTTP de volta para AppError para manter consistência de domínio
      throw new AppError('ORDER_051', 403, {
        planType,
        orderType,
        message: 'Limite diário de ordens atingido ou tipo de ordem não permitido para este plano.',
      })
    }
  }

  private async _checkMarketSession(): Promise<void> {
    try {
      const session = await redis.get('market:session')
      // Sessões abertas para ordens MARKET: TRADING e CLOSING_CALL
      const openSessions = new Set(['TRADING', 'CLOSING_CALL'])
      if (session && !openSessions.has(session)) {
        const messages: Record<string, string> = {
          CLOSED: 'Mercado fechado. Ordens MARKET são aceitas apenas durante o pregão.',
          PRE_OPENING: 'Mercado em pré-abertura. Aguarde o início do pregão.',
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
    await incrementDailyCounter(userId)
  }
}

export const orderService = new OrderService()
