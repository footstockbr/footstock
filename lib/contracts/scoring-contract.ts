// CONTRATO CROSS-ROCK: module-20 (consumer) ← module-14 e module-15 (providers de trading)
// CONTRATO CROSS-ROCK: module-20 (consumer) ← module-18 (GlossaryInteraction.count) → Pilar 5

import type { ScoreBreakdown } from '@/types'

/**
 * Dados de trading agregados para cálculo do ScoringEngine.
 * Cada campo corresponde a um pilar ou sub-insumo do score.
 */
export interface OrderTypeBreakdown {
  LIMIT?: number
  OCO?: number
  SHORT_PROFITABLE?: number
  SCHEDULED?: number
  AI_CONSULT?: number
}

export interface TradingDataForScoring {
  // Pilar 1 — Rentabilidade: Sharpe ratio (module-15/PositionRepository)
  pnLPercent: number
  dailyReturns: number[] // retornos diários no período da liga

  // Pilar 2 — Sofisticação: pontuação granular (module-14/orders)
  totalOrders: number
  advancedOrders: number // fallback: ordens LIMITADA, OCO ou side SHORT
  orderTypeBreakdown?: OrderTypeBreakdown // granular: contagem por tipo

  // Pilar 3 — Diversificação: ativos únicos + bonus divisões (module-15/positions)
  positions: { ticker: string; value: number }[]
  hasBothDivisions?: boolean // true se tem ativos de Serie A + Serie B

  // Pilar 4 — Consistência: média de posições diárias no ranking
  dailyRankPositions?: number[] // posição diária no ranking da liga
  totalLeagueMembers?: number  // total de membros para normalização

  // Pilar 5 — Bônus Educativo (module-18 + comunidade + plano)
  glossaryInteractions: number
  postsWithLikes?: number  // posts na comunidade com likes
  planUpgraded?: boolean   // upgrade de plano no período
}

/**
 * Contrato público do ScoringEngine.
 */
export interface ScoringContract {
  getTradingData(
    userId: string,
    leagueId: string,
    since: Date
  ): Promise<TradingDataForScoring>

  calcularScore(userId: string, leagueId: string): Promise<ScoreBreakdown>
}

export type { ScoreBreakdown }
