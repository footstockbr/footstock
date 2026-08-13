import { prisma } from '@/lib/prisma'

export type ChartPeriod = '1H' | '1D' | '1W' | '1S' | '1M' | '3M' | '1Y' | 'ALL'
export type Granularity = 'minute' | 'hourly' | 'daily' | 'weekly'

export interface HistoryFilters {
  period?: ChartPeriod
  from?: Date
  to?: Date
}

export interface OFIData {
  timestamp: string
  ofi: number
}

export interface PriceHistoryCandle {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  ofi: number
  source: string
}

// Configuração canônica de buckets (FDD de Mercado).
// hipotese: H6 — 3M e 1Y não foram especificados no FDD; permanecem desabilitados
// até decisão registrada de bucket, cardinalidade e orçamento. ALL usa bucket
// diário com limite de 730 dias (~2 anos), mantido porque é esperado pelos
// testes de caracterização e pelo contrato de cutoff.
const BUCKET_CONFIG: Record<
  ChartPeriod,
  { bucketSeconds: number; maxBuckets: number; enabled: boolean }
> = {
  '1H': { bucketSeconds: 60, maxBuckets: 60, enabled: true },
  '1D': { bucketSeconds: 300, maxBuckets: 288, enabled: true },
  '1W': { bucketSeconds: 3600, maxBuckets: 168, enabled: true },
  '1S': { bucketSeconds: 3600, maxBuckets: 168, enabled: true },
  '1M': { bucketSeconds: 14400, maxBuckets: 180, enabled: true },
  '3M': { bucketSeconds: 86400, maxBuckets: 90, enabled: false },
  '1Y': { bucketSeconds: 604800, maxBuckets: 52, enabled: false },
  ALL: { bucketSeconds: 86400, maxBuckets: 730, enabled: true },
}

const ALLOWED_PERIODS = Object.keys(BUCKET_CONFIG) as ChartPeriod[]

function getBucketConfig(period: ChartPeriod) {
  return BUCKET_CONFIG[period] ?? BUCKET_CONFIG['1M']
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber()
  }
  return Number(value)
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value
  return new Date(String(value))
}

export const PriceHistoryRepository = {
  /**
   * Find price history by ticker. Aggregates raw snapshots into OHLCV buckets
   * in PostgreSQL before limiting, preserving the most recent eligible buckets.
   */
  async findByTicker(
    ticker: string,
    filters: HistoryFilters = {}
  ): Promise<PriceHistoryCandle[]> {
    const startTime = Date.now()
    const period = filters.period ?? '1M'

    if (!ALLOWED_PERIODS.includes(period)) {
      throw new Error(`Período não suportado: ${period}`)
    }

    const config = getBucketConfig(period)
    if (!config.enabled) {
      throw new Error(
        `Período ${period} não está habilitado. Decisão de bucket/cardinalidade/orçamento pendente (hipotese: H6).`
      )
    }

    // Resolve ticker to assetId
    const asset = await prisma.asset.findUnique({
      where: { ticker: ticker.toUpperCase() },
      select: { id: true },
    })
    if (!asset) return []

    const resolvedTo = filters.to ?? new Date()
    const resolvedFrom = filters.from

    // Agregação OHLCV no PostgreSQL. Usa close observado para formar candles,
    // pois open/high/low persistidos representam acumulados do dia.
    // Volume é calculado por deltas positivos entre snapshots consecutivos;
    // reset do contador vira novo baseline.
    const bucketSeconds = config.bucketSeconds
    const maxBuckets = config.maxBuckets
    const fromBoundary = resolvedFrom ?? new Date(0)

    const rows = await prisma.$queryRaw<
      Array<{
        timestamp: Date
        open: unknown
        high: unknown
        low: unknown
        close: unknown
        volume: unknown
        source: string
      }>
    >`
      WITH raw AS (
        SELECT
          timestamp,
          close,
          volume,
          source,
          EXTRACT(EPOCH FROM timestamp)::bigint / ${bucketSeconds} AS bucket
        FROM price_history
        WHERE asset_id = ${asset.id}
          AND timestamp <= ${resolvedTo}
          AND timestamp >= ${fromBoundary}
      ),
      ordered AS (
        SELECT
          *,
          LAG(volume) OVER (PARTITION BY bucket ORDER BY timestamp) AS prev_volume
        FROM raw
      ),
      deltas AS (
        SELECT
          *,
          CASE
            WHEN prev_volume IS NULL THEN volume
            WHEN volume < prev_volume THEN volume
            ELSE volume - prev_volume
          END AS volume_delta
        FROM ordered
      ),
      buckets AS (
        SELECT
          bucket,
          MIN(timestamp) AS bucket_start,
          (ARRAY_AGG(close ORDER BY timestamp))[1] AS open,
          MAX(close) AS high,
          MIN(close) AS low,
          (ARRAY_AGG(close ORDER BY timestamp DESC))[1] AS close,
          SUM(GREATEST(volume_delta, 0)) AS volume,
          (ARRAY_AGG(source ORDER BY timestamp DESC))[1] AS source
        FROM deltas
        GROUP BY bucket
      ),
      ranked AS (
        SELECT *
        FROM buckets
        ORDER BY bucket DESC
        LIMIT ${maxBuckets}
      )
      SELECT
        bucket_start AS timestamp,
        open,
        high,
        low,
        close,
        volume,
        source
      FROM ranked
      ORDER BY bucket_start ASC
    `

    const candles = rows.map((r) => ({
      timestamp: toDate(r.timestamp).toISOString(),
      open: toNumber(r.open),
      high: toNumber(r.high),
      low: toNumber(r.low),
      close: toNumber(r.close),
      volume: Number(r.volume ?? 0),
      ofi: 0, // TECH-DEBT: ofi field not yet in PriceHistory schema — will be added by motor (module-7)
      source: r.source ?? 'REAL',
    }))

    const durationMs = Date.now() - startTime
    console.info('[PriceHistoryRepository] aggregated', {
      ticker,
      period,
      bucketSeconds: config.bucketSeconds,
      bucketCount: candles.length,
      effectiveTo: resolvedTo.toISOString(),
      lastTimestamp: candles[candles.length - 1]?.timestamp ?? null,
      planDelayMinutes: 0,
      durationMs,
    })

    return candles
  },

  getGranularity(period: ChartPeriod): Granularity {
    switch (period) {
      case '1H':
      case '1D':
        return 'minute'
      case '1W':
      case '1S':
        return 'hourly'
      case '1M':
      case '3M':
        return 'daily'
      case '1Y':
      case 'ALL':
      default:
        return 'weekly'
    }
  },

  async findLatestByTickers(
    tickers: string[]
  ): Promise<Record<string, { timestamp: string; close: number }>> {
    // Resolve tickers to assetIds
    const assets = await prisma.asset.findMany({
      where: { ticker: { in: tickers.map((t) => t.toUpperCase()) } },
      select: { id: true, ticker: true },
    })
    if (assets.length === 0) return {}

    const assetIdToTicker = new Map(assets.map((a) => [a.id, a.ticker]))
    const assetIds = assets.map((a) => a.id)

    const records = await prisma.priceHistory.findMany({
      where: { assetId: { in: assetIds } },
      orderBy: { timestamp: 'desc' },
      take: assetIds.length * 10,
    })

    const result: Record<string, { timestamp: string; close: number }> = {}
    for (const r of records) {
      const ticker = assetIdToTicker.get(r.assetId)
      if (ticker && !result[ticker]) {
        result[ticker] = {
          timestamp: r.timestamp.toISOString(),
          close: toNumber(r.close),
        }
      }
    }
    return result
  },
}
