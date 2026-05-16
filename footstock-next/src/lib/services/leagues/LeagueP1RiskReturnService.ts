import 'server-only'

import { prisma } from '@/lib/prisma'

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function toNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Calcula P1 (Risk-Adjusted Return, max 35 pts) para todos os membros de uma liga.
 *
 * Fórmula:
 *   sharpe = (user_return - league_avg_return) / user_portfolio_volatility
 *   P1 = max(0, sharpe / sharpe_max) * 35
 *
 * - volatility = 0 → P1 = 0
 * - sharpe negativo → P1 = 0
 * - sharpe_max = 0 → todos P1 = 0
 */
export class LeagueP1RiskReturnService {
  async calcularParaLiga(
    leagueId: string,
    memberIds: string[]
  ): Promise<Map<string, number>> {
    const ids = [...new Set(memberIds)]
    const zeros = () => new Map(ids.map((id) => [id, 0]))

    if (ids.length === 0) return new Map()

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { startsAt: true },
    })
    if (!league) return zeros()

    // Busca posições abertas de todos os membros
    const rawPositions = await prisma.position.findMany({
      where: { userId: { in: ids }, status: 'OPEN' },
      select: { userId: true, assetId: true, quantity: true, avgPrice: true, side: true },
    })
    if (rawPositions.length === 0) return zeros()

    const assetIds = [...new Set(rawPositions.map((p) => p.assetId))]
    const windowStart = utcDay(league.startsAt)
    const today = utcDay(new Date())

    // Preços atuais (último registro por ativo)
    const latestRaw = await prisma.priceHistory.findMany({
      where: { assetId: { in: assetIds } },
      orderBy: [{ assetId: 'asc' }, { timestamp: 'desc' }],
      distinct: ['assetId'],
      select: { assetId: true, close: true },
    })
    const latestPrice = new Map(latestRaw.map((r) => [r.assetId, toNum(r.close)]))

    // Histórico diário desde início da liga (para volatilidade)
    const histRaw = await prisma.priceHistory.findMany({
      where: { assetId: { in: assetIds }, timestamp: { gte: windowStart } },
      orderBy: [{ assetId: 'asc' }, { timestamp: 'asc' }],
      select: { assetId: true, timestamp: true, close: true },
    })

    // Agrupa histórico por ativo → mapa dia→price
    const pricesByAsset = new Map<string, Map<string, number>>()
    for (const row of histRaw) {
      const day = isoDay(row.timestamp)
      const byDay = pricesByAsset.get(row.assetId) ?? new Map<string, number>()
      byDay.set(day, toNum(row.close))
      pricesByAsset.set(row.assetId, byDay)
    }

    // Constrói série de dias da liga
    const days: string[] = []
    const cur = new Date(windowStart)
    while (cur.getTime() <= today.getTime()) {
      days.push(isoDay(cur))
      cur.setUTCDate(cur.getUTCDate() + 1)
    }

    // Agrupa posições por usuário
    const posByUser = new Map<string, typeof rawPositions>()
    for (const pos of rawPositions) {
      const arr = posByUser.get(pos.userId) ?? []
      arr.push(pos)
      posByUser.set(pos.userId, arr)
    }

    // Calcula user_return e volatilidade para cada usuário
    const returns = new Map<string, number>()
    const sharpeMap = new Map<string, number>()

    for (const userId of ids) {
      const positions = posByUser.get(userId) ?? []
      if (positions.length === 0) {
        returns.set(userId, 0)
        sharpeMap.set(userId, 0)
        continue
      }

      let totalInvested = 0
      let totalCurrentValue = 0

      // Valor diário do portfolio (para calcular volatilidade)
      const dailyValues = new Array<number>(days.length).fill(0)

      for (const pos of positions) {
        const qty = toNum(pos.quantity)
        const avg = toNum(pos.avgPrice)
        const invested = qty * avg
        if (invested <= 0) continue

        const current = latestPrice.get(pos.assetId) ?? avg
        const currentValue = qty * current

        totalInvested += invested
        totalCurrentValue += pos.side === 'SHORT'
          ? invested + (invested - currentValue) // lucro no short
          : currentValue

        const byDay = pricesByAsset.get(pos.assetId) ?? new Map<string, number>()
        let carry = avg
        for (let i = 0; i < days.length; i++) {
          const dayPrice = byDay.get(days[i]!)
          if (dayPrice !== undefined) carry = dayPrice
          dailyValues[i]! += qty * carry
        }
      }

      const userReturn = totalInvested > 0
        ? ((totalCurrentValue - totalInvested) / totalInvested) * 100
        : 0

      // Retornos diários do portfolio
      const dailyReturns: number[] = []
      for (let i = 1; i < dailyValues.length; i++) {
        const prev = dailyValues[i - 1]!
        const curr = dailyValues[i]!
        if (prev > 0) dailyReturns.push((curr - prev) / prev)
      }

      const vol = stdDev(dailyReturns)
      returns.set(userId, Number.isFinite(userReturn) ? userReturn : 0)

      const leagueAvg = 0 // preenchido abaixo
      const sharpe = vol > 0 ? (userReturn - leagueAvg) / vol : 0
      // Sharpe será recalculado após league_avg estar disponível
      sharpeMap.set(userId, Number.isFinite(vol) ? vol : 0) // temporário: guarda vol
    }

    // Calcula league_avg_return
    const leagueAvgReturn = mean(ids.map((id) => returns.get(id) ?? 0))

    // Recalcula sharpes com league_avg correta
    const sharpes = new Map<string, number>()
    let sharpeMax = 0
    for (const userId of ids) {
      const vol = sharpeMap.get(userId) ?? 0 // volatilidade guardada temporariamente
      const userReturn = returns.get(userId) ?? 0
      if (vol <= 0) {
        sharpes.set(userId, 0)
        continue
      }
      const sharpe = (userReturn - leagueAvgReturn) / vol
      const s = Number.isFinite(sharpe) ? Math.max(0, sharpe) : 0
      sharpes.set(userId, s)
      if (s > sharpeMax) sharpeMax = s
    }

    if (sharpeMax <= 0) return zeros()

    // Normaliza
    const scores = new Map<string, number>()
    for (const userId of ids) {
      const sharpe = sharpes.get(userId) ?? 0
      const p1 = sharpe > 0 ? round2(Math.min((sharpe / sharpeMax) * 35, 35)) : 0
      scores.set(userId, p1)
    }

    return scores
  }
}

export const leagueP1RiskReturnService = new LeagueP1RiskReturnService()
