// ============================================================================
// FootStock — Constantes de Alavancagem
// Módulo puro sem imports de Prisma/Redis — seguro para uso em client e server.
// Rastreabilidade: T-003 / INT-TRD-005
// ============================================================================

/**
 * Taxa de juros diária sobre o crédito de alavancagem (leverageAmount).
 * PROVISÓRIA — LLD Q2 (owner Pedro) ainda não fixou o valor oficial. Alinhada a
 * 0,3%/dia, que é o valor armazenado em Position.dailyInterestRate pelo motor no
 * fill (settlement.ts) e o efetivamente cobrado. Esta constante é apenas o
 * fallback quando a posição não tem taxa. Fonte única: manter os dois em sincronia.
 */
export const LEVERAGE_DAILY_INTEREST_RATE = 0.003 // 0,3%/dia (provisório, LLD Q2)

/** Multiplicador de alavancagem disponível para o plano Lenda. */
export const LEVERAGE_MULTIPLIER = 2

/**
 * Threshold de liquidação automática.
 * Quando perda acumulada supera esta fração do leverageAmount, posição é liquidada.
 */
export const LEVERAGE_LIQUIDATION_THRESHOLD = 0.8
