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

/**
 * Rotulo pt-BR do percentual de juros diarios de alavancagem, derivado da taxa
 * canonica acima. Task 20: a UI exibia tres numeros diferentes para a mesma taxa
 * (card de atalho 0,1%, InfoTip do OrderForm 0,2%, LeverageToggle 0,3%). Toda
 * superficie que fala de juros de alavancagem deve renderizar este rotulo, nunca
 * um literal, para que uma mudanca da constante propague sozinha.
 */
export const LEVERAGE_DAILY_INTEREST_PERCENT_LABEL = `${(LEVERAGE_DAILY_INTEREST_RATE * 100)
  .toFixed(1)
  .replace('.', ',')}%`

/**
 * Plano minimo exigido para alavancagem. Fonte unica consumida pelo gate do
 * OrderForm e pelo card de atalho, para que o plano anunciado nunca divirja do
 * plano efetivamente exigido (mesma classe de bug corrigida na Task 19 no OCO).
 */
export const LEVERAGE_REQUIRED_PLAN = 'LENDA' as const

/** Multiplicador de alavancagem disponível para o plano Lenda. */
export const LEVERAGE_MULTIPLIER = 2

/**
 * Threshold de liquidação automática.
 * Quando perda acumulada supera esta fração do leverageAmount, posição é liquidada.
 */
export const LEVERAGE_LIQUIDATION_THRESHOLD = 0.8
