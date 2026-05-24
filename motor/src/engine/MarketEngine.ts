// ============================================================================
// Foot Stock Motor — MarketEngine
// Loop principal de ticks + gestão de estado de ativos + order matching.
// ============================================================================

import type Redis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { PriceCalculator } from './PriceCalculator'
import { OrderBook } from './OrderBook'
import { sessionManager } from './SessionManager'
import { agentOrchestrator, AssetCluster } from '../agents/AgentOrchestrator'
import type { MarketContext } from '../agents/BaseAgent'
import { getClusterParams } from '../microstructure/clusters'
import { buildMotorTick, buildHaltTick, serializeTick } from '../microstructure/MotorTick'
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
import { NUDGE_MIN_PRICE } from './nudge-constants'

const TICK_INTERVAL_MS = parseInt(process.env.MOTOR_TICK_INTERVAL_MS ?? '2000', 10)
const PERSIST_HISTORY_EVERY = 6  // Persistir PriceHistory a cada N ticks ≈ 1min com tick=10s (reduzido de 30 para evitar gráficos degrau-degrau em B_LIQUID/B_ILLIQ; A_TOP persiste sempre — ver item 004)
const PAUSE_RESUME_MS = 5 * 60 * 1000  // 5 minutos absolutos (independente de TICK_INTERVAL_MS)
// Heartbeat a cada N ticks (reduz comandos Redis — TTL do MotorHealthService: 60s)
const HEARTBEAT_EVERY = parseInt(process.env.MOTOR_HEARTBEAT_EVERY ?? '5', 10)
// Sanity cap em state.volume — defesa em profundidade contra feedback loop dos
// agents que escalam quantity por volume24h (PanicSeller, MarketMaker).
// MAX_INT64 e ~9.2e18; usar 1e15 (1 quatrilhao) deixa folga absurda para
// volume legitimo e ainda detecta loop bem antes de overflow.
const MAX_DAILY_VOLUME = 1_000_000_000_000_000  // 1e15

export class MarketEngine {
  private redis: Redis
  private prisma: PrismaClient
  private calculator: PriceCalculator
  /** Últimos resultados de camadas por ativo — exposto via endpoint /layers-debug. */
  private lastLayerResults: Map<string, import('./PriceCalculator').PriceCalculationResult> = new Map()
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
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
    this.prisma = new PrismaClient({ adapter })
    this.calculator = new PriceCalculator(redis)  // Passa Redis para persistência dos estados de camada
    this.healthService = MotorHealthService.getInstance(redis)
    this.orderExecutor = new OrderExecutor(this.prisma, redis)
    this.orderMatcher = new OrderMatcher(this.prisma, redis)
    this.scheduledOrderRunner = new ScheduledOrderRunner(this.prisma, redis, sessionManager)
    this.marginCallChecker = new MarginCallChecker(this.prisma, redis)
    this.leverageInterestRunner = new LeverageInterestRunner(this.prisma, redis)
  }

  async start(): Promise<void> {
    // Limpa halts stale do DB antes de carregar ativos.
    // Ao adquirir liderança, garantimos single-leader: não existe outra instância ativa.
    // Todos os isHalted=true no DB são stale de um motor anterior que morreu antes de
    // auto-resumir via setTimeout. Limpar incondicionalmente.
    const cleared = await this.prisma.asset.updateMany({
      where: { isHalted: true },
      data: { isHalted: false, haltReason: null },
    })
    if (cleared.count > 0) {
      logger.warn(`[engine] Startup: ${cleared.count} halts stale limpos do DB`)
    }

    await this.loadAssets()
    logger.info(`[engine] ${this.assetStates.size} ativos carregados. Iniciando ticks...`)

    this.tickTimer = setInterval(() => {
      this.runTick().catch(err => logger.error('[engine] Erro no tick:', err))
    }, TICK_INTERVAL_MS)
  }

  /**
   * Para o loop de ticks e libera agentes.
   * @param disconnectPrisma Desconectar o Prisma ao final (default: false).
   *   Usar false em failover (engine pode ser reiniciado via start()).
   *   Usar true apenas no shutdown definitivo do processo.
   */
  async stop(disconnectPrisma = false): Promise<void> {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
    agentOrchestrator.dispose()
    if (disconnectPrisma) {
      await this.prisma.$disconnect()
    }
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
        fairValue: Number(asset.fairValue ?? asset.currentPrice),
        volume: 0,
        variance: 0.00001,  // Variância GARCH inicial (reduzida 10x: evita ruído GARCH soterrar L2_Anchor)
        pendingBuyVolume: 0,
        pendingSellVolume: 0,
        isPaused: false,
        haltReason: null,
        haltResumeAt: null,
        newsImpact: 0,
        newsImpactTicks: 0,
        ofiState: 0,               // L4_OFI: OFI_t inicial (sem acumulação)
        dailyVolAccum: 0,          // L9_DailyVolTarget: acumulador diário de variação
        dailySigmaMultiplier: 1.0, // L9_DailyVolTarget: multiplicador sigma (1.0 = normal)
        volatilityMultiplier: 1.0, // SessionManager: multiplicador por sessão (setado a cada tick)
      }

      this.assetStates.set(asset.id, state)
      this.orderBooks.set(asset.id, new OrderBook())

      // Inicializar agentes para este ativo conforme seu cluster real
      const clusterMap: Record<string, AssetCluster> = {
        A_TOP: AssetCluster.A_TOP,
        A_MID: AssetCluster.A_MID,
        A_SMALL: AssetCluster.A_SMALL,
        B_LIQUID: AssetCluster.B_LIQUID,
        B_ILLIQ: AssetCluster.B_ILLIQ,
      }
      const cluster = clusterMap[state.cluster] ?? AssetCluster.B_ILLIQ
      agentOrchestrator.initAsset(asset.id, cluster)
    }

    // Hydratar estados críticos do Redis (variance GARCH, OFI state, daily vol)
    // Executado após todos os ativos terem sido carregados com defaults seguros
    const hydratePromises = [...this.assetStates.values()].map(state =>
      this.calculator.hydrateFromRedis(state)
    )
    await Promise.allSettled(hydratePromises)

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
      // Reset do DailyVolTarget e volume acumulado ao iniciar o dia de negociação
      if (sessionType === 'PRE_OPENING') {
        for (const s of this.assetStates.values()) {
          this.calculator.resetDailyVolTarget(s)
          s.volume = 0  // Reset volume 24h (evita acumulação ilimitada de volume sintético)
        }
        this.calculator.resetDailyVolCap()  // compatibilidade retroativa
        logger.info('[engine] DailyVolTarget e volume resetados para nova sessão PRE_OPENING')
      }
    }
    this.previousSessionType = sessionType

    // Incluir ticks de halt para ativos suspensos (frontend precisa saber do halt em tempo real)
    for (const [, state] of this.assetStates) {
      if (!state.isPaused) continue
      // Usa haltReason e haltResumeAt persistidos no estado (evita hardcode e preserva estimativa)
      ticks.push(buildHaltTick(state, sessionType, state.haltReason ?? 'CIRCUIT_BREAKER', state.haltResumeAt))
    }

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

        // Propagar multiplicador de sessão para o estado (L1/L3 leem de state)
        state.volatilityMultiplier = volatilityMultiplier

        // Calcular novo preço via 10 camadas (L1-L10) + Correlação
        const calcResult = this.calculator.calculate(state, params, noise, this.previousTickDeltas)
        const { newPrice, halted } = calcResult

        // Armazenar resultado das camadas para o endpoint de debug (admin only)
        this.lastLayerResults.set(state.ticker, calcResult)

        if (halted) {
          // Circuit breaker: notificar, pausar e persistir halt no DB
          const variationPct = state.closePrice > 0
            ? Math.abs((state.currentPrice - state.closePrice) / state.closePrice) * 100
            : 0
          const resumeAt = Date.now() + PAUSE_RESUME_MS
          state.isPaused = true
          state.haltReason = 'CIRCUIT_BREAKER'
          state.haltResumeAt = resumeAt
          this.notifyCircuitBreaker(assetId, state.ticker, variationPct, resumeAt, sessionType).catch(console.error)
          setTimeout(() => {
            state.isPaused = false
            state.haltReason = null
            state.haltResumeAt = null
            // Fix C: NÃO rebaixar a âncora ao retomar. Antes, closePrice virava o
            // preço deprimido pós-halt, permitindo nova queda de 8% imediatamente
            // (ratchet de quedas sucessivas). A âncora canônica é o close do dia
            // anterior (resetada apenas em PRE_OPENING). Para evitar re-trigger
            // imediato do CB enquanto o ativo se recupera, usamos openPrice do dia
            // como âncora (em vez de currentPrice deprimido).
            if (state.openPrice > 0) {
              state.closePrice = state.openPrice
            }
            logger.info(`[engine] ${state.ticker} retomado após circuit breaker (closePrice mantido em ${state.closePrice.toFixed(4)}, currentPrice=${state.currentPrice.toFixed(4)})`)
            this.persistHaltState(assetId, false, null).catch(console.error)
            // Publica tick de retomada para o frontend atualizar em tempo real
            const resumeTick = buildHaltTick(state, sessionType, null, null)
            resumeTick.isHalted = false
            this.redis.publish(REDIS_CHANNELS.MARKET_TICK, serializeTick([resumeTick])).catch(console.error)
          }, PAUSE_RESUME_MS)
          continue
        }

        // Aplicar impacto dos agentes de mercado (module-8/TASK-3)
        const agentCtx: MarketContext = {
          ticker: state.ticker,
          currentPrice: newPrice,
          fairValue: state.fairValue, // Fair value da coluna fair_value (âncora OU)
          priceChange24h: state.openPrice > 0 ? (newPrice - state.openPrice) / state.openPrice : 0,
          volume24h: state.volume,
          bid: newPrice * 0.999,
          ask: newPrice * 1.001,
          spread: newPrice * 0.002,
          session: sessionType,
          volatilityMultiplier,
        }
        const { impact: agentImpact, syntheticVolume } = agentOrchestrator.tickAsset(assetId, agentCtx)
        // Fix A: re-aplicar floor depois do impacto dos agentes — sem isso,
        // o agente puxa o preço abaixo de NUDGE_MIN_PRICE e equilibra em ~0.98.
        const finalPrice = Math.max(NUDGE_MIN_PRICE, newPrice * (1 + agentImpact))

        // Acumular volume sintético dos agentes (sem isso, volume 24h fica zero).
        // Clamp em MAX_DAILY_VOLUME garante que mesmo se um agente novo escapar
        // do cap interno, nao ha overflow do BigInt persistido em assets.volume.
        state.volume = Math.min(state.volume + syntheticVolume, MAX_DAILY_VOLUME)

        // Match de ordens pendentes
        const fills = orderBook.matchOrders(finalPrice)
        if (fills.length > 0) {
          this.processFills(fills, state).catch(console.error)
        }

        // Atualizar estado em memória
        state.currentPrice = finalPrice
        state.highPrice = Math.max(state.highPrice, finalPrice)
        state.lowPrice = Math.min(state.lowPrice, finalPrice)
        state.volume = Math.min(
          state.volume + state.pendingBuyVolume + state.pendingSellVolume,
          MAX_DAILY_VOLUME,
        )

        const tick = buildMotorTick(state, finalPrice, sessionType)
        ticks.push(tick)

        /** A_TOP persiste sempre (FDD canônico). Demais tiers persistem a cada PERSIST_HISTORY_EVERY ticks. */
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

    // Heartbeat publicado a cada HEARTBEAT_EVERY ticks (motor está vivo)
    // Sessão canônica (PRE_OPENING/TRADING/CLOSING_CALL/AFTER_MARKET/CLOSED) — consumida pelo OrderService do Next.js
    if (this.tickCount % HEARTBEAT_EVERY === 0) {
      await this.healthService.publishTick(sessionType)
    }

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

    // Cobrar juros diários de posições LONG alavancadas (sessão CLOSED = fim do dia)
    if (sessionType === 'CLOSED' && this.tickCount % 300 === 1) {
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
        sessionType: tick.sessionType as any,
      },
    })
  }

  private async updateAssetPrices(): Promise<void> {
    const updates = [...this.assetStates.values()].map(state => {
      // Fix B: NÃO ressincronizar closePrice com currentPrice a cada 10 ticks.
      // Esse rolling-anchor neutralizava o CB: a janela de detecção virava 20s
      // (~3.5% máximo de drift por janela) enquanto a deriva acumulada (que é o
      // que importa) ficava invisível. Agora closePrice é a âncora diária —
      // resetada apenas no PRE_OPENING (linha ~170).
      // Last-line guard: garante que o BigInt persistido nunca extrapole
      // MAX_DAILY_VOLUME (1e15), mesmo se state.volume estiver corrompido por
      // estado em memoria antigo nao migrado.
      const safeVolume = Math.max(0, Math.min(state.volume, MAX_DAILY_VOLUME))
      if (!Number.isFinite(state.volume) || state.volume > MAX_DAILY_VOLUME) {
        logger.warn(`[engine] volume out-of-range ticker=${state.ticker} raw=${state.volume} clamped=${safeVolume}`)
        state.volume = safeVolume
      }
      return this.prisma.asset.update({
        where: { id: state.id },
        data: {
          currentPrice: state.currentPrice,
          volume: BigInt(safeVolume),
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

  private async notifyCircuitBreaker(
    assetId: string,
    ticker: string,
    variationPct: number,
    resumeAt: number,
    sessionType: SessionType,
  ): Promise<void> {
    const haltReason = 'CIRCUIT_BREAKER'

    // 1. Persistir halt no banco (isHalted=true) — sincroniza OrderService que lê do DB
    await this.persistHaltState(assetId, true, haltReason)

    // 2. Publicar evento circuit-breaker no Redis (consumido por outros serviços)
    const notification = {
      type: 'CIRCUIT_BREAKER',
      assetId,
      ticker,
      timestamp: Date.now(),
      haltDurationSeconds: 300,  // 150 ticks × 2s
      resumeAt,
      variationPct: parseFloat(variationPct.toFixed(2)),
      haltReason,
    }
    await this.redis.publish('notifications:circuit-breaker', JSON.stringify(notification))
    // Métrica: total de ativações do circuit breaker (consumida pelo admin dashboard)
    await this.redis.incr('motor:metrics:circuit_breaker_activations').catch(() => {})
    logger.warn(`[engine] CIRCUIT_BREAKER publicado para ${ticker} (${variationPct.toFixed(2)}% — retomada em ${new Date(resumeAt).toISOString()})`)

    // 3. Notificar usuários com posições no ativo suspenso (in-app + push)
    await this.notifyUsersWithPositions(assetId, ticker, resumeAt, variationPct)

    // 4. Publicar halt tick para SSE chegar ao frontend em tempo real
    const state = this.assetStates.get(assetId)
    if (state) {
      const haltTick = buildHaltTick(state, sessionType, haltReason, resumeAt)
      await this.redis.publish(REDIS_CHANNELS.MARKET_TICK, serializeTick([haltTick]))
    }
  }

  /** Persiste isHalted e haltReason no banco de dados. */
  private async persistHaltState(
    assetId: string,
    isHalted: boolean,
    haltReason: string | null
  ): Promise<void> {
    try {
      await this.prisma.asset.update({
        where: { id: assetId },
        data: { isHalted, haltReason },
      })
    } catch (err) {
      logger.error(`[engine] Falha ao persistir halt state para ${assetId}:`, err)
    }
  }

  /** Notifica usuários que possuem posições no ativo suspenso. */
  private async notifyUsersWithPositions(
    assetId: string,
    ticker: string,
    resumeAt: number,
    variationPct: number,
  ): Promise<void> {
    try {
      const positions = await this.prisma.position.findMany({
        where: { assetId, quantity: { gt: 0 } },
        select: { userId: true },
        distinct: ['userId'],
      })

      const resumeAtIso = new Date(resumeAt).toISOString()
      const resumeMin = Math.ceil((resumeAt - Date.now()) / 60_000)

      if (positions.length > 0) {
        // Persistir notificações diretamente no banco — Supabase Realtime broadcast
        // para clientes conectados + push service lê da tabela notifications.
        // Redis publish para notifications:{userId} não tem consumer no Next.js,
        // então a persistência direta é o caminho correto.
        await this.prisma.notification.createMany({
          data: positions.map(({ userId }: { userId: string }) => ({
            userId,
            type: 'CIRCUIT_BREAKER' as any,
            title: `Ativo ${ticker} suspenso`,
            body: `Negociação interrompida por variação de ${variationPct.toFixed(1)}%. Retomada em ~${resumeMin} min.`,
            data: { ticker, resumeAt: resumeAtIso, variationPct },
          })),
        })
        logger.info(`[engine] CIRCUIT_BREAKER: ${positions.length} notificações criadas para ${ticker}`)
      }
    } catch (err) {
      logger.error(`[engine] Falha ao notificar usuários sobre CB de ${ticker}:`, err)
    }
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

    // Sanitização defensiva: clampa magnitude em [-1, 1] e rejeita NaN/Infinity.
    // L10 usa `newsImpact !== 0 && newsImpactTicks > 0` como flag de "notícia ativa"
    // para relaxar o circuit breaker — valores absurdos não podem entrar.
    if (!Number.isFinite(magnitude) || !Number.isFinite(durationTicks)) return
    const clampedMagnitude = Math.max(-1, Math.min(1, magnitude))
    const clampedTicks = Math.max(0, Math.min(200, Math.floor(durationTicks)))

    state.newsImpact = clampedMagnitude
    state.newsImpactTicks = clampedTicks
  }

  /** Resolve ticker (ex: 'FOG3') para o assetId (UUID) interno do engine. */
  findAssetIdByTicker(ticker: string): string | undefined {
    for (const [id, state] of this.assetStates) {
      if (state.ticker === ticker) return id
    }
    return undefined
  }

  pauseAsset(assetId: string, haltReason?: string | null): void {
    const state = this.assetStates.get(assetId)
    if (state) {
      state.isPaused = true
      state.haltReason = haltReason ?? null
      state.haltResumeAt = null  // Halt admin não tem retomada automática determinística
    }
  }

  resumeAsset(assetId: string): void {
    const state = this.assetStates.get(assetId)
    if (state) {
      state.isPaused = false
      state.haltReason = null
      state.haltResumeAt = null
    }
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

  // ─── Debug / Admin (T-009) ───────────────────────────────────────────────

  /**
   * Retorna contribuição de cada camada por ticker no último tick processado.
   * Usado por `GET /api/v1/market/engine/layers-debug` (admin only).
   *
   * @param ticker Opcional: filtrar por ativo. Se omitido, retorna todos.
   */
  getLayersDebug(ticker?: string): Record<string, unknown> {
    if (ticker) {
      const result = this.lastLayerResults.get(ticker)
      const state  = [...this.assetStates.values()].find(s => s.ticker === ticker)
      if (!result || !state) return {}
      return {
        ticker,
        currentPrice:     state.currentPrice,
        isPaused:         state.isPaused,
        dailyVolAccum:    state.dailyVolAccum ?? 0,
        sigmaMultiplier:  state.dailySigmaMultiplier ?? 1.0,
        ofiState:         state.ofiState ?? 0,
        variance:         state.variance,
        halted:           result.halted,
        layers:           result.layerResults,
      }
    }

    const out: Record<string, unknown> = {}
    for (const [t, result] of this.lastLayerResults) {
      const state = [...this.assetStates.values()].find(s => s.ticker === t)
      out[t] = {
        ticker:          t,
        currentPrice:    state?.currentPrice,
        isPaused:        state?.isPaused ?? false,
        dailyVolAccum:   state?.dailyVolAccum ?? 0,
        sigmaMultiplier: state?.dailySigmaMultiplier ?? 1.0,
        ofiState:        state?.ofiState ?? 0,
        variance:        state?.variance,
        halted:          result.halted,
        layers:          result.layerResults,
      }
    }
    return out
  }

  /**
   * Retorna histórico OFI do ticker (últimos 100 pontos).
   * Usado por `GET /api/v1/assets/:ticker/ofi-history`.
   */
  async getOfiHistory(ticker: string): Promise<{ timestamp: number; ofi: number }[]> {
    try {
      const raw = await this.redis.lrange(`ofi:history:${ticker}`, 0, 99)
      return raw.map(r => JSON.parse(r) as { timestamp: number; ofi: number })
    } catch {
      return []
    }
  }
}
