import { prisma } from '@/lib/prisma'

export type ChartPeriod = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL'
export type Granularity = 'minute' | 'hourly' | 'daily' | 'weekly'

// DB period granularities stored in price_history.period
type DBPeriod = '1m' | '5m' | '15m' | '1h' | '1d'

export interface HistoryFilters {
  period?: ChartPeriod
  from?: Date
  to?: Date
}

export interface OFIData {
  timestamp: string
  ofi: number
}

// Map UI chart period → DB granularity period and date range
function resolvePeriodConfig(period: ChartPeriod): {
  dbPeriod: DBPeriod
  granularity: Granularity
  fromDate: Date | null
} {
  const now = new Date()
  switch (period) {
    case '1D':
      return {
        dbPeriod: '1m',
        granularity: 'minute',
        fromDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      }
    case '1W':
      return {
        dbPeriod: '15m',
        granularity: 'hourly',
        fromDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      }
    case '1M':
      return {
        dbPeriod: '1h',
        granularity: 'daily',
        fromDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      }
    case '3M':
      return {
        dbPeriod: '1d',
        granularity: 'daily',
        fromDate: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
      }
    case '1Y':
      return {
        dbPeriod: '1d',
        granularity: 'weekly',
        fromDate: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
      }
    case 'ALL':
    default:
      return { dbPeriod: '1d', granularity: 'weekly', fromDate: null }
  }
}

export const PriceHistoryRepository = {
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
  }>> {
    const period = filters.period ?? '1M'
    const { dbPeriod, fromDate } = resolvePeriodConfig(period)

    const resolvedFrom = filters.from ?? fromDate
    const resolvedTo = filters.to ?? new Date()

    const candles = await prisma.priceHistory.findMany({
      where: {
        ticker: ticker.toUpperCase(),
        period: dbPeriod,
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
      volume: c.volume.toNumber(),
      ofi: 0, // TECH-DEBT: ofi field not yet in PriceHistory schema — will be added by motor (module-7)
    }))
  },

  getGranularity(period: ChartPeriod): Granularity {
    return resolvePeriodConfig(period).granularity
  },

  async findLatestByTickers(
    tickers: string[]
  ): Promise<Record<string, { timestamp: string; close: number }>> {
    const records = await prisma.priceHistory.findMany({
      where: { ticker: { in: tickers.map((t) => t.toUpperCase()) }, period: '1m' },
      orderBy: { timestamp: 'desc' },
      take: tickers.length * 10,
    })

    const result: Record<string, { timestamp: string; close: number }> = {}
    for (const r of records) {
      if (!result[r.ticker]) {
        result[r.ticker] = {
          timestamp: r.timestamp.toISOString(),
          close: r.close.toNumber(),
        }
      }
    }
    return result
  },
}
