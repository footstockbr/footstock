// module-20: ScoringEngine — 5 pilares de pontuação + fator de equidade
// CONTRATO CROSS-ROCK: consumers module-14, module-15, module-18

import { prisma } from '@/lib/prisma'
import type { LeagueCategory, ScoreBreakdown } from '@/types'
import type { ScoringContract, TradingDataForScoring } from '@/lib/contracts/scoring-contract'

// ─── Constantes dos pilares ────────────────────────────────────────────────────

const MAX_RENTABILIDADE = 35
const MAX_SOFISTICACAO = 25
const MAX_DIVERSIFICACAO = 20
const MAX_CONSISTENCIA = 15
const MAX_BONUS_EDUCATIVO = 5

// Fator de equidade por categoria (division)
const FATOR_EQUIDADE: Record<string, number> = {
  BRONZE: 1.2,
  PRATA: 1.0,
  OURO: 0.9,
  ABERTA: 1.0,
}

// ─── Funções auxiliares ────────────────────────────────────────────────────────

/**
 * Índice de Herfindahl-Hirschman — concentração de portfólio.
 * Retorna 1.0 quando há concentração total (= Diversificação 0 pts).
 */
function herfindahl(positions: { value: number }[]): number {
  if (!positions.length) return 1
  const total = positions.reduce((sum, p) => sum + p.value, 0)
  if (total === 0) return 1
  return positions.reduce((sum, p) => sum + Math.pow(p.value / total, 2), 0)
}

/** Média aritmética */
function mean(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

/** Desvio padrão populacional */
function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0
  const variance = values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length
  return Math.sqrt(variance)
}

// ─── ScoringEngine ─────────────────────────────────────────────────────────────

export class ScoringEngine implements ScoringContract {
  /**
   * Coleta todos os dados de trading necessários para o score.
   * Falhas de providers externos → modo degradado (0 para o pilar afetado).
   */
  async getTradingData(
    userId: string,
    leagueId: string,
    since: Date
  ): Promise<TradingDataForScoring> {
    // ── Provider module-15: P&L e posições ──────────────────────────────────
    let pnLPercent = 0
    let positions: { ticker: string; value: number }[] = []
    let dailyReturns: number[] = []

    try {
      // Busca posições LONG abertas pelo userId (module-15/PositionRepository)
      const rawPositions = await prisma.position.findMany({
        where: { userId, side: 'LONG' },
        select: { assetId: true, quantity: true, avgPrice: true },
      })

      // Soma valor de mercado por posição (quantity × avgPrice como proxy)
      let totalValue = 0
      let totalCost = 0
      positions = rawPositions.map((p) => {
        const value = Number(p.quantity) * Number(p.avgPrice)
        totalValue += value
        totalCost += value
        return { ticker: p.assetId, value }
      })

      // P&L% simples: (valor_atual - custo) / custo × 100
      // Em produção seria buscado o preço atual via module-7; aqui proxy de avgPrice
      pnLPercent = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0

      // Retornos diários: calcula a partir do histórico de snapshots (proxy simples)
      const snapshots = await prisma.priceHistory.findMany({
        where: {
          assetId: { in: rawPositions.map((p) => p.assetId) },
        },
        orderBy: { timestamp: 'asc' },
        take: 30,
      })
      if (snapshots.length > 1) {
        dailyReturns = snapshots.slice(1).map((s, i) => {
          const prev = Number(snapshots[i].close)
          const curr = Number(s.close)
          return prev > 0 ? (curr - prev) / prev : 0
        })
      }
    } catch (err) {
      console.error('[ScoringEngine] Falha ao buscar dados de portfólio (module-15):', err)
    }

    // ── Provider module-14: ordens ──────────────────────────────────────────
    let totalOrders = 0
    let advancedOrders = 0

    try {
      const orders = await prisma.order.findMany({
        where: {
          userId,
          createdAt: { gte: since },
          status: { in: ['FILLED', 'PARTIAL'] },
        },
        select: { type: true, side: true },
      })

      totalOrders = orders.length
      advancedOrders = orders.filter(
        (o) => o.type === 'LIMIT' || o.type === 'OCO' || o.side === 'SELL'
      ).length
    } catch (err) {
      console.error('[ScoringEngine] Falha ao buscar ordens (module-14):', err)
    }

    // ── Provider module-18: interações com glossário ────────────────────────
    let glossaryInteractions = 0

    try {
      glossaryInteractions = await prisma.glossaryInteraction.count({
        where: {
          userId,
          createdAt: { gte: since },
        },
      })
    } catch (err) {
      console.error('[ScoringEngine] Falha ao buscar glossaryInteractions (module-18):', err)
      // glossaryInteractions permanece 0 — modo degradado
    }

    return { pnLPercent, totalOrders, advancedOrders, positions, dailyReturns, glossaryInteractions }
  }

  /** Fator de equidade por categoria de liga */
  getFatorEquidade(category: string): number {
    return FATOR_EQUIDADE[category] ?? 1.0
  }

  /**
   * Calcula o score completo do usuário em uma liga.
   * Nunca lança exceção — retorna zeros em caso de falha total.
   */
  async calcularScore(userId: string, leagueId: string): Promise<ScoreBreakdown> {
    try {
      const league = await prisma.league.findUnique({
        where: { id: leagueId },
        select: { division: true, startsAt: true },
      })

      if (!league) {
        return this._zeroScore(1.0)
      }

      const data = await this.getTradingData(userId, leagueId, league.startsAt)
      const fatorEquidade = this.getFatorEquidade(league.division)

      // Pilar 1 — Rentabilidade (0-35)
      const rentabilidade = Math.max(
        0,
        Math.min((data.pnLPercent / 100) * MAX_RENTABILIDADE, MAX_RENTABILIDADE)
      )

      // Pilar 2 — Sofisticação (0-25)
      const sofisticacao =
        (data.advancedOrders / Math.max(data.totalOrders, 1)) * MAX_SOFISTICACAO

      // Pilar 3 — Diversificação (0-20)
      const hh = herfindahl(data.positions)
      const diversificacao = Math.max(0, (1 - hh) * MAX_DIVERSIFICACAO)

      // Pilar 4 — Consistência / Sharpe simplificado (0-15)
      let consistencia = 0
      if (data.dailyReturns.length >= 2) {
        const avg = mean(data.dailyReturns)
        const sd = stdDev(data.dailyReturns, avg)
        if (sd > 0) {
          consistencia = Math.min((avg / sd) * MAX_CONSISTENCIA, MAX_CONSISTENCIA)
          consistencia = Math.max(0, consistencia)
        }
      }

      // Pilar 5 — Bônus Educativo (0-5): 10 interações = máximo
      const bonusEducativo = Math.min(
        data.glossaryInteractions * 0.5,
        MAX_BONUS_EDUCATIVO
      )

      const total = rentabilidade + sofisticacao + diversificacao + consistencia + bonusEducativo
      const finalScore = total * fatorEquidade

      return {
        rentabilidade: +rentabilidade.toFixed(4),
        sofisticacao: +sofisticacao.toFixed(4),
        diversificacao: +diversificacao.toFixed(4),
        consistencia: +consistencia.toFixed(4),
        bonusEducativo: +bonusEducativo.toFixed(4),
        total: +total.toFixed(4),
        finalScore: +finalScore.toFixed(4),
        fatorEquidade,
      }
    } catch (err) {
      console.error('[ScoringEngine] Erro inesperado ao calcular score:', err)
      return this._zeroScore(1.0)
    }
  }

  /**
   * Persiste o score calculado em LeagueMember.
   */
  async salvarScore(
    userId: string,
    leagueId: string,
    score: ScoreBreakdown
  ): Promise<void> {
    await prisma.leagueMember.upsert({
      where: { leagueId_userId: { leagueId, userId } },
      update: {
        score: score.finalScore,
        scoreBreakdown: JSON.parse(JSON.stringify(score)),
        lastScoreAt: new Date(),
      },
      create: {
        leagueId,
        userId,
        score: score.finalScore,
        scoreBreakdown: JSON.parse(JSON.stringify(score)),
        joinedAt: new Date(),
        lastScoreAt: new Date(),
      },
    })
  }

  /**
   * Recalcula rankings após atualização de scores.
   * Empates desfeitos por joinedAt ASC.
   */
  async recalcularRanks(leagueId: string): Promise<void> {
    const members = await prisma.leagueMember.findMany({
      where: { leagueId },
      orderBy: [{ score: 'desc' }, { joinedAt: 'asc' }],
      select: { id: true },
    })

    await Promise.all(
      members.map((m, i) =>
        prisma.leagueMember.update({ where: { id: m.id }, data: { rank: i + 1 } })
      )
    )
  }

  private _zeroScore(fatorEquidade: number): ScoreBreakdown {
    return {
      rentabilidade: 0,
      sofisticacao: 0,
      diversificacao: 0,
      consistencia: 0,
      bonusEducativo: 0,
      total: 0,
      finalScore: 0,
      fatorEquidade,
    }
  }
}

export const scoringEngine = new ScoringEngine()
