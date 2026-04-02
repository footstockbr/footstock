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
import { OrderExecutor } from './OrderExecutor'
import { OrderMatcher } from './OrderMatcher'
import { ScheduledOrderRunner } from './ScheduledOrderRunner'
import { MarginCallChecker } from './MarginCallChecker'
import { LeverageInterestRunner } from './LeverageInterestRunner'
import { CLUB_STATE_BY_TICKER } from '../microstructure/clubStates'
import type { PreviousTickDelta } from '../types/motor.types'

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
  private orderExecutor: OrderExecutor
  private orderMatcher: OrderMatcher
  private scheduledOrderRunner: ScheduledOrderRunner
  private marginCallChecker: MarginCallChecker
  private leverageInterestRunner: LeverageInterestRunner
  /** Deltas percentuais do tick anterior — alimenta L10_Correlation. */
  private previousTickDeltas = new Map<string, PreviousTickDelta>()
  /** Sessão do tick anterior — detecta transições para resetar âncora do CB. */
  private previousSessionType: SessionType | null = null

  constructor(redis: Redis) {
    this.redis = redis
    this.prisma = new PrismaClient()
    this.healthService = MotorHealthService.getInstance(redis)
    this.orderExecutor = new OrderExecutor(this.prisma, redis)
    this.orderMatcher = new OrderMatcher(this.prisma, redis)
    this.scheduledOrderRunner = new ScheduledOrderRunner(this.prisma, redis, sessionManager)
    this.marginCallChecker = new MarginCallChecker(this.prisma, redis)
    this.leverageInterestRunner = new LeverageInterestRunner(this.prisma, redis)
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
      // Warm start: closePrice = currentPrice para evitar circuit breaker imediato
      // no reinício do motor (L9 compara currentPrice vs closePrice).
      // O closePrice do DB reflete o preço histórico de seed, mas o motor pode
      // ter rodado por horas/dias e os preços derivaram. Usar currentPrice como
      // âncora inicial é o comportamento correto — CB só dispara para movimentos
      // bruscos a partir do momento de (re)inicialização.
      const currentPriceNum = Number(asset.currentPrice)
      const state: AssetState = {
        id: asset.id,
        ticker: asset.ticker,
        cluster: asset.cluster as AssetState['cluster'],
        state: CLUB_STATE_BY_TICKER[asset.ticker] ?? '',
        currentPrice: currentPriceNum,
        openPrice: currentPriceNum,
        highPrice: currentPriceNum,
        lowPrice: currentPriceNum,
        closePrice: currentPriceNum,   // warm start: âncora do CB = preço atual
        fairValue: Number((asset as any).fairValue ?? asset.currentPrice),
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

    // Transição de sessão: resetar closePrice para evitar CB acumulado entre sessões
    if (this.previousSessionType !== null && this.previousSessionType !== sessionType) {
      logger.info(`[engine] Transição de sessão: ${this.previousSessionType} → ${sessionType} — resetando âncoras do CB`)
      for (const state of this.assetStates.values()) {
        state.closePrice = state.currentPrice
      }
    }
    this.previousSessionType = sessionType

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

        // Calcular novo preço via 9 camadas + L10 correlação
        const { newPrice, halted } = this.calculator.calculate(state, params, noise, this.previousTickDeltas)

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

    // Heartbeat SEMPRE publicado (mesmo sessão FECHADO ou halt global — motor está vivo)
    await this.healthService.publishTick()

    if (ticks.length > 0) {
      await this.redis.publish(REDIS_CHANNELS.MARKET_TICK, serializeTick(ticks))
    }

    // Atualizar mapa de deltas para L10_Correlation no próximo tick
    this.previousTickDeltas.clear()
    for (const [assetId, state] of this.assetStates) {
      if (state.isPaused) continue
      const tick = ticks.find(t => t.assetId === assetId)
      if (tick && state.currentPrice > 0) {
        const prevClose = tick.close > 0 ? tick.close : state.currentPrice
        this.previousTickDeltas.set(assetId, {
          deltaPercent: prevClose > 0 ? (state.currentPrice - prevClose) / prevClose : 0,
          cluster: state.cluster,
          state: state.state,
        })
      }
    }

    // Construir mapa de preços atuais para os engines de ordem
    const currentPrices: Record<string, number> = {}
    for (const state of this.assetStates.values()) {
      currentPrices[state.ticker] = state.currentPrice
    }

    // Processar ordens MARKET pendentes
    this.orderExecutor.processPendingMarketOrders(currentPrices).catch(err =>
      logger.error('[engine] OrderExecutor erro:', err)
    )

    // Verificar e executar ordens LIMIT/OCO
    this.orderMatcher.checkLimitOrders(currentPrices).catch(err =>
      logger.error('[engine] OrderMatcher erro:', err)
    )

    // Verificar ordens SCHEDULED no horário programado
    this.scheduledOrderRunner.checkScheduledOrders(currentPrices).catch(err =>
      logger.error('[engine] ScheduledOrderRunner erro:', err)
    )

    // Verificar margin calls de posições SHORT (a cada 5 ticks para não sobrecarregar)
    if (this.tickCount % 5 === 0) {
      this.marginCallChecker.checkMarginCalls(currentPrices).catch(err =>
        logger.error('[engine] MarginCallChecker erro:', err)
      )
    }

    // Cobrar juros diários de posições LONG alavancadas (sessão FECHADO = fim do dia)
    if (sessionType === 'FECHADO' && this.tickCount % 300 === 1) {
      // 300 ticks × 2s = 10 min — trigger no início do período FECHADO, não a cada tick
      this.leverageInterestRunner.chargeDaily().catch(err =>
        logger.error('[engine] LeverageInterestRunner erro:', err)
      )
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

  private _mapSessionType(s: string): string {
    const map: Record<string, string> = {
      PRE_ABERTURA: 'PRE_MARKET',
      NEGOCIACAO: 'REGULAR',
      CALL: 'REGULAR',
      AFTER_MARKET: 'AFTER_MARKET',
      FECHADO: 'CLOSED',
    }
    return map[s] ?? 'CLOSED'
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
        sessionType: this._mapSessionType(tick.sessionType) as any,
      },
    })
  }

  private async updateAssetPrices(): Promise<void> {
    const updates = [...this.assetStates.values()].map(state => {
      // Atualizar closePrice junto com currentPrice — o CB deve detectar
      // movimentos bruscos (>8% em 20s), não drift gradual acumulado desde o startup.
      state.closePrice = state.currentPrice
      return this.prisma.asset.update({
        where: { id: state.id },
        data: {
          currentPrice: state.currentPrice,
          volume: BigInt(state.volume),
        },
      })
    })
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
