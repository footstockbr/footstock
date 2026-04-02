// CONTRATO CROSS-ROCK: module-20 (consumer) ← module-14 e module-15 (providers de trading)
// CONTRATO CROSS-ROCK: module-20 (consumer) ← module-18 (GlossaryInteraction.count) → Pilar 5

import type { ScoreBreakdown } from '@/types'

/**
 * Dados de trading agregados para cálculo do ScoringEngine.
 * Cada campo corresponde a um pilar ou sub-insumo do score.
 */
export interface TradingDataForScoring {
  // Pilar 1 — Rentabilidade (module-15/PositionRepository)
  pnLPercent: number

  // Pilar 2 — Sofisticação (module-14/orders)
  totalOrders: number
  advancedOrders: number // ordens LIMITADA, OCO ou side SHORT

  // Pilar 3 — Diversificação (module-15/positions)
  positions: { ticker: string; value: number }[]

  // Pilar 4 — Consistência (module-14/module-15)
  dailyReturns: number[] // retornos diários no período da liga

  // Pilar 5 — Bônus Educativo (module-18/GlossaryInteraction.count)
  // module-18 (GlossaryInteraction.count no período da liga) → glossaryInteractions
  glossaryInteractions: number
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
