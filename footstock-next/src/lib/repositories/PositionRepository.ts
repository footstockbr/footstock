// ============================================================================
// Foot Stock — PositionRepository (module-15)
// Cálculo de P&L, histórico real (LOCF) e resumo de patrimônio.
// REGRA: NUNCA usar Math.random() em cálculos financeiros.
// Rastreabilidade: INT-034, INT-035
// ============================================================================

import { prisma } from '@/lib/prisma'
import { BaseRepository } from '@/lib/repositories/base'
import { PORTFOLIO_PERIOD } from '@/lib/enums'
import type { PortfolioPeriod } from '@/lib/enums'
import type { PortfolioSummary, HistoryPoint, PositionWithPnL } from '@/types/portfolio'

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function toNumber(val: unknown): number {
  if (val === null || val === undefined) return 0
  if (typeof val === 'number') return val
  // Prisma Decimal → toString → parseFloat
  return parseFloat(String(val)) || 0
}

/** Posição interna com assetId para uso em getSummary/getHistory */
interface InternalPosition extends PositionWithPnL {
  ticker: string
  assetId: string
}

function periodToDays(period: PortfolioPeriod): number | null {
  switch (period) {
    case PORTFOLIO_PERIOD.H1:     return 1
    case PORTFOLIO_PERIOD.H12:    return 1
    case PORTFOLIO_PERIOD.H24:    return 1
    case PORTFOLIO_PERIOD.WEEK:   return 7
    case PORTFOLIO_PERIOD.MONTH:  return 30
    case PORTFOLIO_PERIOD.YEAR:   return 365
    case PORTFOLIO_PERIOD.ALL:    return null
  }
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d)
  result.setUTCDate(result.getUTCDate() + n)
  return result
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0] ?? d.toISOString().substring(0, 10)
}

// ---------------------------------------------------------------------------
// PositionRepository
// ---------------------------------------------------------------------------

export class PositionRepository extends BaseRepository<unknown> {
  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    super((prisma as any).position, false)
  }

  /**
   * Retorna posições abertas com assetId (uso interno em getSummary/getHistory).
   */
  private async findByUserIdInternal(userId: string): Promise<InternalPosition[]> {
    const positions = await prisma.position.findMany({
      where: { userId, status: 'OPEN' },
      include: {
        asset: {
          select: {
            ticker: true,
            displayName: true,
            currentPrice: true,
          },
        },
      },
    })

    const result: InternalPosition[] = []

    for (const pos of positions) {
      const avgPrice = toNumber(pos.avgPrice)
      const qty = pos.quantity
      const isShort = pos.side === 'SHORT'

      // Buscar último preço real do price_history
      const lastHistory = await prisma.priceHistory.findFirst({
        where: { assetId: pos.assetId },
        orderBy: { timestamp: 'desc' },
        select: { close: true },
      })

      const currentPrice = lastHistory
        ? toNumber(lastHistory.close)
        : toNumber(pos.asset.currentPrice) || avgPrice

      // P&L: long = (current - avg) × qty; short = (avg - current) × qty
      const qtyNum = Number(qty)
      const pnL = isShort
        ? (avgPrice - currentPrice) * qtyNum
        : (currentPrice - avgPrice) * qtyNum

      const cost = avgPrice * qtyNum
      const pnLPercent = cost !== 0 ? (pnL / cost) * 100 : 0

      const entry: InternalPosition = {
        ticker: pos.asset.ticker,
        assetId: pos.assetId,
        clubName: pos.asset.displayName,
        qty: qtyNum,
        avgPrice,
        currentPrice,
        pnL,
        pnLPercent,
        isShort,
      }

      if (isShort) {
        entry.marginBlocked = toNumber(pos.marginBlocked)
        entry.accruedRent = toNumber(pos.interestAccrued)
      }

      result.push(entry)
    }

    return result
  }

  /**
   * Retorna todas as posições abertas do usuário com P&L calculado em tempo real.
   * currentPrice = último price_history.close do ativo (fallback: avgPrice).
   */
  async findByUserId(userId: string): Promise<PositionWithPnL[]> {
    return this.findByUserIdInternal(userId)
  }

  /** Resumo do patrimônio total com P&L, diversificação e variação de hoje. */
  async getSummary(userId: string): Promise<PortfolioSummary> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fsBalance: true },
    })
    const cashBalance = toNumber(user?.fsBalance)
    const positions = await this.findByUserIdInternal(userId)

    if (positions.length === 0) {
      return {
        totalValue: cashBalance,
        totalPnL: 0,
        totalPnLPercent: 0,
        pnLToday: 0,
        pnLTodayPercent: 0,
        largestPosition: null,
        diversificationScore: 0,
      }
    }

    const positionsValue = positions.reduce((acc, p) => acc + p.qty * p.currentPrice, 0)
    const totalValue = cashBalance + positionsValue
    const totalPnL = positions.reduce((acc, p) => acc + p.pnL, 0)
    const totalCost = totalValue - totalPnL
    const totalPnLPercent = totalCost !== 0
      ? parseFloat(((totalPnL / totalCost) * 100).toFixed(2))
      : 0

    // P&L de hoje: soma de qty × (currentPrice - priceYesterday)
    let pnLToday = 0
    const yesterday = new Date()
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    const yesterdayStart = startOfDay(yesterday)

    for (const pos of positions) {
      const prevHistory = await prisma.priceHistory.findFirst({
        where: {
          assetId: pos.assetId,
          timestamp: { lte: new Date(yesterdayStart.getTime() + 86400000 - 1) },
        },
        orderBy: { timestamp: 'desc' },
        select: { close: true },
      })

      if (prevHistory) {
        const prevPrice = toNumber(prevHistory.close)
        const todayDiff = (pos.currentPrice - prevPrice) * pos.qty
        pnLToday += pos.isShort ? -todayDiff : todayDiff
      }
    }

    const pnLTodayPercent = totalValue !== 0
      ? parseFloat(((pnLToday / totalValue) * 100).toFixed(2))
      : 0

    // Maior posição por valor
    const largestPosition = positions.reduce((max, p) => {
      const val = p.qty * p.currentPrice
      // non-null: positions.length > 0 garantido pelo guard acima
      return val > (max!.qty * max!.currentPrice) ? p : max
    }, positions[0] as PositionWithPnL)?.ticker ?? null

    // Score de diversificação (Herfindahl-Hirschman invertido)
    let diversificationScore = 0
    if (positionsValue > 0) {
      const hhiSum = positions.reduce((acc, p) => {
        const share = (p.qty * p.currentPrice) / positionsValue
        return acc + share * share
      }, 0)
      diversificationScore = parseFloat((1 - hhiSum).toFixed(4))
    }

    return {
      totalValue,
      totalPnL,
      totalPnLPercent,
      pnLToday,
      pnLTodayPercent,
      largestPosition,
      diversificationScore,
    }
  }

  /**
   * Histórico de evolução do patrimônio por período.
   * Usa dados REAIS de price_history + algoritmo LOCF para dias sem negociação.
   * NUNCA retorna valores aleatórios.
   */
  async getHistory(userId: string, period: PortfolioPeriod): Promise<HistoryPoint[]> {
    // Buscar posições históricas (open + closed)
    const positions = await prisma.position.findMany({
      where: { userId },
      include: {
        asset: { select: { ticker: true, id: true } },
      },
    })

    if (positions.length === 0) return []

    // Determinar range de datas
    const now = startOfDay(new Date())
    const days = periodToDays(period)

    let startDate: Date
    if (days === null) {
      // ALL: desde o primeiro pregão com posição aberta
      // non-null: positions.length > 0 garantido pelo guard acima
      const firstPos = positions[0]!
      const oldest = positions.reduce((min, p) => {
        const d = p.openedAt ?? p.createdAt
        return d < min ? d : min
      }, firstPos.openedAt ?? firstPos.createdAt)
      startDate = startOfDay(oldest)
    } else {
      startDate = startOfDay(new Date(now.getTime() - days * 86400000))
    }

    // Gerar array de datas do range [startDate .. now]
    const dates: Date[] = []
    let cur = new Date(startDate)
    while (cur <= now) {
      dates.push(new Date(cur))
      cur = addDays(cur, 1)
    }

    if (dates.length === 0) return []

    // Para cada ativo, buscar price_history no range
    const assetIds = [...new Set(positions.map(p => p.assetId))]
    const priceMap: Map<string, Map<string, number>> = new Map()

    for (const assetId of assetIds) {
      const histories = await prisma.priceHistory.findMany({
        where: {
          assetId,
          timestamp: {
            gte: startDate,
            lte: new Date(now.getTime() + 86400000),
          },
        },
        orderBy: { timestamp: 'asc' },
        select: { timestamp: true, close: true },
      })

      const dayMap = new Map<string, number>()
      for (const h of histories) {
        const d = toISODate(h.timestamp)
        dayMap.set(d, toNumber(h.close))
      }
      priceMap.set(assetId, dayMap)
    }

    // Calcular valor do portfólio por dia com LOCF
    const result: HistoryPoint[] = []
    const lastKnownPrice: Map<string, number> = new Map()

    for (const date of dates) {
      const dateStr = toISODate(date)
      let totalValue = 0

      for (const pos of positions) {
        // Verificar se posição estava aberta nesta data
        const openDate = startOfDay(pos.openedAt ?? pos.createdAt)
        if (date < openDate) continue
        if (pos.status === 'CLOSED') {
          // Posição fechada: verificar se foi fechada depois desta data
          const closedAt = pos.updatedAt
          if (closedAt && startOfDay(closedAt) <= date) continue
        }

        const dayMap = priceMap.get(pos.assetId)
        let price: number | undefined = dayMap?.get(dateStr)

        if (price !== undefined) {
          lastKnownPrice.set(pos.assetId, price)
        } else {
          // LOCF: propagar último preço conhecido
          price = lastKnownPrice.get(pos.assetId) ?? toNumber(pos.avgPrice)
        }

        totalValue += Number(pos.quantity) * price
      }

      if (totalValue > 0) {
        result.push({ date: dateStr, totalValue: parseFloat(totalValue.toFixed(2)) })
      }
    }

    return result
  }
}

export const positionRepository = new PositionRepository()
