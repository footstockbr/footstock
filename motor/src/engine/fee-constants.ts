// ============================================================================
// FootStock Motor — Fee Constants (motor-local mirror)
// Espelha lib/constants/limits OPERATIONAL_FEES para uso no Railway motor.
// Source of truth: lib/constants/limits.ts — manter sincronizado.
// Rastreabilidade: TASK-7/ST001 (auditoria module-14)
// ============================================================================

/**
 * Taxas operacionais FIXAS por faixa de valor da operação (INTAKE canônico).
 * Valor da operação = quantidade × preço.
 * Faixas ordenadas por threshold crescente.
 */
export const OPERATIONAL_FEES = [
  { threshold: 500, fee: 0.25 },    // operações até FS$ 500
  { threshold: 1000, fee: 0.35 },   // operações de FS$ 500 a FS$ 1.000
  { threshold: Infinity, fee: 0.45 }, // operações acima de FS$ 1.000
] as const

/**
 * Calcula a taxa operacional fixa com base no valor da operação.
 * @param operationValue - quantidade × preço da operação
 * @returns taxa fixa em FS$ (0.25, 0.35 ou 0.45)
 */
export function calculateFee(operationValue: number): number {
  for (const tier of OPERATIONAL_FEES) {
    if (operationValue <= tier.threshold) return tier.fee
  }
  return OPERATIONAL_FEES[OPERATIONAL_FEES.length - 1].fee
}
