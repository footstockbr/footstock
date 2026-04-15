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

// Map UI chart period → date range and granularity hint
function resolvePeriodConfig(period: ChartPeriod): {
  granularity: Granularity
  fromDate: Date | null
} {
  const now = new Date()
  switch (period) {
    case '1H':
      return {
        granularity: 'minute',
        fromDate: new Date(now.getTime() - 60 * 60 * 1000),
      }
    case '1D':
      return {
        granularity: 'minute',
        fromDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      }
    case '1W':
    case '1S':
      return {
        granularity: 'hourly',
        fromDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      }
    case '1M':
      return {
        granularity: 'daily',
        fromDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      }
    case '3M':
      return {
        granularity: 'daily',
        fromDate: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      }
    case '1Y':
      return {
        granularity: 'weekly',
        fromDate: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
      }
    case 'ALL':
    default:
      return { granularity: 'weekly', fromDate: null }
  }
}

export const PriceHistoryRepository = {
  /**
   * Find price history by asset ID (resolves ticker to assetId internally).
   * @param ticker - Asset ticker (e.g. "FLA1")
   */
  async findByTicker(
    ticker: string,
    filters: HistoryFilters = {}
  ): Promise<Array<{
    timestamp: string
    open: number
    high: number
    low: number
    close: number
    volume: number
    ofi: number
    source: string
  }>> {
    // Resolve ticker to assetId
    const asset = await prisma.asset.findUnique({
      where: { ticker: ticker.toUpperCase() },
      select: { id: true },
    })
    if (!asset) return []

    const period = filters.period ?? '1M'
    const { fromDate } = resolvePeriodConfig(period)

    const resolvedFrom = filters.from ?? fromDate
    const resolvedTo = filters.to ?? new Date()

    const candles = await prisma.priceHistory.findMany({
      where: {
        assetId: asset.id,
        ...(resolvedFrom && { timestamp: { gte: resolvedFrom, lte: resolvedTo } }),
      },
      orderBy: { timestamp: 'asc' },
      take: 5000,
    })

    return candles.map((c) => ({
      timestamp: c.timestamp.toISOString(),
      open: c.open.toNumber(),
      high: c.high.toNumber(),
      low: c.low.toNumber(),
      close: c.close.toNumber(),
      volume: Number(c.volume),
      ofi: 0, // TECH-DEBT: ofi field not yet in PriceHistory schema — will be added by motor (module-7)
      source: (c as unknown as { source: string }).source ?? 'REAL',
    }))
  },

  getGranularity(period: ChartPeriod): Granularity {
    return resolvePeriodConfig(period).granularity
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

    const assetIdToTicker = new Map(assets.map(a => [a.id, a.ticker]))
    const assetIds = assets.map(a => a.id)

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
          close: r.close.toNumber(),
        }
      }
    }
    return result
  },
}
