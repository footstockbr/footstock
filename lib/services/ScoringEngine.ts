// module-20: ScoringEngine — 5 pilares de pontuação + fator de equidade
// CONTRATO CROSS-ROCK: consumers module-14, module-15, module-18

import { prisma } from '@/lib/prisma'
import type { ScoreBreakdown } from '@/types'
import type { ScoringContract, TradingDataForScoring, OrderTypeBreakdown } from '@/lib/contracts/scoring-contract'

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
        select: {
          assetId: true,
          quantity: true,
          avgPrice: true,
          asset: { select: { ticker: true } },
        },
      })

      // Soma valor de mercado por posição (quantity × avgPrice como proxy)
      let totalValue = 0
      let totalCost = 0
      positions = rawPositions.map((p) => {
        const value = Number(p.quantity) * Number(p.avgPrice)
        totalValue += value
        totalCost += value
        return { ticker: p.asset.ticker, value }
      })

      // STUB CROSS-MODULE: pnLPercent depende de module-15 (PositionRepository.getPnL)
      // avgPrice é usado como custo E como preço de mercado (proxy), logo totalValue === totalCost
      // Pilar Rentabilidade será sempre 0 até que module-7/15 forneça preço atual real
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
          const prevSnapshot = snapshots[i]
          if (!prevSnapshot) return 0
          const prev = Number(prevSnapshot.close)
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
    let orderTypeBreakdown: OrderTypeBreakdown | undefined

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

      // Breakdown granular por tipo (INTAKE canônico)
      orderTypeBreakdown = {
        LIMIT: orders.filter((o) => o.type === 'LIMIT').length,
        OCO: orders.filter((o) => o.type === 'OCO').length,
        // SHORT_PROFITABLE, SCHEDULED, AI_CONSULT requerem dados adicionais (stub 0)
        SHORT_PROFITABLE: 0,
        SCHEDULED: 0,
        AI_CONSULT: 0,
      }
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

    // Pilar 3 extra: hasBothDivisions (stub — requer categorização de ativos por divisão)
    // Pilar 4 extra: dailyRankPositions (stub — requer snapshot diário de ranking)
    // Pilar 5 extra: postsWithLikes, planUpgraded (stub — requer ForumPost + PlanHistory)

    return {
      pnLPercent,
      totalOrders,
      advancedOrders,
      orderTypeBreakdown,
      positions,
      dailyReturns,
      hasBothDivisions: false,       // TODO: detectar ativos Serie A + Serie B
      dailyRankPositions: undefined,  // TODO: snapshot diário do ranking
      totalLeagueMembers: undefined,  // TODO: contar membros da liga
      glossaryInteractions,
      postsWithLikes: 0,             // TODO: ForumPost.count com likes > 0
      planUpgraded: false,           // TODO: PlanHistory no período
    }
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

      // Pilar 1 — Rentabilidade (0-35): Sharpe ratio (INTAKE canônico)
      // Sharpe = (retorno_user - retorno_medio_liga) / vol_carteira
      let rentabilidade = 0
      if (data.dailyReturns.length >= 2) {
        const userReturn = mean(data.dailyReturns)
        const avgLeagueReturn = 0 // TODO: média da liga (0 como proxy)
        const vol = stdDev(data.dailyReturns, userReturn)
        if (vol > 0) {
          const sharpe = (userReturn - avgLeagueReturn) / vol
          rentabilidade = Math.max(0, Math.min(sharpe * (MAX_RENTABILIDADE / 2), MAX_RENTABILIDADE))
        }
      }

      // Pilar 2 — Sofisticação (0-25): pontuação granular (INTAKE canônico)
      // LIMIT executada +4, OCO +6, Short lucrativo +8, Agendada +3, Consulta IA +2, Glossário 5+ +2
      let sofisticacao = 0
      if (data.orderTypeBreakdown) {
        sofisticacao += (data.orderTypeBreakdown.LIMIT ?? 0) * 4
        sofisticacao += (data.orderTypeBreakdown.OCO ?? 0) * 6
        sofisticacao += (data.orderTypeBreakdown.SHORT_PROFITABLE ?? 0) * 8
        sofisticacao += (data.orderTypeBreakdown.SCHEDULED ?? 0) * 3
        sofisticacao += (data.orderTypeBreakdown.AI_CONSULT ?? 0) * 2
        if (data.glossaryInteractions >= 5) sofisticacao += 2
      } else {
        // Fallback: ratio simples
        sofisticacao = (data.advancedOrders / Math.max(data.totalOrders, 1)) * MAX_SOFISTICACAO
      }
      sofisticacao = Math.min(sofisticacao, MAX_SOFISTICACAO)

      // Pilar 3 — Diversificação (0-20): INTAKE canônico
      // min(20, ativos_unicos * 3 + bonus_divisoes)
      // bonus = 4 se tem ativos de Serie A + Serie B
      const uniqueAssets = new Set(data.positions.map(p => p.ticker)).size
      const hasBothDivisions = data.hasBothDivisions ?? false
      const divisionBonus = hasBothDivisions ? 4 : 0
      const diversificacao = Math.min(MAX_DIVERSIFICACAO, uniqueAssets * 3 + divisionBonus)

      // Pilar 4 — Consistência (0-15): média das posições diárias no ranking (INTAKE canônico)
      let consistencia = 0
      if (data.dailyRankPositions && data.dailyRankPositions.length > 0) {
        const avgRank = mean(data.dailyRankPositions)
        // Quanto menor o ranking médio, melhor. Normalizar para 0-15
        // Top 1 → 15pts, top 10% → ~10pts, 50% → ~5pts
        const totalMembers = data.totalLeagueMembers ?? 100
        const rankPercentile = 1 - (avgRank / totalMembers)
        consistencia = Math.max(0, Math.min(rankPercentile * MAX_CONSISTENCIA, MAX_CONSISTENCIA))
      } else if (data.dailyReturns.length >= 2) {
        // Fallback: Sharpe de retornos (quando ranking diário não disponível)
        const avg = mean(data.dailyReturns)
        const sd = stdDev(data.dailyReturns, avg)
        if (sd > 0) {
          consistencia = Math.min((avg / sd) * MAX_CONSISTENCIA, MAX_CONSISTENCIA)
          consistencia = Math.max(0, consistencia)
        }
      }

      // Pilar 5 — Bônus Educativo (0-5): INTAKE canônico
      // Glossário 5+ termos (+1), post com likes (+2), upgrade de plano (+2)
      let bonusEducativo = 0
      if (data.glossaryInteractions >= 5) bonusEducativo += 1
      if (data.postsWithLikes && data.postsWithLikes > 0) bonusEducativo += 2
      if (data.planUpgraded) bonusEducativo += 2
      bonusEducativo = Math.min(bonusEducativo, MAX_BONUS_EDUCATIVO)

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
