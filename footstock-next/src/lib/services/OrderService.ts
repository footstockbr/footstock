// ============================================================================
// FootStock — OrderService
// Criação, listagem, detalhe e cancelamento de ordens com 5 camadas de validação.
// Rastreabilidade: INT-011..020 / TASK-1
// ============================================================================

import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import { ORDER_STATUS, ORDER_TYPE, type PlanType } from '@/lib/enums'
import { calculateFee } from '@/lib/services/plan-order-limits'
import {
  checkDailyOrderLimit,
  releaseDailyOrderReservation,
  reserveDailyOrderLimit,
} from '@/lib/middleware/checkDailyOrderLimit'
import { validateTransition } from '@/lib/contracts/order-contract'
import { validateOrderForPlan, type CreateOrderDTO } from '@/lib/validators/order'
import { leverageService } from '@/lib/services/LeverageService'
import { LEVERAGE_MULTIPLIER } from '@/lib/constants/leverage'
import { leagueEventRecorder } from '@/lib/services/leagues/LeagueEventRecorder'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'
import { AliasService } from '@/services/AliasService'
import { isTickFresh } from '@/lib/motor/tick-freshness'
import { getCurrentSession } from '@/lib/services/session-manager'
import { acceptsMarketOrders } from '@/lib/constants/market'
import { randomUUID } from 'crypto'
import { notificationRepository } from '@/lib/repositories/NotificationRepository'
import type { Order, Prisma } from '@prisma/client'

/**
 * Motivo terminal do cancelamento pedido pelo próprio usuário (Fase 3, M072).
 *
 * Vocabulário FECHADO — a coluna guarda o código, nunca a frase. O texto que o
 * usuário lê é montado na UI a partir do código
 * (`components/orders/OrderHistory.tsx`), pelo mesmo motivo que
 * `ORDER_ERROR_MESSAGES` existe: gravar prosa na tabela congela a redação e
 * impede tradução, e um `cancelReason` livre viraria filtro impossível de fazer.
 * Códigos irmãos: EXPIRED, OCO_SIBLING, EXECUTION_RETRY_EXHAUSTED,
 * INSUFFICIENT_BALANCE, ASSET_HALTED, PLAN_CANCELLED, RECONCILIATION.
 * Catálogo completo: docs/FASE3-ciclo-de-vida-da-ordem.md §6.
 */
const CANCEL_REASON_USER_REQUEST = 'USER_REQUEST'

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

/**
 * Referencia minima do ativo embutida nas ordens listadas.
 * Evita que a UI renderize ticker vazio por falta de relation carregada.
 */
export interface OrderAssetRef {
  ticker: string
  displayName: string
}

export type OrderWithAsset = Order & { asset: OrderAssetRef | null }

/**
 * Linha de liquidacao carregada junto da ordem no historico.
 * Somente as colunas necessarias para o contrato `OrderHistoryDto`: a linha
 * TRADE traz o caixa (ja liquido de taxa) e a linha FEE detalha a taxa.
 */
export interface OrderSettlementTx {
  financialType: string
  quantity: number | null
  price: Prisma.Decimal | null
  fee: Prisma.Decimal | null
  fsAmount: Prisma.Decimal | null
  balanceBefore: Prisma.Decimal | null
  balanceAfter: Prisma.Decimal | null
}

export type OrderWithSettlement = OrderWithAsset & { transactions: OrderSettlementTx[] }

/**
 * Disponibilidade de venda de um ativo para um usuario. Fonte UNICA consumida
 * pela validacao de criacao de ordem (`_assertSellAvailable`) e pelo preview de
 * venda exposto por HTTP, para que a UI nunca exiba um numero diferente do que o
 * servidor vai cobrar na hora de criar a ordem.
 */
export interface SellAvailability {
  /** Cotas em carteira (posicao LONG aberta). Zero quando nao ha posicao. */
  ownedQty: number
  /** Cotas ja comprometidas por ordens SELL OPEN/PARTIAL. OCO conta uma vez por grupo. */
  reservedQty: number
  /** Sempre max(0, ownedQty - reservedQty). */
  availableQty: number
  /** Preco medio da posicao LONG aberta; zero quando nao ha posicao. */
  avgPrice: number
  /** Id da posicao encontrada, aberta ou nao. null quando o usuario nunca teve o ativo. */
  positionId: string | null
  /** Status da posicao encontrada. null quando o usuario nunca teve o ativo. */
  positionStatus: 'OPEN' | 'CLOSED' | null
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
    if (!user) throw new AppError('AUTH-001', 401)

    // Gate staff: ADMIN/CLUB_PARTNER nao tradam (sem planType, sem operacao).
    if (
      user.userType === 'ADMIN' ||
      user.userType === 'CLUB_PARTNER' ||
      !user.planType
    ) {
      throw new AppError('STAFF_CANNOT_TRADE', 403, {
        message: 'Contas administrativas/institucionais nao podem operar ordens.',
      })
    }

    // Resolver alias: FLA3 → URU3 (T-031). Normaliza antes de buscar.
    const resolvedTicker = await AliasService.resolve(dto.ticker)
    // T-02: Diagnosticar tickers não resolvidos
    if (!resolvedTicker) {
      console.warn(`[ORDERS] Ticker não resolvido: "${dto.ticker}" para userId ${userId}`)
      throw new AppError('ASSET_031', 422, { message: 'Ativo não encontrado.' })
    }
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
    // MARKET usa a cotacao atual; ordens com preco informado reservam pelo preco
    // aceito pelo usuario, mantendo backend alinhado ao custo estimado no modal.
    const quotePrice = this._resolveOrderPricingPrice(dto, Number(asset.currentPrice))
    const operationValue = this._roundFsAmount(dto.quantity * quotePrice)
    const feeAmount = this._roundFsAmount(calculateFee(operationValue))
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
      requiredBalance = this._roundFsAmount(operationValue * leverageMultiplier + feeAmount)
    } else {
      requiredBalance = 0 // SELL não requer saldo em FS$
    }

    // === Motor Health Check (todos os tipos de ordem) ===
    // Verifica: (1) admin global-halt, (2) tick stale/ausente, (3) Redis indisponível.
    // Chaves corretas: motor:global-halt + market:tick:latest (motor:health nunca é publicada).
    // Threshold em lib/motor/tick-freshness.ts (override por MOTOR_TICK_STALE_S).
    // Este gate usava 30s enquanto o middleware e a rota de health usavam 10s: o
    // mesmo motor era "online" para o formulário e "offline" para o banner.
    const motorGlobalHalt = await redis.exists('motor:global-halt').catch(() => 0)
    if (motorGlobalHalt) {
      throw new AppError('MOTOR_090', 503, { message: 'Motor de mercado pausado pelo administrador. Ordens suspensas temporariamente.' })
    }
    const tickRaw = await redis.get('market:tick:latest').catch(() => null)
    if (!tickRaw) {
      throw new AppError('MOTOR_090', 503, { message: 'Motor de mercado temporariamente indisponível.' })
    }
    const lastTickMs = parseInt(tickRaw, 10)
    if (isNaN(lastTickMs) || !isTickFresh((Date.now() - lastTickMs) / 1_000)) {
      throw new AppError('MOTOR_090', 503, { message: 'Motor de mercado temporariamente indisponível.' })
    }

    // === Criação da Ordem (debit-on-execute) ===
    // A criação NÃO debita saldo — apenas valida capacidade (_assertBuyCapacity)
    // em tx Serializable. O débito real acontece só no fill, no motor (settlement),
    // que é a autoridade única de liquidação e garante saldo nunca-negativo.
    const leverageMultiplier = dto.leverage === 2 ? 2 : 1
    const reservedDailySlot = await this._reserveDailyLimit(userId, user.planType as PlanType, dto.type)

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
        groupId,
        leverageMultiplier,
        scheduledAt: null as Date | null,
      }

      let stopLossLeg: Order
      let takeProfitLeg: Order
      try {
        ;[stopLossLeg, takeProfitLeg] = await prisma.$transaction(async (tx) => {
          await this._assertBuyCapacity(tx, userId, requiredBalance)
          if (dto.side === 'SELL') {
            await this._assertSellAvailable(tx, userId, asset.id, dto.ticker, dto.quantity)
          }

          const createdStopLoss = await tx.order.create({
            data: { ...baseData, price: dto.stopLossPrice! },
          })
          const createdTakeProfit = await tx.order.create({
            data: { ...baseData, price: dto.takeProfitPrice! },
          })

          return [createdStopLoss, createdTakeProfit]
        }, { isolationLevel: 'Serializable' })
      } catch (err) {
        if (reservedDailySlot) await releaseDailyOrderReservation(userId)
        // T-03: Tratamento específico de constraint violation (P2002 = unique constraint)
        if ((err as { code?: string }).code === 'P2002' || (err as { code?: string }).code === 'P2034') {
          throw new AppError('ORDER_057', 409, {
            message: 'Conflito ao criar ordem. Tente novamente.',
          })
        }
        throw err
      }

      // Publicar ambas as pernas para o motor
      await Promise.allSettled([
        redis.publish('orders:pending', JSON.stringify({ orderId: stopLossLeg.id, assetId: asset.id, ticker: dto.ticker, groupId })),
        redis.publish('orders:pending', JSON.stringify({ orderId: takeProfitLeg.id, assetId: asset.id, ticker: dto.ticker, groupId })),
      ])

      leagueEventRecorder.recordForAllActiveLeagues(userId, 'OCO_ORDER_USED', { ticker: dto.ticker }).catch(() => {})

      // Retornar a primeira perna (stop loss) — ambas compartilham o groupId
      return stopLossLeg
    }

    // Ordem simples: debit + create em transação atômica
    let order: Order
    try {
      order = await prisma.$transaction(async (tx) => {
        await this._assertBuyCapacity(tx, userId, requiredBalance)
        if (dto.side === 'SELL') {
          await this._assertSellAvailable(tx, userId, asset.id, dto.ticker, dto.quantity)
        }

        return tx.order.create({
          data: {
            userId,
            assetId: asset.id,
            type: dto.type as import('@prisma/client').OrderType,
            side: dto.side as import('@prisma/client').OrderSide,
            status: 'OPEN' as import('@prisma/client').OrderStatus,
            quantity: dto.quantity,
            price: dto.price ?? (dto.side === 'BUY' ? quotePrice : null),
            fee: feeAmount,
            leverageMultiplier,
            scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          },
        })
      }, { isolationLevel: 'Serializable' })
    } catch (err) {
      if (reservedDailySlot) await releaseDailyOrderReservation(userId)
      // T-03: Tratamento específico de constraint violation (P2002 = unique constraint)
      if ((err as { code?: string }).code === 'P2002' || (err as { code?: string }).code === 'P2034') {
        throw new AppError('ORDER_057', 409, {
          message: 'Conflito ao criar ordem. Tente novamente.',
        })
      }
      throw err
    }

    // Publicar para o motor (MARKET → processamento imediato)
    if (dto.type === ORDER_TYPE.MARKET) {
      await Promise.allSettled([
        redis.publish('orders:pending', JSON.stringify({ orderId: order.id, assetId: asset.id, ticker: dto.ticker })),
      ])
    }

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

    // debit-on-execute: cancelar ordem OPEN NÃO reembolsa saldo (nada foi debitado
    // na criação) e NÃO mexe em marginBlocked (margin de short pertence ao
    // ShortService, não a SELLs de /orders, que são vendas de posição LONG).
    // Único efeito colateral: se for OCO, cancela TODAS as pernas do grupo.
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
          // Fase 3 (M072): o motivo mora na propria linha. Este e o caminho de
          // cancelamento MAIS disparado do produto; sem ele o historico mostraria
          // "Cancelada" sem distinguir escolha do usuario de falha de execucao.
          cancelReason: CANCEL_REASON_USER_REQUEST,
          nextAttemptAt: null,
        },
      })

      if (updateResult.count === 0) {
        throw new AppError('ORDER_004', 409, {
          message: 'Atualização concorrente detectada. Recarregue e tente novamente.',
        })
      }

      // OCO: cancelar as demais pernas do grupo na mesma transação
      if (order.type === ORDER_TYPE.OCO && order.groupId) {
        await tx.order.updateMany({
          where: { groupId: order.groupId, id: { not: orderId }, status: { in: ['OPEN', 'PARTIAL'] } },
          data: {
            status: 'CANCELLED',
            version: { increment: 1 },
            // A perna irma nao foi cancelada por escolha direta: caiu junto.
            cancelReason: 'OCO_SIBLING',
            nextAttemptAt: null,
          },
        })
      }

      const updated = await tx.order.findUnique({ where: { id: orderId } })
      if (!updated) throw new AppError('ORDER_080', 404, { message: 'Ordem não encontrada após cancelamento.' })

      return updated
    })

    // Zero Silencio (Fase 3): a linha em `notifications` e a entrega REAL — o
    // front faz polling da tabela, e os dois `redis.publish` logo abaixo nao tem
    // assinante em nenhum ponto do repositorio. Este caminho e o cancelamento mais
    // comum do produto e, ate aqui, era o unico dos cinco que nao gravava nada.
    //
    // Nao lanca e nao bloqueia o retorno em caso de erro: o cancelamento ja
    // commitou; falhar no aviso nao pode transformar um cancelamento bem-sucedido
    // em erro 500 na cara do usuario que acabou de clicar.
    await this._notifyCancelledByUser(cancelled, order.assetId)

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
   * Grava o aviso DURÁVEL do cancelamento pedido pelo usuário.
   *
   * Inclui as pernas OCO derrubadas junto: quem cancela uma perna de um par
   * cancela as duas, e receber aviso de uma só deixaria o usuário achando que a
   * outra continua viva.
   *
   * Idempotência por chave própria (`user_cancel:order:{id}`), disjunta da chave
   * do expiry (`expiry:order:{id}`) e da do motor
   * (`motor:order_cancelled:retry_exhausted:{id}`): uma mesma ordem pode ter no
   * máximo um desfecho terminal, mas as chaves não podem colidir entre origens,
   * senão o UNIQUE de `notifications.idempotency_key` engoliria o aviso do
   * caminho que de fato aconteceu.
   *
   * Nunca lança.
   */
  private async _notifyCancelledByUser(cancelled: Order, assetId: string): Promise<void> {
    try {
      const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { ticker: true } })
      const ticker = asset?.ticker ?? null

      // As pernas do grupo OCO são relidas DEPOIS do commit e filtradas por
      // cancelReason: só avisa sobre o que esta operação de fato derrubou. Ler o
      // grupo inteiro sem filtro mandaria "cancelada" para perna já FILLED — o
      // defeito exato que o job de expiração teve de corrigir.
      const legs: Array<Pick<Order, 'id' | 'userId' | 'side' | 'quantity' | 'cancelReason'>> =
        cancelled.groupId
          ? await prisma.order.findMany({
              where: { groupId: cancelled.groupId, status: 'CANCELLED', cancelReason: { in: [CANCEL_REASON_USER_REQUEST, 'OCO_SIBLING'] } },
              select: { id: true, userId: true, side: true, quantity: true, cancelReason: true },
            })
          : [cancelled]

      for (const leg of legs) {
        const alvo = `${leg.side === 'BUY' ? 'de compra' : 'de venda'} de ${leg.quantity}${ticker ? ` ${ticker}` : ''}`
        const desfecho =
          leg.cancelReason === 'OCO_SIBLING'
            ? 'foi cancelada junto com a ordem par (OCO) que você cancelou. Nenhum valor foi debitado.'
            : 'foi cancelada a seu pedido. Nenhum valor foi debitado.'
        try {
          await notificationRepository.create({
            userId: leg.userId,
            type: 'ORDER_CANCELLED',
            title: 'Ordem cancelada',
            body: `Sua ordem ${alvo} ${desfecho}`,
            idempotencyKey: `user_cancel:order:${leg.id}`,
            metadata: {
              orderId: leg.id,
              ticker,
              side: leg.side,
              quantity: leg.quantity,
              motivo: leg.cancelReason ?? CANCEL_REASON_USER_REQUEST,
              status: 'CANCELLED',
            },
          })
        } catch (err) {
          // P2002 = a chave já existe, ou seja, o aviso JÁ foi entregue. É a
          // deduplicação funcionando, não falha.
          if ((err as { code?: string })?.code !== 'P2002') {
            console.error(`[OrderService] Falha ao notificar cancelamento da ordem ${leg.id}:`, err)
          }
        }
      }
    } catch (err) {
      console.error(`[OrderService] Falha ao preparar aviso de cancelamento da ordem ${cancelled.id}:`, err)
    }
  }

  /**
   * Lista ordens do usuário com paginação e filtros.
   */
  async getOrders(userId: string, filters: OrderFilters): Promise<PaginatedResult<OrderWithSettlement>> {
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
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          asset: { select: { ticker: true, displayName: true } },
          // Liquidacao: base do contrato de historico. Sem isso a UI cai no
          // fallback estimado (`Order.fee`) mesmo em ordem ja executada.
          transactions: {
            select: {
              financialType: true,
              quantity: true,
              price: true,
              fee: true,
              fsAmount: true,
              balanceBefore: true,
              balanceAfter: true,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
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

  private async _reserveDailyLimit(userId: string, planType: PlanType, orderType: string): Promise<boolean> {
    const { block, reserved, info } = await reserveDailyOrderLimit(userId, planType, orderType)
    if (block) {
      throw new AppError('ORDER_051', block.status, {
        planType,
        orderType,
        limit: info.limit,
        used: info.used,
        remaining: info.remaining,
        resetAt: info.resetAt,
        message: 'Limite diário de ordens atingido ou tipo de ordem não permitido para este plano.',
      })
    }
    return reserved
  }

  /**
   * Modelo debit-on-execute: a criação NÃO debita saldo. Apenas valida CAPACIDADE
   * (saldo disponível >= custo estimado), onde disponível = fsBalance − custo
   * estimado das ordens BUY abertas do usuário. Impede over-commit de várias
   * ordens BUY abertas sem reservar saldo de fato. A liquidação real (débito) é
   * exclusiva do motor no momento do fill (settlement.ts), que também é a única
   * camada que garante saldo nunca-negativo (cancela a ordem se não couber).
   */
  private async _assertBuyCapacity(
    tx: Prisma.TransactionClient,
    userId: string,
    requiredBalance: number,
  ): Promise<void> {
    if (requiredBalance <= 0) return

    const [user, openBuys] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: { fsBalance: true } }),
      tx.order.findMany({
        where: { userId, side: 'BUY', status: { in: ['OPEN', 'PARTIAL'] } },
        select: { quantity: true, price: true, fee: true, leverageMultiplier: true },
      }),
    ])

    let committed = 0
    for (const o of openBuys) {
      const opVal = Number(o.quantity) * Number(o.price ?? 0)
      const div = Number(o.leverageMultiplier) >= 2 ? 2 : 1
      committed += opVal / div + Number(o.fee ?? 0)
    }

    const available = this._roundFsAmount(Number(user.fsBalance) - committed)
    if (available < requiredBalance) {
      throw new AppError('INSUFFICIENT_BALANCE', 402, {
        required: requiredBalance,
        available,
        committed: this._roundFsAmount(committed),
        message: 'Saldo disponível insuficiente considerando ordens abertas.',
      })
    }
  }

  /**
   * Calcula a disponibilidade de venda dentro de uma transacao ja aberta.
   * Nao lanca: apenas descreve o estado. Quem decide bloquear e o chamador.
   */
  private async _getSellAvailability(
    tx: Prisma.TransactionClient,
    userId: string,
    assetId: string,
  ): Promise<SellAvailability> {
    const [position, sellOrders] = await Promise.all([
      tx.position.findFirst({
        where: { userId, assetId, side: 'LONG', status: 'OPEN' },
        select: { id: true, quantity: true, avgPrice: true, status: true },
      }),
      tx.order.findMany({
        where: {
          userId,
          assetId,
          side: 'SELL',
          status: { in: ['OPEN', 'PARTIAL'] },
        },
        select: { quantity: true, type: true, groupId: true },
      }),
    ])

    // Sem posicao ABERTA, ainda importa distinguir "nunca teve o ativo" de "teve e
    // fechou": a UI precisa dizer ao usuario qual dos dois e o caso. A busca extra
    // so acontece nesse caminho e nao muda ownedQty, que continua zero.
    const fallbackPosition = position
      ? null
      : await tx.position.findFirst({
          where: { userId, assetId, side: 'LONG' },
          select: { id: true, status: true },
          orderBy: { updatedAt: 'desc' },
        })

    const ownedQty = Number(position?.quantity ?? 0)
    // OCO reserva a quantidade UMA vez por grupo (as 2 pernas vendem a mesma cota;
    // só uma executa). Sem isso, um OCO de 100 cotas "reservaria" 200.
    const seenGroups = new Set<string>()
    let reservedQty = 0
    for (const o of sellOrders) {
      if (o.type === 'OCO' && o.groupId) {
        if (seenGroups.has(o.groupId)) continue
        seenGroups.add(o.groupId)
      }
      reservedQty += Number(o.quantity)
    }

    const found = position ?? fallbackPosition
    return {
      ownedQty,
      reservedQty,
      availableQty: Math.max(0, ownedQty - reservedQty),
      avgPrice: Number(position?.avgPrice ?? 0),
      positionId: found?.id ?? null,
      positionStatus: (found?.status as 'OPEN' | 'CLOSED' | undefined) ?? null,
    }
  }

  /**
   * Versao publica: abre a propria transacao para que rotas HTTP nao precisem
   * construir um `Prisma.TransactionClient`. Somente leitura.
   */
  async getSellAvailability(userId: string, assetId: string): Promise<SellAvailability> {
    return prisma.$transaction((tx) => this._getSellAvailability(tx, userId, assetId))
  }

  private async _assertSellAvailable(
    tx: Prisma.TransactionClient,
    userId: string,
    assetId: string,
    ticker: string,
    requestedQuantity: number,
  ): Promise<void> {
    const { availableQty, reservedQty } = await this._getSellAvailability(tx, userId, assetId)

    if (availableQty < requestedQuantity) {
      throw new AppError('ORDER_050', 402, {
        required: requestedQuantity,
        available: availableQty,
        reserved: reservedQty,
        message: `Saldo de ativos insuficiente. Disponível para venda: ${availableQty} ${ticker}; ordem requer ${requestedQuantity}.`,
      })
    }
  }

  private async _checkMarketSession(): Promise<void> {
    try {
      // market:session tinha TTL de 15s contra republicação a cada 10s: a chave
      // expirava dentro da janela normal de operação e este gate, com `session`
      // nulo, deixava passar ordem MARKET com o mercado fechado. O TTL foi
      // corrigido no motor (heartbeat.ts, SESSION_TTL_S), mas o gate não pode
      // depender disso: ausência de chave agora cai no relógio do próprio
      // processo, que é a mesma função usada pelo restante do web.
      const session = (await redis.get('market:session')) ?? getCurrentSession()
      // Sessões abertas para ordens MARKET: definição única em constants/market.
      if (session && !acceptsMarketOrders(session)) {
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

  private _resolveOrderPricingPrice(dto: CreateOrderDTO, currentPrice: number): number {
    if (
      dto.type === ORDER_TYPE.LIMIT ||
      dto.type === ORDER_TYPE.OCO ||
      (dto.type === ORDER_TYPE.SCHEDULED && dto.price !== undefined)
    ) {
      return dto.price ?? currentPrice
    }
    return currentPrice
  }

  private _roundFsAmount(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100
  }
}

export const orderService = new OrderService()
