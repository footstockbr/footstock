/**
 * Limites e valores padrão da plataforma.
 */

/** Saldo inicial de FS$ concedido ao novo usuário (JOGADOR tier). */
export const INITIAL_FS_BALANCE = 2000.0

/** Taxa operacional por plano (percentual sobre o valor da operação). */
export const FEE_RATES = {
  JOGADOR: 0.002,  // 0.2%
  CRAQUE: 0.0015,  // 0.15%
  LENDA: 0.001,    // 0.1%
} as const

/**
 * Calcula a taxa operacional de uma ordem para exibição estimada no front-end.
 * Usa a taxa do plano JOGADOR (0.2%) como referência conservadora.
 * O cálculo real e definitivo ocorre no backend (OrderExecutor).
 */
export function calculateFee(operationValue: number): number {
  return operationValue * FEE_RATES.JOGADOR
}
