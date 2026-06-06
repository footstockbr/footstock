// ============================================================================
// FootStock — GET /api/v1/admin/value-analysis
// Relatorio administrativo de variacao de valor por ativo.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import { MOTOR_LAYERS_DEFAULTS } from '@/lib/constants/motor-layers'
import type { ClusterKey, MotorLayersConfig } from '@/lib/types/admin'
import {
  CAUSE_LABELS_FOR_API,
  type CauseType,
  type DirectEvidence,
  type CorrelatedEvidence,
  type EvidenceGrade,
  type QualityFlag,
  type NewsEvidence,
  type AdminActionEvidence,
  type OrderFlowEvidence,
  type MovementContext,
  type AnyEngineAttribution,
  type MovementMagnitude,
  average,
  buildCause,
  buildDiagnosticNotes,
  buildEngineAttributionDiagnosticNotes,
  classifyEvidence,
  causePriority,
  confidenceScore,
  eventTime,
  extractActionReason,
  inWindow,
  parseEngineAttribution,
  magnitudeFromPct,
  pct,
  round2,
  stdDev,
} from '@/lib/admin/value-analysis'

const DEFAULT_DAYS = 7
const MAX_DAYS = 30
const MAX_PRICE_POINTS = 240
const NEWS_LOOKBACK_MS = 2 * 60 * 60 * 1000
const EVENT_GRACE_MS = 30 * 60 * 1000
const MOTOR_LAYERS_CONFIG_REDIS_KEY = 'motor:layers:config:v1'

type MovementRecord = {
  id: string
  from: string
  to: string
  previousPrice: number
  newPrice: number
  open: number
  high: number
  low: number
  absoluteChange: number
  percentageChange: number
  intraperiodRangePct: number
  direction: 'up' | 'down'
  magnitude: MovementMagnitude
  volume: number
  volumeDelta: number
  sessionType: string
  source: string
  causeType: CauseType
  causeLabel: string
  confidence: 'alta' | 'media' | 'baixa'
  confidenceScore: number
  explanation: string
  diagnosticNotes: string[]
  orderFlow: OrderFlowEvidence
  engineAttribution: AnyEngineAttribution | null
  evidenceGrade: EvidenceGrade
  qualityFlags: QualityFlag[]
  directEvidence: DirectEvidence[]
  correlatedEvidence: CorrelatedEvidence[]
  degradedReason: string | null
  degradedOwner: string | null
  primaryExplanation: string
  evidenceSentence: string
  caveatSentence: string
  evidenceWindow: {
    startsAt: string
    endsAt: string
    newsLookbackMinutes: number
    adminGraceMinutes: number
  }
  evidence: {
    news: NewsEvidence[]
    adminActions: AdminActionEvidence[]
  }
}

type PriceHistoryPoint = {
  id: string
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume: bigint
  sessionType: string
  source: string
  attribution: unknown | null
}

type OrderFlowRecord = {
  id: string
  side: 'BUY' | 'SELL'
  quantity: number
  price: { toNumber(): number } | null
  executedPrice: { toNumber(): number } | null
  executedAt: Date | null
  updatedAt: Date
  createdAt: Date
}

type ColumnExistsRow = {
  exists: boolean
}

type MotorContext = {
  cluster: ClusterKey
  configSource: 'redis' | 'defaults'
  updatedAt: string | null
  updatedBy: string | null
  effectiveParameters: {
    sigma: number
    theta: number
    spreadBase: number
    garchAlpha: number
    garchBeta: number
    garchOmega: number
    garchVolCap: number
    ofiRho: number
    lambdaScale: number
    supplyAmpCap: number
    pressureSpreadTicks: number
    pressureAbsorptionTicks: number
    pressureSpotCapPct: number
    velocityCapPct: number
    circuitBreakerPct: number
    haltDurationSeconds: number
  }
}

function toNumber(value: { toNumber(): number } | null | undefined): number | null {
  return value ? value.toNumber() : null
}

function parseDateParam(value: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function endOfDateParam(value: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(`${value}T23:59:59.999Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function orderEventTime(order: Pick<OrderFlowRecord, 'executedAt' | 'updatedAt' | 'createdAt'>): Date {
  return order.executedAt ?? order.updatedAt ?? order.createdAt
}

function buildOrderFlowEvidence(orders: OrderFlowRecord[]): OrderFlowEvidence {
  let buyQuantity = 0
  let sellQuantity = 0
  let weightedPriceSum = 0
  let pricedQuantity = 0

  for (const order of orders) {
    if (order.side === 'BUY') buyQuantity += order.quantity
    else sellQuantity += order.quantity

    const executedPrice = toNumber(order.executedPrice) ?? toNumber(order.price)
    if (executedPrice !== null && order.quantity > 0) {
      weightedPriceSum += executedPrice * order.quantity
      pricedQuantity += order.quantity
    }
  }

  return {
    buyQuantity,
    sellQuantity,
    netQuantity: buyQuantity - sellQuantity,
    orderCount: orders.length,
    averageExecutedPrice: pricedQuantity > 0 ? round2(weightedPriceSum / pricedQuantity) : null,
  }
}

function isMotorLayersConfig(value: unknown): value is MotorLayersConfig {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<MotorLayersConfig>
  return !!(
    record.ou?.clusters &&
    record.garch &&
    record.ofi?.clusters &&
    record.pressureQueue &&
    record.velocityCap &&
    record.circuitBreaker &&
    record.sessionManagement?.sessions
  )
}

async function getMotorLayersConfig(): Promise<{ config: MotorLayersConfig; source: 'redis' | 'defaults' }> {
  try {
    const raw = await redis.get(MOTOR_LAYERS_CONFIG_REDIS_KEY)
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw) as unknown
      if (isMotorLayersConfig(parsed)) {
        return { config: parsed, source: 'redis' }
      }
    }
  } catch {
    // Fallback para defaults quando Redis/config esta indisponivel.
  }

  return {
    config: {
      ...MOTOR_LAYERS_DEFAULTS,
      updatedAt: null,
      updatedBy: null,
    },
    source: 'defaults',
  }
}

async function priceHistoryColumnExists(columnName: 'source' | 'attribution'): Promise<boolean> {
  const rows = await prisma.$queryRaw<ColumnExistsRow[]>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'price_history'
        AND column_name = ${columnName}
    ) AS exists
  `

  return rows[0]?.exists === true
}

async function getPriceHistory(params: {
  assetId: string
  start: Date
  end: Date
  hasSourceColumn: boolean
  hasAttributionColumn: boolean
}): Promise<PriceHistoryPoint[]> {
  if (params.hasSourceColumn && params.hasAttributionColumn) {
    return prisma.$queryRaw<PriceHistoryPoint[]>`
      SELECT
        id,
        timestamp,
        open::float8 AS open,
        high::float8 AS high,
        low::float8 AS low,
        close::float8 AS close,
        volume,
        session_type::text AS "sessionType",
        source,
        attribution
      FROM price_history
      WHERE asset_id = ${params.assetId}
        AND timestamp >= ${params.start}
        AND timestamp <= ${params.end}
      ORDER BY timestamp DESC
      LIMIT ${MAX_PRICE_POINTS}
    `
  }

  if (params.hasSourceColumn) {
    return prisma.$queryRaw<PriceHistoryPoint[]>`
      SELECT
        id,
        timestamp,
        open::float8 AS open,
        high::float8 AS high,
        low::float8 AS low,
        close::float8 AS close,
        volume,
        session_type::text AS "sessionType",
        source,
        NULL::jsonb AS attribution
      FROM price_history
      WHERE asset_id = ${params.assetId}
        AND timestamp >= ${params.start}
        AND timestamp <= ${params.end}
      ORDER BY timestamp DESC
      LIMIT ${MAX_PRICE_POINTS}
    `
  }

  if (params.hasAttributionColumn) {
    return prisma.$queryRaw<PriceHistoryPoint[]>`
      SELECT
        id,
        timestamp,
        open::float8 AS open,
        high::float8 AS high,
        low::float8 AS low,
        close::float8 AS close,
        volume,
        session_type::text AS "sessionType",
        'REAL'::text AS source,
        attribution
      FROM price_history
      WHERE asset_id = ${params.assetId}
        AND timestamp >= ${params.start}
        AND timestamp <= ${params.end}
      ORDER BY timestamp DESC
      LIMIT ${MAX_PRICE_POINTS}
    `
  }

  return prisma.$queryRaw<PriceHistoryPoint[]>`
    SELECT
      id,
      timestamp,
      open::float8 AS open,
      high::float8 AS high,
      low::float8 AS low,
      close::float8 AS close,
      volume,
      session_type::text AS "sessionType",
      'REAL'::text AS source,
      NULL::jsonb AS attribution
    FROM price_history
    WHERE asset_id = ${params.assetId}
      AND timestamp >= ${params.start}
      AND timestamp <= ${params.end}
    ORDER BY timestamp DESC
    LIMIT ${MAX_PRICE_POINTS}
  `
}

function buildMotorContext(cluster: ClusterKey, layers: { config: MotorLayersConfig; source: 'redis' | 'defaults' }): MotorContext {
  const config = layers.config
  const ou = config.ou.clusters[cluster]
  const ofi = config.ofi.clusters[cluster]

  return {
    cluster,
    configSource: layers.source,
    updatedAt: config.updatedAt,
    updatedBy: config.updatedBy,
    effectiveParameters: {
      sigma: ou.sigma,
      theta: ou.theta,
      spreadBase: ou.spread_base,
      garchAlpha: config.garch.alpha,
      garchBeta: config.garch.beta,
      garchOmega: config.garch.omega,
      garchVolCap: config.garch.vol_cap,
      ofiRho: ofi.rho,
      lambdaScale: config.kylesLambda.lambda_scale,
      supplyAmpCap: config.supplyScaling.amp_cap,
      pressureSpreadTicks: config.pressureQueue.pressure_spread_ticks,
      pressureAbsorptionTicks: config.pressureQueue.absorption_ticks,
      pressureSpotCapPct: round2(config.pressureQueue.spot_cap * 100),
      velocityCapPct: round2(config.velocityCap.max_per_tick * 100),
      circuitBreakerPct: round2(config.circuitBreaker.halt_trigger * 100),
      haltDurationSeconds: config.circuitBreaker.halt_duration_s,
    },
  }
}

function parseWindow(req: NextRequest): { start: Date; end: Date; requestedDays: number; mode: 'preset' | 'custom' } {
  const startParam = parseDateParam(req.nextUrl.searchParams.get('start'))
  const endParam = endOfDateParam(req.nextUrl.searchParams.get('end'))
  const now = new Date()

  if (startParam && endParam && startParam <= endParam) {
    const maxStart = new Date(endParam.getTime() - MAX_DAYS * 24 * 60 * 60 * 1000)
    const start = startParam < maxStart ? maxStart : startParam
    const requestedDays = Math.max(1, Math.ceil((endParam.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)))
    return { start, end: endParam, requestedDays, mode: 'custom' }
  }

  const parsedDays = Number.parseInt(req.nextUrl.searchParams.get('days') ?? '', 10)
  const days = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.min(parsedDays, MAX_DAYS) : DEFAULT_DAYS
  return {
    start: new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
    end: now,
    requestedDays: days,
    mode: 'preset',
  }
}

async function getHandler(req: NextRequest): Promise<NextResponse> {
  try {
    const ticker = req.nextUrl.searchParams.get('ticker')?.trim().toUpperCase()
    const window = parseWindow(req)

    if (!ticker) {
      return NextResponse.json(
        { success: false, error: { code: 'VAL_001', message: 'Ticker obrigatório.' } },
        { status: 400 },
      )
    }

    const asset = await prisma.asset.findUnique({
      where: { ticker },
      select: {
        id: true,
        ticker: true,
        displayName: true,
        realName: true,
        cluster: true,
        currentPrice: true,
        openPrice: true,
        closePrice: true,
        fairValue: true,
        volume: true,
        sentiment: true,
      },
    })

    if (!asset) {
      return NextResponse.json(
        { success: false, error: { code: 'ASSET_404', message: 'Ativo não encontrado.' } },
        { status: 404 },
      )
    }

    // Leitura raw intencional: existem dados legados gerados pelo motor com
    // session_type='TRADING', enquanto o enum Prisma do Next pode divergir.
    // Projetar session_type como texto evita P2023 e preserva a explicação histórica.
    const [hasSourceColumn, hasAttributionColumn] = await Promise.all([
      priceHistoryColumnExists('source'),
      priceHistoryColumnExists('attribution'),
    ])

    const newestHistory = await getPriceHistory({
      assetId: asset.id,
      start: window.start,
      end: window.end,
      hasSourceColumn,
      hasAttributionColumn,
    })

    const history = newestHistory.reverse()
    const analysisStart = history[0]?.timestamp ?? window.start
    const analysisEnd = history[history.length - 1]?.timestamp ?? window.end

    const cluster = asset.cluster as ClusterKey
    const [news, adminActions, orders, motorLayers] = await Promise.all([
      prisma.news.findMany({
        where: {
          isArchived: false,
          OR: [
            { ticker: asset.ticker },
            { assetIds: { has: asset.id } },
          ],
          AND: [
            {
              OR: [
                {
                  createdAt: {
                    gte: new Date(analysisStart.getTime() - NEWS_LOOKBACK_MS),
                    lte: new Date(analysisEnd.getTime() + EVENT_GRACE_MS),
                  },
                },
                {
                  publishedAt: {
                    gte: new Date(analysisStart.getTime() - NEWS_LOOKBACK_MS),
                    lte: new Date(analysisEnd.getTime() + EVENT_GRACE_MS),
                  },
                },
              ],
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          title: true,
          source: true,
          sentiment: true,
          impact: true,
          publishedAt: true,
          createdAt: true,
        },
      }),
      prisma.adminMarketAction.findMany({
        where: {
          OR: [
            { assetId: asset.id },
            { ticker: asset.ticker },
          ],
          createdAt: {
            gte: new Date(analysisStart.getTime() - EVENT_GRACE_MS),
            lte: new Date(analysisEnd.getTime() + EVENT_GRACE_MS),
          },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          action: true,
          reason: true,
          details: true,
          previousPrice: true,
          newPrice: true,
          createdAt: true,
        },
      }),
      prisma.order.findMany({
        where: {
          assetId: asset.id,
          status: { in: ['FILLED', 'PARTIAL'] },
          OR: [
            {
              executedAt: {
                gte: analysisStart,
                lte: analysisEnd,
              },
            },
            {
              updatedAt: {
                gte: analysisStart,
                lte: analysisEnd,
              },
            },
            {
              createdAt: {
                gte: analysisStart,
                lte: analysisEnd,
              },
            },
          ],
        },
        orderBy: { updatedAt: 'asc' },
        select: {
          id: true,
          side: true,
          quantity: true,
          price: true,
          executedPrice: true,
          executedAt: true,
          updatedAt: true,
          createdAt: true,
        },
      }),
      getMotorLayersConfig(),
    ])
    const motorContext = buildMotorContext(cluster, motorLayers)

    const movements: MovementRecord[] = history.slice(1).flatMap((point, index) => {
      const previous = history[index]
      const previousClose = previous.close
      const close = point.close
      const rawChange = close - previousClose
      if (rawChange === 0) return []

      const absoluteChange = round2(rawChange)
      const percentageChange = pct(previousClose, close)
      const direction = rawChange > 0 ? 'up' : 'down'
      const windowStart = new Date(previous.timestamp.getTime() - NEWS_LOOKBACK_MS)
      const windowEnd = new Date(point.timestamp.getTime() + EVENT_GRACE_MS)
      const orderWindowStart = previous.timestamp
      const orderWindowEnd = point.timestamp

      const matchedNews: NewsEvidence[] = news
        .filter((item) => inWindow(eventTime(item), windowStart, windowEnd))
        .map((item) => ({
          id: item.id,
          title: item.title,
          source: item.source,
          sentiment: item.sentiment,
          impact: item.impact,
          occurredAt: eventTime(item).toISOString(),
          href: `/admin/noticias?newsId=${item.id}`,
        }))

      const matchedAdminActions: AdminActionEvidence[] = adminActions
        .filter((action) => inWindow(action.createdAt, new Date(previous.timestamp.getTime() - EVENT_GRACE_MS), windowEnd))
        .map((action) => ({
          id: action.id,
          action: action.action,
          reason: extractActionReason(action),
          previousPrice: toNumber(action.previousPrice),
          newPrice: toNumber(action.newPrice),
          occurredAt: action.createdAt.toISOString(),
          href: `/admin/lgpd?tab=access-logs&actionId=${action.id}`,
        }))

      const matchedOrders = orders.filter((order) => inWindow(orderEventTime(order), orderWindowStart, orderWindowEnd))
      const orderFlow = buildOrderFlowEvidence(matchedOrders)
      const volumeDelta = Math.max(0, Number(point.volume - previous.volume))
      const high = point.high
      const low = point.low
      const open = point.open
      const intraperiodRangePct = low > 0 ? pct(low, high) : 0
      const movementContext: MovementContext = {
        previousPrice: previousClose,
        newPrice: close,
        absoluteChange,
        percentageChange,
        intraperiodRangePct,
        volume: Number(point.volume),
        volumeDelta,
        sessionType: point.sessionType,
        orderFlow,
        motor: {
          cluster: motorContext.cluster,
          sigma: motorContext.effectiveParameters.sigma,
          theta: motorContext.effectiveParameters.theta,
          ofiRho: motorContext.effectiveParameters.ofiRho,
          velocityCapPct: motorContext.effectiveParameters.velocityCapPct,
        },
      }
      const attributionParse = parseEngineAttribution(point.attribution)
      const engineAttribution = attributionParse.ok ? attributionParse.value : null
      const fallbackCause = buildCause({
        direction,
        volumeDelta,
        source: point.source,
        news: matchedNews,
        adminActions: matchedAdminActions,
        context: movementContext,
      })
      const evidenceClassification = classifyEvidence({
        attributionParse,
        source: point.source,
        hasAttributionColumn,
        news: matchedNews,
        adminActions: matchedAdminActions,
        orderFlow,
        fallbackCause,
      })
      const cause = engineAttribution
        ? {
            causeType: 'SIMULATED_ENGINE' as CauseType,
            causeLabel: engineAttribution.primaryCause,
            confidence: evidenceClassification.confidence,
            explanation: evidenceClassification.primaryExplanation,
          }
        : {
            ...fallbackCause,
            confidence: evidenceClassification.confidence,
            explanation: evidenceClassification.primaryExplanation,
          }
      const score = evidenceClassification.confidenceScore
      const diagnosticNotes = engineAttribution
        ? buildEngineAttributionDiagnosticNotes(engineAttribution)
        : buildDiagnosticNotes({
            movementPct: percentageChange,
            volumeDelta,
            source: point.source,
            news: matchedNews,
            adminActions: matchedAdminActions,
            confidence: cause.confidence,
            causeType: cause.causeType,
            orderFlow,
          })
      if (engineAttribution && (matchedNews.length > 0 || matchedAdminActions.length > 0)) {
        diagnosticNotes.push(
          `Evidências externas na janela: ${matchedNews.length} notícia(s) e ${matchedAdminActions.length} ação(ões) administrativa(s). Elas são complementares ao rastro causal gravado pelo motor.`,
        )
      }
      if (
        !engineAttribution &&
        (
          cause.causeType === 'SIMULATED_ENGINE' ||
          cause.causeType === 'MARKET_FLOW' ||
          cause.causeType === 'UNEXPLAINED'
        )
      ) {
        diagnosticNotes.push(
          `Parâmetros efetivos do motor no cluster ${motorContext.cluster}: sigma ${motorContext.effectiveParameters.sigma}, theta ${motorContext.effectiveParameters.theta}, OFI rho ${motorContext.effectiveParameters.ofiRho}, velocity cap ${motorContext.effectiveParameters.velocityCapPct}% por tick.`,
        )
      }
      if (Math.abs(percentageChange) >= motorContext.effectiveParameters.velocityCapPct) {
        diagnosticNotes.push(
          `A variação do ponto supera ou iguala o cap unitário de ${motorContext.effectiveParameters.velocityCapPct}% por tick; o candle pode agregar múltiplos ticks persistidos.`,
        )
      }
      if (!attributionParse.ok) {
        diagnosticNotes.push(`Attribution parser: ${attributionParse.reason}; EvidenceGrade=${evidenceClassification.evidenceGrade}.`)
      }
      if (evidenceClassification.degradedReason) {
        diagnosticNotes.push(`Degradacao: ${evidenceClassification.degradedReason}`)
      }

      return [{
        id: point.id,
        from: previous.timestamp.toISOString(),
        to: point.timestamp.toISOString(),
        previousPrice: previousClose,
        newPrice: close,
        open,
        high,
        low,
        absoluteChange,
        percentageChange,
        intraperiodRangePct,
        direction,
        magnitude: magnitudeFromPct(percentageChange),
        volume: Number(point.volume),
        volumeDelta,
        sessionType: point.sessionType,
        source: point.source,
        ...cause,
        confidenceScore: score,
        diagnosticNotes,
        orderFlow,
        engineAttribution,
        evidenceGrade: evidenceClassification.evidenceGrade,
        qualityFlags: evidenceClassification.qualityFlags,
        directEvidence: evidenceClassification.directEvidence,
        correlatedEvidence: evidenceClassification.correlatedEvidence,
        degradedReason: evidenceClassification.degradedReason,
        degradedOwner: evidenceClassification.degradedOwner,
        primaryExplanation: evidenceClassification.primaryExplanation,
        evidenceSentence: evidenceClassification.evidenceSentence,
        caveatSentence: evidenceClassification.caveatSentence,
        evidenceWindow: {
          startsAt: windowStart.toISOString(),
          endsAt: windowEnd.toISOString(),
          newsLookbackMinutes: NEWS_LOOKBACK_MS / 60000,
          adminGraceMinutes: EVENT_GRACE_MS / 60000,
        },
        evidence: {
          news: matchedNews.slice(0, 5),
          adminActions: matchedAdminActions.slice(0, 5),
        },
      }]
    })

    const startPrice = history[0]?.close ?? asset.openPrice.toNumber()
    const endPrice = history[history.length - 1]?.close ?? asset.currentPrice.toNumber()
    const countsByCause = movements.reduce<Record<CauseType, number>>((acc, movement) => {
      acc[movement.causeType] = (acc[movement.causeType] ?? 0) + 1
      return acc
    }, {
      ADMIN_ACTION: 0,
      NEWS: 0,
      MARKET_FLOW: 0,
      SIMULATED_ENGINE: 0,
      UNEXPLAINED: 0,
    })

    const largestMovement = movements.reduce<typeof movements[number] | null>((largest, movement) => {
      if (!largest) return movement
      return Math.abs(movement.percentageChange) > Math.abs(largest.percentageChange) ? movement : largest
    }, null)
    const movementPercentages = movements.map((movement) => movement.percentageChange)
    const averageAbsChange = round2(average(movementPercentages.map((value) => Math.abs(value))))
    const volatilityPct = round2(stdDev(movementPercentages))
    const positiveMovements = movements.filter((movement) => movement.direction === 'up').length
    const negativeMovements = movements.filter((movement) => movement.direction === 'down').length
    const highMagnitudeMovements = movements.filter((movement) =>
      movement.magnitude === 'alta' || movement.magnitude === 'critica'
    ).length
    const explainedMovements = movements.filter((movement) => movement.causeType !== 'UNEXPLAINED').length
    const explainedPct = movements.length > 0 ? round2((explainedMovements / movements.length) * 100) : 0
    const directCount = movements.filter((movement) => movement.evidenceGrade === 'DIRECT').length
    const correlatedCount = movements.filter((movement) => movement.evidenceGrade === 'CORRELATED').length
    const degradedCount = movements.filter((movement) => movement.evidenceGrade === 'DEGRADED').length
    const attributionDenominator = movements.length
    const attributionCoveragePct = attributionDenominator > 0 ? round2((directCount / attributionDenominator) * 100) : 0
    const averageConfidenceScore = Math.round(average(movements.map((movement) => movement.confidenceScore)))
    const dominantCause = (Object.entries(countsByCause) as [CauseType, number][])
      .sort(([causeA, countA], [causeB, countB]) => {
        if (countB !== countA) return countB - countA
        return causePriority(causeB) - causePriority(causeA)
      })[0]
    const fairValue = asset.fairValue.toNumber()
    const fairValueGapPct = fairValue > 0 ? pct(fairValue, endPrice) : 0
    const valuationLabel = fairValue === 0
      ? 'valor justo indisponivel'
      : fairValueGapPct > 5
        ? 'acima do valor justo'
        : fairValueGapPct < -5
          ? 'abaixo do valor justo'
          : 'proximo ao valor justo'
    const sourceBreakdown = movements.reduce<Record<string, number>>((acc, movement) => {
      acc[movement.source] = (acc[movement.source] ?? 0) + 1
      return acc
    }, {})
    const newsSentimentBreakdown = news.reduce<Record<string, number>>((acc, item) => {
      acc[item.sentiment] = (acc[item.sentiment] ?? 0) + 1
      return acc
    }, {})
    const adminActionBreakdown = adminActions.reduce<Record<string, number>>((acc, item) => {
      acc[item.action] = (acc[item.action] ?? 0) + 1
      return acc
    }, {})
    const topMovements = [...movements]
      .sort((a, b) => Math.abs(b.percentageChange) - Math.abs(a.percentageChange))
      .slice(0, 5)
    const reliabilityLabel = averageConfidenceScore >= 75
      ? 'alta'
      : averageConfidenceScore >= 50
        ? 'media'
        : 'baixa'
    const reportNarrative = movements.length === 0
      ? 'Nao houve variacao de preco suficiente para explicar no periodo selecionado.'
      : `No periodo analisado, ${asset.ticker} teve ${movements.length} mudanca(s) de preco, com variacao acumulada de ${pct(startPrice, endPrice)}%. A causa dominante foi ${CAUSE_LABELS_FOR_API[dominantCause?.[0] ?? 'UNEXPLAINED']}, presente em ${dominantCause?.[1] ?? 0} movimento(s). ${explainedPct}% das mudancas possuem alguma evidencia registrada no sistema.`

    return NextResponse.json({
      success: true,
      data: {
        asset: {
          id: asset.id,
          ticker: asset.ticker,
          cluster,
          displayName: asset.displayName,
          realName: asset.realName,
          currentPrice: asset.currentPrice.toNumber(),
          fairValue: asset.fairValue.toNumber(),
          sentiment: asset.sentiment,
          volume: Number(asset.volume),
        },
        period: {
          requestedDays: window.requestedDays,
          mode: window.mode,
          start: analysisStart.toISOString(),
          end: analysisEnd.toISOString(),
          pricePoints: history.length,
          maxPricePoints: MAX_PRICE_POINTS,
        },
        summary: {
          startPrice,
          endPrice,
          absoluteChange: Math.round((endPrice - startPrice) * 100) / 100,
          percentageChange: pct(startPrice, endPrice),
          movementsAnalyzed: movements.length,
          countsByCause,
          largestMovement,
          positiveMovements,
          negativeMovements,
          highMagnitudeMovements,
          averageAbsChange,
          volatilityPct,
          explainedPct,
          averageConfidenceScore,
          reliabilityLabel,
          dominantCause: {
            type: dominantCause?.[0] ?? 'UNEXPLAINED',
            label: CAUSE_LABELS_FOR_API[dominantCause?.[0] ?? 'UNEXPLAINED'],
            count: dominantCause?.[1] ?? 0,
          },
          fairValueGapPct,
          valuationLabel,
          sourceBreakdown,
          newsSentimentBreakdown,
          adminActionBreakdown,
          topMovements,
          reportNarrative,
          attributionCoveragePct,
          denominator: {
            type: 'movements_with_rawChange_non_zero',
            count: attributionDenominator,
            period: {
              start: analysisStart.toISOString(),
              end: analysisEnd.toISOString(),
            },
          },
          directCount,
          correlatedCount,
          degradedCount,
          period: {
            start: analysisStart.toISOString(),
            end: analysisEnd.toISOString(),
          },
        },
        movements,
        evidenceTotals: {
          news: news.length,
          adminActions: adminActions.length,
        },
        motorContext,
      },
    })
  } catch (err) {
    console.error('[admin/value-analysis] Erro:', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno ao gerar análise de valor.' } },
      { status: 500 },
    )
  }
}

export const GET = withAdmin('assets:price')(getHandler)
