// ============================================================================
// Foot Stock — Constantes de Alavancagem
// Módulo puro sem imports de Prisma/Redis — seguro para uso em client e server.
// Rastreabilidade: T-003 / INT-TRD-005
// ============================================================================

/** Taxa de juros diária sobre o crédito de alavancagem (leverageAmount). */
export const LEVERAGE_DAILY_INTEREST_RATE = 0.002 // 0,2%/dia

/** Multiplicador de alavancagem disponível para o plano Lenda. */
export const LEVERAGE_MULTIPLIER = 2

/**
 * Threshold de liquidação automática.
 * Quando perda acumulada supera esta fração do leverageAmount, posição é liquidada.
 */
export const LEVERAGE_LIQUIDATION_THRESHOLD = 0.8
