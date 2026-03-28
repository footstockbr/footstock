// ============================================================================
// Foot Stock Motor — MarketEngine
// Loop principal de ticks + gestão de estado de ativos + order matching.
// ============================================================================

import type Redis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { PriceCalculator } from './PriceCalculator'
import { OrderBook } from './OrderBook'
import { sessionManager } from './SessionManager'
import { agentOrchestrator, AssetCluster } from '../agents/AgentOrchestrator'
import type { MarketContext } from '../agents/BaseAgent'
import { getClusterParams } from '../microstructure/clusters'
import { buildMotorTick, serializeTick } from '../microstructure/MotorTick'
import { REDIS_CHANNELS } from '../types/events.types'
import type { AssetState, MotorTick, SessionType } from '../types/motor.types'
import { logger } from '../utils/logger'
import { MotorHealthService } from '../services/MotorHealthService'

const TICK_INTERVAL_MS = parseInt(process.env.MOTOR_TICK_INTERVAL_MS ?? '2000', 10)
const PERSIST_HISTORY_EVERY = 5  // Persistir PriceHistory a cada N ticks (A_TOP persiste sempre)

export class MarketEngine {
  private redis: Redis
  private prisma: PrismaClient
  private calculator = new PriceCalculator()
  private orderBooks: Map<string, OrderBook> = new Map()
  private assetStates: Map<string, AssetState> = new Map()
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private tickCount = 0
  private healthService: MotorHealthService

  constructor(redis: Redis) {
    this.redis = redis
    this.prisma = new PrismaClient()
    this.healthService = MotorHealthService.getInstance(redis)
  }

  async start(): Promise<void> {
    await this.loadAssets()
    logger.info(`[engine] ${this.assetStates.size} ativos carregados. Iniciando ticks...`)

    this.tickTimer = setInterval(() => {
      this.runTick().catch(err => logger.error('[engine] Erro no tick:', err))
    }, TICK_INTERVAL_MS)
  }

  async stop(): Promise<void> {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
    agentOrchestrator.dispose()
    await this.prisma.$disconnect()
    logger.info('[engine] Engine encerrado.')
  }

  private async loadAssets(): Promise<void> {
    const assets = await this.prisma.asset.findMany({ where: { isActive: true } })

    for (const asset of assets) {
      const state: AssetState = {
        id: asset.id,
        ticker: asset.ticker,
        cluster: asset.cluster as AssetState['cluster'],
        currentPrice: Number(asset.currentPrice),
        openPrice: Number(asset.openPrice),
        highPrice: Number(asset.currentPrice),
        lowPrice: Number(asset.currentPrice),
        closePrice: Number(asset.closePrice),
        volume: 0,
        variance: 0.0001,  // Variância GARCH inicial
        pendingBuyVolume: 0,
        pendingSellVolume: 0,
        isPaused: false,
        newsImpact: 0,
        newsImpactTicks: 0,
      }

      this.assetStates.set(asset.id, state)
      this.orderBooks.set(asset.id, new OrderBook())

      // Inicializar agentes para este ativo conforme seu cluster
      const cluster = state.cluster === 'A_TOP' ? AssetCluster.A_TOP : AssetCluster.B_ILLIQ
      agentOrchestrator.initAsset(asset.id, cluster)
    }

    logger.info(`[engine] AgentOrchestrator inicializado para ${this.assetStates.size} ativos`)
  }

  private async runTick(): Promise<void> {
    this.tickCount++
    const sessionType = sessionManager.getCurrentSession()
    const volatilityMultiplier = sessionManager.getVolatilityMultiplier(sessionType)
    const ticks: MotorTick[] = []

    for (const [assetId, state] of this.assetStates) {
      if (state.isPaused) continue

      try {
        const params = getClusterParams(state.cluster)
        const orderBook = this.orderBooks.get(assetId)!

        // Atualizar volumes pendentes no estado
        state.pendingBuyVolume = orderBook.getBuyVolume()
        state.pendingSellVolume = orderBook.getSellVolume()

        // Gerar ruído gaussiano (Box-Muller)
        const noise = this.gaussianNoise()

        // Calcular novo preço via 9 camadas
        const { newPrice, halted } = this.calculator.calculate(state, params, noise)

        if (halted) {
          // Circuit breaker: notificar e pausar por 150 ticks
          this.notifyCircuitBreaker(assetId, state.ticker).catch(console.error)
          state.isPaused = true
          setTimeout(() => {
            state.isPaused = false
            logger.info(`[engine] ${state.ticker} retomado após circuit breaker`)
          }, 150 * TICK_INTERVAL_MS)
          continue
        }

        // Aplicar impacto dos agentes de mercado (module-8/TASK-3)
        const agentCtx: MarketContext = {
          ticker: state.ticker,
          currentPrice: newPrice,
          fairValue: state.openPrice, // Fair value baseado no preço de abertura
          priceChange24h: state.openPrice > 0 ? (newPrice - state.openPrice) / state.openPrice : 0,
          volume24h: state.volume,
          bid: newPrice * 0.999,
          ask: newPrice * 1.001,
          spread: newPrice * 0.002,
          session: sessionType,
          volatilityMultiplier,
        }
        const agentImpact = agentOrchestrator.tickAsset(assetId, agentCtx)
        const finalPrice = newPrice * (1 + agentImpact)

        // Match de ordens pendentes
        const fills = orderBook.matchOrders(finalPrice)
        if (fills.length > 0) {
          this.processFills(fills, state).catch(console.error)
        }

        // Atualizar estado em memória
        state.currentPrice = finalPrice
        state.highPrice = Math.max(state.highPrice, finalPrice)
        state.lowPrice = Math.min(state.lowPrice, finalPrice)
        state.volume += state.pendingBuyVolume + state.pendingSellVolume

        const tick = buildMotorTick(state, finalPrice, sessionType)
        ticks.push(tick)

        // Persistir PriceHistory (A_TOP: sempre; outros: a cada 5 ticks)
        const shouldPersist =
          state.cluster === 'A_TOP' ||
          this.tickCount % PERSIST_HISTORY_EVERY === 0

        if (shouldPersist) {
          this.persistPriceHistory(tick).catch(console.error)
        }
      } catch (err) {
        logger.error(`[engine] Erro no tick do ativo ${state.ticker} (${assetId}):`, err)
      }
    }

    if (ticks.length > 0) {
      await this.redis.publish(REDIS_CHANNELS.MARKET_TICK, serializeTick(ticks))
      // Publicar heartbeat de saúde do motor
      await this.healthService.publishTick()
    }

    // Sincronizar preços no banco a cada 10 ticks
    if (this.tickCount % 10 === 0) {
      this.updateAssetPrices().catch(console.error)
    }
  }

  /** Box-Muller transform para gerar N(0,1) */
  private gaussianNoise(): number {
    const u1 = Math.random()
    const u2 = Math.random()
    return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2)
  }

  private async persistPriceHistory(tick: MotorTick): Promise<void> {
    await this.prisma.priceHistory.create({
      data: {
        assetId: tick.assetId,
        timestamp: new Date(tick.timestamp),
        open: tick.open,
        high: tick.high,
        low: tick.low,
        close: tick.price,
        volume: BigInt(tick.volume),
        sessionType: tick.sessionType as string,
      },
    })
  }

  private async updateAssetPrices(): Promise<void> {
    const updates = [...this.assetStates.values()].map(state =>
      this.prisma.asset.update({
        where: { id: state.id },
        data: {
          currentPrice: state.currentPrice,
          volume: BigInt(state.volume),
        },
      })
    )
    await Promise.allSettled(updates)
  }

  private async processFills(
    fills: { filledOrderId: string; executedPrice: number; quantity: number }[],
    _state: AssetState
  ): Promise<void> {
    for (const fill of fills) {
      const order = await this.prisma.order.update({
        where: { id: fill.filledOrderId },
        data: {
          status: 'FILLED',
          executedPrice: fill.executedPrice,
        },
        select: { userId: true },
      })
      // Notificar ORDER_EXECUTED
      this.notifyOrderExecuted(fill.filledOrderId, fill.executedPrice, order.userId).catch(
        console.error
      )
      logger.info(`[engine] Ordem ${fill.filledOrderId} executada @ ${fill.executedPrice}`)
    }
  }

  // ─── Notificações Redis ──────────────────────────────────────────────────

  private async notifyCircuitBreaker(assetId: string, ticker: string): Promise<void> {
    const notification = {
      type: 'CIRCUIT_BREAKER',
      assetId,
      ticker,
      timestamp: Date.now(),
      haltDurationSeconds: 300,  // 150 ticks × 2s
    }
    await this.redis.publish('notifications:circuit-breaker', JSON.stringify(notification))
    logger.warn(`[engine] CIRCUIT_BREAKER publicado para ${ticker}`)
  }

  private async notifyOrderExecuted(
    orderId: string,
    executedPrice: number,
    userId: string
  ): Promise<void> {
    const notification = {
      type: 'ORDER_EXECUTED',
      orderId,
      executedPrice,
      userId,
      timestamp: Date.now(),
    }
    await this.redis.publish('notifications:order-executed', JSON.stringify(notification))
  }

  // ─── Métodos de controle admin ───────────────────────────────────────────

  injectNewsImpact(assetId: string, magnitude: number, durationTicks: number): void {
    const state = this.assetStates.get(assetId)
    if (!state) return
    state.newsImpact = magnitude
    state.newsImpactTicks = durationTicks
  }

  pauseAsset(assetId: string): void {
    const state = this.assetStates.get(assetId)
    if (state) state.isPaused = true
  }

  resumeAsset(assetId: string): void {
    const state = this.assetStates.get(assetId)
    if (state) state.isPaused = false
  }

  adjustPrice(assetId: string, newPrice: number): void {
    const state = this.assetStates.get(assetId)
    if (!state) return
    state.currentPrice = newPrice
    state.closePrice = newPrice  // Reset âncora para evitar circuit breaker imediato
  }

  haltAll(): number {
    let count = 0
    for (const state of this.assetStates.values()) {
      if (!state.isPaused) {
        state.isPaused = true
        count++
      }
    }
    logger.warn(`[engine] HALT_ALL: ${count} ativos pausados`)
    return count
  }

  resumeAll(): number {
    let count = 0
    for (const state of this.assetStates.values()) {
      if (state.isPaused) {
        state.isPaused = false
        count++
      }
    }
    logger.info(`[engine] RESUME_ALL: ${count} ativos retomados`)
    return count
  }
}
