// ============================================================================
// FootStock Motor — MarketEngine
// Loop principal de ticks + gestão de estado de ativos + order matching.
// ============================================================================

import type Redis from 'ioredis'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { PriceCalculator } from './PriceCalculator'
import { buildPriceAttributionV2, mergePriceAttributions, parsePriceAttribution } from './PriceAttribution'
import { MotorLayerRuntimeConfigService } from './MotorLayerRuntimeConfig'
import { OrderFlowSnapshotService } from './OrderFlowSnapshotService'
import { AttributionPreflightService } from './AttributionPreflightService'
import { OrderBook } from './OrderBook'
import { sessionManager } from './SessionManager'
import { agentOrchestrator, AssetCluster } from '../agents/AgentOrchestrator'
import type { MarketContext } from '../agents/BaseAgent'
import { getClusterParams } from '../microstructure/clusters'
import { buildMotorTick, buildHaltTick, serializeTick } from '../microstructure/MotorTick'
import { REDIS_CHANNELS } from '../types/events.types'
import type { ActiveNewsImpact, AdminPriceAdjustment, AnyPriceAttribution, AssetState, MotorTick, OrderFlowSnapshot, SessionType, TickInputSnapshot } from '../types/motor.types'
import { logger, motorMetrics } from '../utils/logger'
import { MotorHealthService } from '../services/MotorHealthService'
import { OrderExecutor } from './OrderExecutor'
import { OrderMatcher } from './OrderMatcher'
import { ScheduledOrderRunner } from './ScheduledOrderRunner'
import { MarginCallChecker } from './MarginCallChecker'
import { LeverageInterestRunner } from './LeverageInterestRunner'
import { CLUB_STATE_BY_TICKER } from '../microstructure/clubStates'
import type { PreviousTickDelta } from '../types/motor.types'
import { NUDGE_MIN_PRICE } from './nudge-constants'
import { deriveAgentQuotes } from './agent-quotes'
import { NEWS_IMPACT_DURATION_TICKS } from '../contracts/news-inject-contract'
// TODO:REMOVE debug instrumentation (loop 06-17-motor-footstock-correcoes-variacoes / T0.1)
import { maybeEmitTickDebug } from '../utils/tickDebug'

const TICK_INTERVAL_MS = parseInt(process.env.MOTOR_TICK_INTERVAL_MS ?? '2000', 10)
const PERSIST_HISTORY_EVERY = 6  // Persistir PriceHistory a cada N ticks ≈ 1min com tick=10s (reduzido de 30 para evitar gráficos degrau-degrau em B_LIQUID/B_ILLIQ; A_TOP persiste sempre — ver item 004)
const PAUSE_RESUME_MS = 5 * 60 * 1000  // 5 minutos absolutos (independente de TICK_INTERVAL_MS)
// Heartbeat a cada N ticks (reduz comandos Redis — TTL do MotorHealthService: 60s)
const HEARTBEAT_EVERY = parseInt(process.env.MOTOR_HEARTBEAT_EVERY ?? '5', 10)
// T1.4 (loop 06-17): semântica de execução de ordens reais. 'pre-agent' (default-safe)
// casa ordens reais no preço PRÉ-agente (somente dinâmica do motor); 'post-agent' casa
// no preço publicado (com o impacto do agente). A decisão pre/pos é uma flag operacional
// (donos: operador técnico + produto/mercado) — trocar de lado não exige reimplementação.
// Qualquer valor diferente de 'post-agent' resolve para o default seguro 'pre-agent'.
const REAL_ORDER_MATCH_PRICE: 'pre-agent' | 'post-agent' =
  process.env.MOTOR_REAL_ORDER_MATCH_PRICE === 'post-agent' ? 'post-agent' : 'pre-agent'
// Sanity cap em state.volume — defesa em profundidade contra feedback loop dos
// agents que escalam quantity por volume24h (PanicSeller, MarketMaker).
// MAX_INT64 e ~9.2e18; usar 1e15 (1 quatrilhao) deixa folga absurda para
// volume legitimo e ainda detecta loop bem antes de overflow.
const MAX_DAILY_VOLUME = 1_000_000_000_000_000  // 1e15

/**
 * T2.1 — Soma o volume EXECUTADO de um conjunto de fills casados pelo OrderBook.
 * state.volume reflete fluxo executado (synthetic dos agentes + fills), nunca book
 * pendente; alimentar volume com o book inflava o 24h com ordens que talvez nunca
 * executassem. Pura e determinística (testável com 500 ticks sem fills).
 */
export function sumExecutedVolume(fills: ReadonlyArray<{ quantity: number }>): number {
  let total = 0
  for (const fill of fills) total += fill.quantity
  return total
}

/**
 * T4.2 — Resolve a âncora do circuit breaker (closePrice) no warm-start/hidratação.
 *
 * NÃO re-ancora em currentPrice: re-ancorar a cada reinício do motor descartava a
 * âncora real do dia, alargando a banda de 8% indefinidamente. Combinado com a
 * re-âncora de retomada do CB, produzia a catraca que descia o preço em escada até
 * o floor R$1 (sintoma documentado no próprio loadAssets/tick). A re-âncora legítima
 * acontece apenas na abertura do dia (transição de sessão PRE_OPENING).
 *
 * Precedência:
 *   1. recoveryPrice — auto-recovery reseta o ativo ao preço canônico; a âncora
 *      acompanha esse preço (reset legítimo, não warm-start).
 *   2. persistedClose — a âncora do dia persistida no DB sobrevive ao restart.
 *   3. currentPrice — fallback de segurança quando o close persistido é inválido
 *      (<=0 ou não-finito): evita âncora nula que desligaria o CB (L10 ignora
 *      closePrice === 0). Cobre a condição de reversão "produzir referência nula".
 *
 * Pura e determinística.
 */
export function resolveWarmStartClosePrice(
  persistedClose: number,
  currentPrice: number,
  recoveryPrice: number | null,
): number {
  if (recoveryPrice !== null) return recoveryPrice
  if (Number.isFinite(persistedClose) && persistedClose > 0) return persistedClose
  return currentPrice
}

/**
 * T3.1 — Retorno realizado entre o tick anterior e o atual de um ativo:
 *   (currentPrice - previousPrice) / previousPrice
 * Alimenta previousTickDeltas -> L10_Correlation. NÃO usa o close diário: antes
 * o delta saía de (currentPrice - close)/close, que é o retorno DIÁRIO (vs a
 * âncora do CB), inflando a correlação inter-ativos por ordens de grandeza.
 *
 * Sem previousPrice (primeiro tick após (re)start) ou com previousPrice/currentPrice
 * não-positivos o delta é 0 — dado inicial tratável. Crucialmente, NÃO substitui o
 * previousPrice ausente pelo close diário (que produziria um retorno diário espúrio
 * silenciosamente no reinício do motor). Pura e determinística.
 */
export function computeTickReturnDelta(
  currentPrice: number,
  previousPrice: number | undefined,
): number {
  if (previousPrice === undefined || previousPrice <= 0 || currentPrice <= 0) return 0
  return (currentPrice - previousPrice) / previousPrice
}

export class MarketEngine {
  private redis: Redis
  private prisma: PrismaClient
  private calculator: PriceCalculator
  private layerRuntimeConfig: MotorLayerRuntimeConfigService
  /** Últimos resultados de camadas por ativo — exposto via endpoint /layers-debug. */
  private lastLayerResults: Map<string, import('./PriceCalculator').PriceCalculationResult> = new Map()
  private orderBooks: Map<string, OrderBook> = new Map()
  private assetStates: Map<string, AssetState> = new Map()
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private tickCount = 0
  private healthService: MotorHealthService
  private orderExecutor: OrderExecutor
  private orderMatcher: OrderMatcher
  private orderFlowSnapshotService: OrderFlowSnapshotService
  private scheduledOrderRunner: ScheduledOrderRunner
  private marginCallChecker: MarginCallChecker
  private leverageInterestRunner: LeverageInterestRunner
  /** Deltas percentuais do tick anterior — alimenta L10_Correlation. */
  private previousTickDeltas = new Map<string, PreviousTickDelta>()
  /**
   * Preço de fechamento do TICK anterior por ativo (T3.1) — base do retorno
   * tick-a-tick em previousTickDeltas. Vazio em (re)start: o primeiro tick fica
   * com delta 0 em vez de cair no close diário. NÃO é o close diário do candle.
   */
  private previousTickPrices = new Map<string, number>()
  /** Sessão do tick anterior — detecta transições para resetar âncora do CB. */
  private previousSessionType: SessionType | null = null
  /** Atribuições acumuladas entre candles persistidos por ativo. */
  private pendingAttributions = new Map<string, AnyPriceAttribution[]>()
  /** Ajustes manuais de preço (ADJUST_PRICE) aguardando a próxima atribuição do ativo. */
  private pendingAdminAdjustments = new Map<string, AdminPriceAdjustment[]>()
  /** Timers de retomada do circuit breaker por assetId — cancelados no stop(). */
  private circuitBreakerTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(redis: Redis) {
    this.redis = redis
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
    this.prisma = new PrismaClient({ adapter })
    this.calculator = new PriceCalculator(redis)  // Passa Redis para persistência dos estados de camada
    this.layerRuntimeConfig = new MotorLayerRuntimeConfigService(redis)
    this.healthService = MotorHealthService.getInstance(redis)
    this.orderExecutor = new OrderExecutor(this.prisma, redis)
    this.orderMatcher = new OrderMatcher(this.prisma, redis)
    this.orderFlowSnapshotService = new OrderFlowSnapshotService(this.prisma)
    this.scheduledOrderRunner = new ScheduledOrderRunner(this.prisma, redis, sessionManager)
    this.marginCallChecker = new MarginCallChecker(this.prisma, redis)
    this.leverageInterestRunner = new LeverageInterestRunner(this.prisma, redis)
  }

  async start(): Promise<void> {
    const preflight = await this.runAttributionPreflight()
    if (!preflight.ok && process.env.ATTRIBUTION_STRICT_MODE === 'true') {
      throw new Error(`[engine] ATTRIBUTION_STRICT_MODE bloqueado: ${preflight.failures.join('; ')}`)
    }
    if (!preflight.ok) {
      logger.warn(`[engine] Preflight de atribuicao degradado: ${preflight.failures.join('; ')}`)
    }
    // Limpa apenas halts de CB expirados (ou sem haltedUntil = dados legados).
    // Halts administrativos (FORCE_CIRCUIT_BREAKER, etc.) são preservados: o operador
    // os criou explicitamente e a intenção é que sobrevivam ao restart.
    // loadAssets() reconcilia o estado em memória a partir do DB.
    const now = new Date()
    const cleared = await this.prisma.asset.updateMany({
      where: {
        isHalted: true,
        haltReason: 'CIRCUIT_BREAKER',
        OR: [
          { haltedUntil: null },          // legado: CB sem timestamp de expiração
          { haltedUntil: { lte: now } },  // CB expirado
        ],
      },
      data: { isHalted: false, haltReason: null, haltedUntil: null },
    })
    if (cleared.count > 0) {
      logger.warn(`[engine] Startup: ${cleared.count} halts de CB expirados/legados limpos do DB`)
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
    for (const timer of this.circuitBreakerTimers.values()) {
      clearTimeout(timer)
    }
    this.circuitBreakerTimers.clear()
    // T3.1 — zera a base de retorno tick-a-tick: após (re)start o primeiro tick
    // recomeça com delta 0, sem herdar o preço de antes do restart nem o close diário.
    this.previousTickPrices.clear()
    this.previousTickDeltas.clear()
    agentOrchestrator.dispose()
    if (disconnectPrisma) {
      await this.prisma.$disconnect()
    }
    logger.info('[engine] Engine encerrado.')
  }

  /**
   * Agenda a retomada de um halt de circuit breaker.
   * Cancela timer anterior do mesmo ativo (idempotente) e registra o novo no Map.
   * Usa sessionManager.getCurrentSession() no momento do disparo — mais correto
   * do que capturar a sessão em runTick() (pode ter mudado após 300s).
   */
  private scheduleCircuitBreakerResume(assetId: string, state: AssetState, delayMs: number): void {
    const existingTimer = this.circuitBreakerTimers.get(assetId)
    if (existingTimer) clearTimeout(existingTimer)

    const cbTimer = setTimeout(() => {
      this.circuitBreakerTimers.delete(assetId)
      state.isPaused = false
      state.haltReason = null
      state.haltResumeAt = null
      // T4.2: NÃO re-ancorar closePrice na retomada. A âncora do dia é preservada
      // da pré-halt. O L9/L10 travam o movimento que excederia a banda, então na
      // retomada currentPrice está logo abaixo de 8% da âncora e o CB não
      // re-dispara. Re-ancorar em currentPrice criava uma catraca: cada halt abria
      // uma banda de 8% nova a partir do preço de retomada, escalando o preço em
      // escada (sintoma documentado: queda em escada até o floor R$1). A re-âncora
      // legítima ocorre apenas na abertura do dia (transição de sessão PRE_OPENING).
      const sessionType = sessionManager.getCurrentSession()
      logger.info(`[engine] ${state.ticker} retomado após circuit breaker (closePrice=${state.closePrice.toFixed(4)}, currentPrice=${state.currentPrice.toFixed(4)})`)
      this.persistHaltState(assetId, false, null, null).catch(console.error)
      const resumeTick = buildHaltTick(state, sessionType, null, null)
      resumeTick.isHalted = false
      this.redis.publish(REDIS_CHANNELS.MARKET_TICK, serializeTick([resumeTick])).catch(console.error)
    }, delayMs)

    this.circuitBreakerTimers.set(assetId, cbTimer)
  }

  // ─── fairValues canônicos (Preço IPO) ───────────────────────────────────────
  // Fonte da verdade: Tabela de Precificação IPO 2026 (doc Convocados 2025),
  // espelhada em footstock-next/src/lib/constants/ipo-pricing-2026.ts.
  // Usados como fallback de recuperação quando o DB tem valores corrompidos.
  // MANTER EM SINCRONIA com ipo-pricing-2026.ts ao recalibrar.
  private static readonly CANONICAL_FAIR_VALUES: Record<string, number> = {
    // Série A
    URU3: 40.00, POR3: 36.76, TIM3: 33.60, TRI3: 32.21, GUE3: 28.60,
    GAL3: 26.01, REG3: 23.14, COL3: 22.75, TOR3: 20.29, FUR3: 18.65,
    IMO3: 17.18, PEI3: 16.35, CRZ3: 15.30, RAP3: 13.95, BMP3: 12.22,
    LEA3: 11.28, COX3: 10.45, LEM3: 9.47, CON3: 8.07, RMO3: 8.00,
    // Série B
    LEP3: 12.00, VOZ3: 10.56, LEI3: 8.80, COE3: 8.00, IND3: 8.32,
    CBA3: 11.15, GAP3: 5.78, TIG3: 8.98, PER3: 4.51, DRA3: 7.19,
    LDI3: 7.00, PAN3: 4.79, TIV3: 5.83, TIS3: 5.40, FAS3: 4.33,
    MAC3: 3.75, NAF3: 3.75, ABT3: 3.00, TUB3: 3.22, CAV3: 3.03,
  }

  private async loadAssets(): Promise<void> {
    const loadTime = Date.now()
    const assets = await this.prisma.asset.findMany({ where: { isActive: true } })

    // Assets que precisam de update no DB (fairValue corrompido ou preço no floor)
    const recoveryUpdates: Array<{ id: string; ticker: string; price: number; fv: number }> = []

    for (const asset of assets) {
      // Warm start: a âncora do CB (closePrice) adota o close persistido do dia
      // (ver resolveWarmStartClosePrice abaixo), preservando a banda real entre
      // reinícios. L9/L10 comparam currentPrice vs closePrice.
      const rawPrice = Number(asset.currentPrice)

      // ── Auto-recovery ────────────────────────────────────────────────────
      // Se o DB tem fairValue corrompido (ex: antigo reset-prices setou valor
      // errado) ou preço no floor (R$1), usa o valor canônico do seed.
      // Condições de recovery:
      //   A) fairValue no DB < 50% do canônico (corrompido pelo reset-prices bugado)
      //   B) currentPrice <= 1.5 (no floor) e canônico existe
      //   C) currentPrice > canônico * 5 (inflado por CB loop ascendente)
      const canonicalFV = MarketEngine.CANONICAL_FAIR_VALUES[asset.ticker]
      const dbFairValue  = Number(asset.fairValue ?? 0)
      const dbPrice      = rawPrice

      let recoveryPrice: number | null = null
      if (canonicalFV) {
        const fvCorrupted  = dbFairValue > 0 && dbFairValue < canonicalFV * 0.5
        const atFloor      = dbPrice <= NUDGE_MIN_PRICE * 1.5
        const inflated     = dbPrice > canonicalFV * 4
        if (fvCorrupted || atFloor || inflated) {
          recoveryPrice = canonicalFV
          logger.warn(
            `[engine] AUTO-RECOVERY ${asset.ticker}: price ${dbPrice.toFixed(2)}→${canonicalFV} ` +
            `fv ${dbFairValue.toFixed(2)}→${canonicalFV} ` +
            `(fvCorrupted=${fvCorrupted} atFloor=${atFloor} inflated=${inflated})`
          )
          recoveryUpdates.push({ id: asset.id, ticker: asset.ticker, price: canonicalFV, fv: canonicalFV })
        }
      }

      const currentPriceNum = recoveryPrice ?? rawPrice

      // Reconciliar halt: CB com haltedUntil futuro reatualiza memória e agenda timer;
      // halt admin (sem haltedUntil) persiste como isPaused=true sem retomada automática.
      const haltedUntilMs = asset.haltedUntil?.getTime() ?? null
      const isCbHaltActive =
        asset.isHalted &&
        asset.haltReason === 'CIRCUIT_BREAKER' &&
        haltedUntilMs !== null &&
        haltedUntilMs > loadTime
      const isAdminHalt = asset.isHalted && asset.haltReason !== 'CIRCUIT_BREAKER'
      // Assets em recovery são sempre deshalted — o halt foi causado pelo bug
      const isPaused = recoveryPrice === null && (isCbHaltActive || isAdminHalt)

      const state: AssetState = {
        id: asset.id,
        ticker: asset.ticker,
        cluster: asset.cluster as AssetState['cluster'],
        state: CLUB_STATE_BY_TICKER[asset.ticker] ?? '',
        currentPrice: currentPriceNum,
        openPrice: currentPriceNum,
        highPrice: currentPriceNum,
        lowPrice: currentPriceNum,
        // T4.2: warm start NÃO re-ancora a âncora do CB em currentPrice — adota o
        // close persistido do dia (resolveWarmStartClosePrice). Re-ancorar a cada
        // restart alargava a banda de 8% e alimentava a escada de preço.
        closePrice: resolveWarmStartClosePrice(Number(asset.closePrice), currentPriceNum, recoveryPrice),
        fairValue: recoveryPrice ?? Number(asset.fairValue ?? asset.currentPrice),
        volume: 0,
        variance: 0.00001,  // Variância GARCH inicial (reduzida 10x: evita ruído GARCH soterrar L2_Anchor)
        pendingBuyVolume: 0,
        pendingSellVolume: 0,
        isPaused,
        haltReason: isPaused ? (asset.haltReason ?? null) : null,
        haltResumeAt: isCbHaltActive ? haltedUntilMs : null,
        newsImpact: 0,
        newsImpactTicks: 0,
        activeNewsImpacts: [],
        ofiState: 0,               // L4_OFI: OFI_t inicial (sem acumulação)
        dailyVolAccum: 0,          // L9_DailyVolTarget: acumulador diário de variação
        dailySigmaMultiplier: 1.0, // L9_DailyVolTarget: multiplicador sigma (1.0 = normal)
        volatilityMultiplier: 1.0, // SessionManager: multiplicador por sessão (setado a cada tick)
      }

      this.assetStates.set(asset.id, state)
      this.orderBooks.set(asset.id, new OrderBook())

      // CB ainda ativo: reagendar retomada pelo tempo restante
      if (isCbHaltActive && haltedUntilMs) {
        const remainingMs = Math.max(0, haltedUntilMs - Date.now())
        this.scheduleCircuitBreakerResume(asset.id, state, remainingMs)
        logger.warn(`[engine] ${asset.ticker} halt CB ativo — retomada reagendada em ${Math.ceil(remainingMs / 1000)}s`)
      }

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

    // Persistir recoveries no DB (fire-and-forget com log de erros)
    if (recoveryUpdates.length > 0) {
      logger.warn(`[engine] Persistindo ${recoveryUpdates.length} auto-recoveries no DB...`)
      Promise.allSettled(
        recoveryUpdates.map(r =>
          this.prisma.asset.update({
            where: { id: r.id },
            data: {
              currentPrice: r.price,
              openPrice:    r.price,
              closePrice:   r.price,
              fairValue:    r.fv,
              isHalted:     false,
              haltReason:   null,
              haltedUntil:  null,
            },
          }).then(() => logger.info(`[engine] Recovery DB ok: ${r.ticker} → ${r.price}`))
           .catch((err: unknown) => logger.error(`[engine] Recovery DB fail: ${r.ticker}`, err))
        )
      )
    }

    // Hydratar estados críticos do Redis (variance GARCH, OFI state, daily vol)
    // Executado após todos os ativos terem sido carregados com defaults seguros
    const hydratePromises = [...this.assetStates.values()].map(state =>
      this.calculator.hydrateFromRedis(state)
    )
    await Promise.allSettled(hydratePromises)

    logger.info(`[engine] AgentOrchestrator inicializado para ${this.assetStates.size} ativos`)
  }

  private async runAttributionPreflight(): Promise<{ ok: boolean; failures: string[] }> {
    const preflight = await new AttributionPreflightService(this.prisma).run()
    for (const detail of preflight.details) {
      if (detail.code === 'ATTRIBUTION_SCHEMA_DRIFT') {
        logger.warn(`[engine] hipotese: drift de schema Prisma detectado antes do modo estrito: ${detail.message}`)
      }
    }
    return { ok: preflight.ok, failures: preflight.failures }
  }

  private async runTick(): Promise<void> {
    const tickStartedAt = new Date()
    const tickStartedMs = Date.now()
    this.tickCount++
    const sessionType = sessionManager.getCurrentSession()
    const runtimeConfig = await this.layerRuntimeConfig.getConfig()
    const volatilityMultiplier =
      runtimeConfig.sessionMultipliers[sessionType] ?? sessionManager.getVolatilityMultiplier(sessionType)
    const ticks: MotorTick[] = []
    const orderFlowSnapshots = await this.orderFlowSnapshotService.capture([...this.assetStates.keys()], tickStartedAt)

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
          // BUG FIX: openPrice nunca era resetado, fazendo priceChange24h acumular
          // negativamente desde o startup do motor. Depois de algumas horas, o
          // MomentumAgent (vende quando change < -2%) e o PanicSellerAgent (vende
          // quando change < -10%) disparavam permanentemente, sobrepondo o pull do
          // L2_FundamentalAnchor (+0.3%/tick) com pressão vendedora de -2%/tick.
          // Combinado com o ciclo de circuit breaker (re-âncora closePrice para baixo
          // a cada 5 min), os preços desciam em escada até bater no floor R$1.
          // Reseta openPrice junto com closePrice a cada sessão PRE_OPENING, tornando
          // priceChange24h relativo à abertura do dia corrente — não ao startup.
          s.openPrice = s.currentPrice
        }
        this.calculator.resetDailyVolCap()  // compatibilidade retroativa
        logger.info('[engine] DailyVolTarget, volume e openPrice resetados para nova sessão PRE_OPENING')
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
        const params = runtimeConfig.clusterParams[state.cluster] ?? getClusterParams(state.cluster)
        const orderBook = this.orderBooks.get(assetId)!
        const previousPrice = state.currentPrice
        const tickId = `${assetId}:${this.tickCount}:${tickStartedAt.getTime()}`
        const orderFlowSnapshot = orderFlowSnapshots.get(assetId)

        // Atualizar volumes pendentes no estado
        state.pendingBuyVolume = orderFlowSnapshot
          ? orderFlowSnapshot.openBuyQty + orderFlowSnapshot.marketBuyQty
          : orderBook.getBuyVolume()
        state.pendingSellVolume = orderFlowSnapshot
          ? orderFlowSnapshot.openSellQty + orderFlowSnapshot.marketSellQty
          : orderBook.getSellVolume()

        // Gerar ruído gaussiano (Box-Muller)
        const noise = this.gaussianNoise()

        // Propagar multiplicador de sessão para o estado (L1/L3 leem de state)
        state.volatilityMultiplier = volatilityMultiplier

        // T1.4: os agentes são computados ANTES do PriceCalculator e o impacto entra
        // como delta DENTRO do pipeline (antes de L8/correlação/freio/L10). O contexto
        // do agente usa o preço de início do tick (previousPrice = state.currentPrice),
        // não o preço pós-camadas — o agente reage ao mercado estabelecido e seu impacto
        // flui pelo motor, em vez de ser aplicado por fora escapando do cap e do CB.
        //
        // Spread bid-ask do BOOK REAL na unidade FRACIONAL (ask-bid)/mid — a mesma
        // de TARGET_SPREAD do MarketMaker. Fallback: params.spread (spread base do
        // cluster, já fracional) quando o book está vazio/unilateral. ANTES (Item
        // T1.1 do loop 06-17): ctx.spread era newPrice*0.002, um valor ABSOLUTO
        // comparado contra TARGET_SPREAD=0.001 (fração) — o mismatch de unidade
        // fazia o MarketMaker disparar em todo tick. A fórmula de impacto NÃO muda.
        // Logica pura e testada em isolamento: ver agent-quotes.ts + __tests__.
        const { bid: agentBid, ask: agentAsk, spread: fractionalSpread } = deriveAgentQuotes(
          orderBook.getBestBid(),
          orderBook.getBestAsk(),
          previousPrice,
          params.spread,
        )

        // Aplicar impacto dos agentes de mercado (module-8/TASK-3)
        const agentCtx: MarketContext = {
          ticker: state.ticker,
          currentPrice: previousPrice,
          fairValue: state.fairValue, // Fair value da coluna fair_value (âncora OU)
          priceChange24h: state.openPrice > 0 ? (previousPrice - state.openPrice) / state.openPrice : 0,
          volume24h: state.volume,
          baseVolume: params.baseVolume, // T2.2: profundidade fixa do cluster (desacopla quantity de state.volume)
          bid: agentBid,
          ask: agentAsk,
          spread: fractionalSpread,
          session: sessionType,
          volatilityMultiplier,
        }
        const { impact: agentImpact, syntheticVolume, marketMakerDecision } = agentOrchestrator.tickAsset(assetId, agentCtx)

        // Calcular novo preço via 10 camadas (L1-L10) + Correlação, com o impacto do
        // agente injetado como delta antes de L8/correlação/freio/L10 (T1.4).
        const calcResult = this.calculator.calculate(state, params, noise, this.previousTickDeltas, agentImpact)
        const { newPrice, enginePrice, halted } = calcResult

        // Armazenar resultado das camadas para o endpoint de debug (admin only)
        this.lastLayerResults.set(state.ticker, calcResult)

        if (halted) {
          // Circuit breaker: notificar, pausar e persistir halt no DB. O agente já foi
          // ticado neste ciclo (seu impacto pode ter contribuído para o halt — é o
          // comportamento desejado: agente sujeito ao CB); o volume sintético NÃO é
          // acumulado em tick de halt.
          const variationPct = state.closePrice > 0
            ? Math.abs((state.currentPrice - state.closePrice) / state.closePrice) * 100
            : 0
          const haltDurationMs = runtimeConfig.haltDurationMs || PAUSE_RESUME_MS
          const resumeAt = Date.now() + haltDurationMs
          state.isPaused = true
          state.haltReason = 'CIRCUIT_BREAKER'
          state.haltResumeAt = resumeAt
          this.notifyCircuitBreaker(
            assetId,
            state.ticker,
            variationPct,
            resumeAt,
            sessionType,
            Math.round(haltDurationMs / 1000),
          ).catch(console.error)
          this.scheduleCircuitBreakerResume(assetId, state, haltDurationMs)
          continue
        }

        // Preço publicado (canônico): inclui o impacto do agente, já capado por L8 e
        // verificado pelo CB dentro do calculate. NÃO há mais o caminho alternativo
        // finalPrice = newPrice*(1+agentImpact) — o floor já foi reaplicado no calculate.
        const finalPrice = newPrice

        // T1.4 default-safe: ordens reais casam ao preço PRÉ-agente por padrão
        // (MOTOR_REAL_ORDER_MATCH_PRICE=pre-agent). O toggle 'post-agent' casa no preço
        // publicado (com agente). A decisão pre/pos é uma flag operacional, não
        // reimplementação. Ver env.ts e .env.example.
        const matchPrice = REAL_ORDER_MATCH_PRICE === 'post-agent' ? finalPrice : enginePrice
        const tickEndedAt = new Date()
        // Ajustes admin aplicados desde a última atribuição deste ativo: o salto
        // old→new ocorreu entre ticks, então a atribuição parte do preço
        // PRÉ-ajuste para que o delta explicado bata com o candle observado.
        const adminAdjustments = this.pendingAdminAdjustments.get(assetId)
        if (adminAdjustments) this.pendingAdminAdjustments.delete(assetId)
        const attributionPreviousPrice = adminAdjustments?.[0]?.previousPrice ?? previousPrice
        const inputSnapshot: TickInputSnapshot = Object.freeze({
          tickId,
          assetId,
          ticker: state.ticker,
          startedAt: tickStartedAt.toISOString(),
          previousPrice,
          pendingBuyVolume: state.pendingBuyVolume,
          pendingSellVolume: state.pendingSellVolume,
          orderFlowSnapshot,
          activeNewsImpacts: (state.activeNewsImpacts ?? []).map((news) => ({ ...news })),
          sessionType,
        })
        const attribution = buildPriceAttributionV2({
          previousPrice: attributionPreviousPrice,
          // enginePrice = preço PRÉ-agente (T1.4); a atribuição deriva o delta do agente
          // como finalPrice - enginePrice. Antes era newPrice (que já incluía o agente
          // por fora), o que zerava a contribuição atribuída ao agente.
          enginePrice,
          finalPrice,
          agentImpact,
          syntheticVolume,
          pendingBuyVolume: state.pendingBuyVolume,
          pendingSellVolume: state.pendingSellVolume,
          sessionType,
          layerResults: calcResult.layerResults,
          generatedAt: tickEndedAt,
          tickId,
          tickStartedAt,
          tickEndedAt,
          tickCount: 1,
          inputSnapshot,
          orderFlowSnapshot,
          activeNewsImpacts: inputSnapshot.activeNewsImpacts,
          adminAdjustments,
        })
        motorMetrics.observe('price_attribution_payload_bytes', attribution.payloadBytes)
        const pendingAttributions = this.pendingAttributions.get(assetId) ?? []
        pendingAttributions.push(attribution)
        this.pendingAttributions.set(assetId, pendingAttributions)

        // Acumular volume sintético dos agentes (sem isso, volume 24h fica zero).
        // Clamp em MAX_DAILY_VOLUME garante que mesmo se um agente novo escapar
        // do cap interno, nao ha overflow do BigInt persistido em assets.volume.
        state.volume = Math.min(state.volume + syntheticVolume, MAX_DAILY_VOLUME)

        // Match de ordens pendentes ao preço de execução escolhido pelo toggle T1.4
        // (default pre-agente: matchPrice == enginePrice; post-agente: == finalPrice).
        const fills = orderBook.matchOrders(matchPrice)
        const executedVolume = sumExecutedVolume(fills)
        if (fills.length > 0) {
          this.processFills(fills, state).catch(console.error)
        }

        // Atualizar estado em memória
        state.currentPrice = finalPrice
        state.highPrice = Math.max(state.highPrice, finalPrice)
        state.lowPrice = Math.min(state.lowPrice, finalPrice)
        // T2.1 — volume 24h acumula APENAS fluxo EXECUTADO (fills casados neste tick).
        // O book pendente (pendingBuy+pendingSell) é "book pressure", métrica SEPARADA
        // exposta em state.bookPressure; somá-lo a state.volume inflava o 24h com ordens
        // que talvez nunca executem. L5 (KyleLambda) ainda lê os campos pending direto.
        state.bookPressure = state.pendingBuyVolume + state.pendingSellVolume
        state.volume = Math.min(state.volume + executedVolume, MAX_DAILY_VOLUME)

        const tick = buildMotorTick(state, finalPrice, sessionType)
        ticks.push(tick)

        // TODO:REMOVE debug instrumentation (loop 06-17-motor-footstock-correcoes-variacoes / T0.1)
        // No-op quando MOTOR_TICK_DEBUG está OFF. Apenas LÊ campos já computados.
        maybeEmitTickDebug({
          timestamp: tick.timestamp,
          ticker: state.ticker,
          agentImpact,
          syntheticVolume,
          stateVolume: state.volume,
          pendingBuyVolume: state.pendingBuyVolume,
          pendingSellVolume: state.pendingSellVolume,
          marketMakerDecision,
          ofiState: state.ofiState ?? 0,
          layerResults: calcResult.layerResults,
        })

        /** A_TOP persiste sempre (FDD canônico). Demais tiers persistem a cada PERSIST_HISTORY_EVERY ticks. */
        const shouldPersist =
          state.cluster === 'A_TOP' ||
          this.tickCount % PERSIST_HISTORY_EVERY === 0

        if (shouldPersist) {
          const persistedAttribution = mergePriceAttributions(
            this.pendingAttributions.get(assetId) ?? [attribution],
            new Date(tick.timestamp),
          )
          this.pendingAttributions.delete(assetId)
          this.persistPriceHistory(tick, persistedAttribution).catch((err) =>
            logger.error(`[engine] persistPriceHistory fail tickId=${tickId} assetId=${assetId}:`, err)
          )
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

    // Atualizar mapa de deltas para L10_Correlation no próximo tick.
    // T3.1 — deltaPercent é o retorno TICK-A-TICK (currentPrice vs preço do tick
    // anterior do mesmo ativo), não o retorno vs close diário. Sem preço do tick
    // anterior (primeiro tick após restart) o delta é 0; nunca substituímos pelo
    // close diário silenciosamente.
    this.previousTickDeltas.clear()
    for (const [assetId, state] of this.assetStates) {
      if (state.isPaused) continue
      const tick = ticks.find(t => t.assetId === assetId)
      if (tick && state.currentPrice > 0) {
        const previousPrice = this.previousTickPrices.get(assetId)
        this.previousTickDeltas.set(assetId, {
          deltaPercent: computeTickReturnDelta(state.currentPrice, previousPrice),
          cluster: state.cluster,
          state: state.state,
        })
        // Grava o preço deste tick como base do retorno do PRÓXIMO tick.
        this.previousTickPrices.set(assetId, state.currentPrice)
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

    // Juros de alavancagem: DESABILITADO no motor desde o refactor 2026-06-02.
    // Cobrador único = Next cron /api/cron/leverage-interest (idempotente por
    // (positionId, dia BRT) via LeverageService.accrueInterest). Manter ambos
    // cobrando causava double-charge (R8). LeverageInterestRunner permanece no
    // codebase apenas para referência/rollback; NÃO invocar aqui.
    void this.leverageInterestRunner

    // Sincronizar preços no banco a cada 10 ticks
    if (this.tickCount % 10 === 0) {
      this.updateAssetPrices().catch(console.error)
    }
    motorMetrics.observe('motor_tick_duration_ms', Date.now() - tickStartedMs)
  }

  /** Box-Muller transform para gerar N(0,1) */
  private gaussianNoise(): number {
    const u1 = Math.random()
    const u2 = Math.random()
    return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2)
  }

  private async persistPriceHistory(tick: MotorTick, attribution: AnyPriceAttribution | null): Promise<void> {
    try {
      if (attribution) {
        const parsed = parsePriceAttribution(attribution)
        if (!parsed.ok) {
          if (process.env.ATTRIBUTION_STRICT_MODE === 'true') {
            throw new Error(`ATTRIBUTION_SERIALIZATION_INVALID:${parsed.reason}`)
          }
          motorMetrics.inc('motor_price_attribution_missing_total')
          motorMetrics.inc('motor_price_attribution_missing_parse_total')
          attribution = {
            version: 2,
            tickId: `degraded:${tick.assetId}:${tick.timestamp}`,
            tickCount: 1,
            tickStartedAt: new Date(tick.timestamp).toISOString(),
            tickEndedAt: new Date(tick.timestamp).toISOString(),
            primaryEventId: null,
            primaryCause: 'rastro causal degradado',
            primaryLayer: null,
            confidence: 'baixa',
            explanation: 'O candle foi persistido, mas a atribuicao calculada nao passou no parser runtime.',
            primaryExplanation: 'Atribuicao degradada por falha de serializacao.',
            evidenceSentence: 'Nenhuma evidencia direta foi aceita pelo parser.',
            caveatSentence: 'Movimento deve ser tratado como degradado ate investigacao tecnica.',
            previousPrice: tick.close,
            enginePrice: tick.price,
            finalPrice: tick.price,
            engineDelta: 0,
            agentImpactPct: 0,
            agentDelta: 0,
            syntheticVolume: 0,
            pendingBuyVolume: 0,
            pendingSellVolume: 0,
            orderImbalance: 0,
            sessionType: tick.sessionType,
            layerContributions: [],
            causalEvents: [],
            appliedControls: [],
            qualityFlags: [parsed.qualityFlag],
            payloadBytes: 0,
            generatedAt: new Date(tick.timestamp).toISOString(),
          }
        }
      }
      await this.createPriceHistory(tick, attribution)
    } catch (err) {
      if (attribution && String(err).includes('attribution')) {
        motorMetrics.inc('motor_price_attribution_missing_total')
        motorMetrics.inc('motor_price_attribution_missing_column_total')
        if (process.env.ATTRIBUTION_STRICT_MODE === 'true') {
          throw new Error('[engine] price_history.attribution indisponivel com ATTRIBUTION_STRICT_MODE=true')
        }
        logger.warn('[engine] price_history.attribution indisponivel; candle sera persistido sem coluna e a API marcara ATTRIBUTION_COLUMN_MISSING.')
        await this.createPriceHistory(tick, null)
        return
      }
      throw err
    }
  }

  private async createPriceHistory(tick: MotorTick, attribution: AnyPriceAttribution | null): Promise<void> {
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
        source: 'MOTOR',
        ...(attribution ? { attribution: attribution as any } : {}),
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
          // Persistir openPrice para manter consistência com o cálculo de %
          // exibido no /mercado (usa DB openPrice). Sem isso, restore-from-seed
          // ou outras operações admin que alteram DB.openPrice criam divergência
          // entre o % da página e o % do SSE do motor.
          openPrice: state.openPrice,
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
    haltDurationSeconds: number,
  ): Promise<void> {
    const haltReason = 'CIRCUIT_BREAKER'

    // 1. Persistir halt no banco com timestamp de expiração — sincroniza OrderService e
    //    permite startup cleanup baseado em expiração (sem depender de processo vivo).
    await this.persistHaltState(assetId, true, haltReason, new Date(resumeAt))

    // 2. Publicar evento circuit-breaker no Redis (consumido por outros serviços)
    const notification = {
      type: 'CIRCUIT_BREAKER',
      assetId,
      ticker,
      timestamp: Date.now(),
      haltDurationSeconds,
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

  /** Persiste isHalted, haltReason e haltedUntil no banco de dados. */
  private async persistHaltState(
    assetId: string,
    isHalted: boolean,
    haltReason: string | null,
    haltedUntil: Date | null = null
  ): Promise<void> {
    try {
      await this.prisma.asset.update({
        where: { id: assetId },
        data: { isHalted, haltReason, haltedUntil },
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

  injectNewsImpact(assetId: string, magnitude: number, durationTicks: number, context: Partial<ActiveNewsImpact> = {}): void {
    const state = this.assetStates.get(assetId)
    if (!state) return

    // Sanitização defensiva: clampa magnitude em [-1, 1] e rejeita NaN/Infinity.
    // L10 usa `newsImpact !== 0 && newsImpactTicks > 0` como flag de "notícia ativa"
    // para relaxar o circuit breaker — valores absurdos não podem entrar.
    if (!Number.isFinite(magnitude) || !Number.isFinite(durationTicks)) return
    const clampedMagnitude = Math.max(-1, Math.min(1, magnitude))
    const clampedTicks = Math.max(0, Math.min(200, Math.floor(durationTicks || NEWS_IMPACT_DURATION_TICKS)))
    const newsId = context.newsId
    const qualityFlags = [...new Set([...(context.qualityFlags ?? []), ...(newsId ? [] : ['NEWS_WITHOUT_ID' as const])])]

    const currentNewsImpacts = state.activeNewsImpacts ?? []
    if (newsId && currentNewsImpacts.some((news) => news.newsId === newsId)) {
      motorMetrics.inc('news_injection_duplicate_total')
      logger.info(`[engine] INJECT_NEWS duplicado ignorado assetId=${assetId} newsId=${newsId}`)
      return
    }

    state.newsImpact = clampedMagnitude
    state.newsImpactTicks = clampedTicks
    state.activeNewsImpacts = [
      {
        newsId,
        title: context.title?.slice(0, 160),
        source: context.source?.slice(0, 80),
        impactCategory: context.impactCategory,
        sentiment: context.sentiment,
        publishedAt: context.publishedAt,
        correlationId: context.correlationId ?? newsId,
        magnitude: clampedMagnitude,
        durationTicks: clampedTicks,
        ticksRemaining: clampedTicks,
        qualityFlags,
      },
      ...currentNewsImpacts,
    ].slice(0, 5)

    if (state.activeNewsImpacts.length >= 5) {
      const last = state.activeNewsImpacts[state.activeNewsImpacts.length - 1]
      last.qualityFlags = [...new Set([...last.qualityFlags, 'NEWS_QUEUE_AGGREGATED' as const])]
    }
  }

  /** Resolve ticker (ex: 'REG3') para o assetId (UUID) interno do engine. */
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

  adjustPrice(assetId: string, newPrice: number, context?: { adminId?: string; reason?: string }): void {
    const state = this.assetStates.get(assetId)
    if (!state) return
    // O salto old→new acontece entre ticks e sumiria da atribuição (o próximo
    // tick já parte de newPrice). Registrar como ajuste pendente garante que a
    // análise de valor veja ADMIN_ACTION como causa direta, com o motivo real.
    const pending = this.pendingAdminAdjustments.get(assetId) ?? []
    pending.push({
      previousPrice: state.currentPrice,
      newPrice,
      occurredAt: new Date().toISOString(),
      adminId: context?.adminId,
      reason: context?.reason,
      actionType: 'ADJUST_PRICE',
    })
    this.pendingAdminAdjustments.set(assetId, pending)
    state.currentPrice = newPrice
    state.closePrice = newPrice  // Reset âncora para evitar circuit breaker imediato
  }

  haltAll(): number {
    let count = 0
    for (const state of this.assetStates.values()) {
      if (!state.isPaused) {
        state.isPaused = true
        state.haltReason = 'HALT_ALL'
        state.haltResumeAt = null
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
        state.haltReason = null
        state.haltResumeAt = null
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
  async getLayersDebug(ticker?: string): Promise<Record<string, unknown>> {
    const runtimeConfig = await this.layerRuntimeConfig.getConfig()
    if (ticker) {
      const result = this.lastLayerResults.get(ticker)
      const state  = [...this.assetStates.values()].find(s => s.ticker === ticker)
      if (!result || !state) return {}
      const params = runtimeConfig.clusterParams[state.cluster] ?? getClusterParams(state.cluster)
      return {
        ticker,
        currentPrice:     state.currentPrice,
        cluster:          state.cluster,
        runtimeConfig: {
          source: runtimeConfig.source,
          updatedAt: runtimeConfig.updatedAt,
          updatedBy: runtimeConfig.updatedBy,
          params,
        },
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
      const params = state
        ? (runtimeConfig.clusterParams[state.cluster] ?? getClusterParams(state.cluster))
        : null
      out[t] = {
        ticker:          t,
        currentPrice:    state?.currentPrice,
        cluster:         state?.cluster,
        runtimeConfig: {
          source: runtimeConfig.source,
          updatedAt: runtimeConfig.updatedAt,
          updatedBy: runtimeConfig.updatedBy,
          params,
        },
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
