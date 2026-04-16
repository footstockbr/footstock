// ============================================================================
// FootStock — Limites diários de ordens e taxas por plano
// Re-exporta constants do module-2 e define limites diários específicos de ordens.
// Rastreabilidade: INT-019 / TASK-0/ST001
// ============================================================================

export { ORDER_LIMITS_BY_PLAN, OPERATIONAL_FEES, calculateFee } from '@/lib/constants/limits'
import type { PlanType } from '@/lib/enums'

/**
 * Limite de ordens criadas por dia (reseta à meia-noite BRT).
 * Lenda = Infinity (sem limite).
 */
export const DAILY_ORDER_LIMITS_BY_PLAN: Record<PlanType, number> = {
  JOGADOR: 2,
  CRAQUE: 5,
  LENDA: Infinity,
} as const

/**
 * Tipos de ordem permitidos por plano.
 * JOGADOR: apenas MARKET
 * CRAQUE: MARKET, LIMIT, SCHEDULED
 * LENDA: todos (MARKET, LIMIT, OCO, SCHEDULED + SHORT + LEVERAGE)
 */
export const ALLOWED_ORDER_TYPES_BY_PLAN: Record<PlanType, string[]> = {
  JOGADOR:  ['MARKET'],
  CRAQUE:   ['MARKET', 'LIMIT', 'SCHEDULED'],
  LENDA:    ['MARKET', 'LIMIT', 'OCO', 'SCHEDULED'],
} as const
