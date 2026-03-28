// ============================================================================
// Foot Stock — Formatacao de percentuais
// ============================================================================

/**
 * Formata percentual com sinal.
 * @example formatPercent(5.5) => "+5,50%"
 * @example formatPercent(-3.1) => "-3,10%"
 */
export function formatPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '0,00%'
  const sign = value > 0 ? '+' : ''
  const formatted = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
  return `${sign}${formatted}%`
}

/**
 * Formata decimal como percentual.
 * @example formatDecimalPercent(0.056) => "+5,60%"
 */
export function formatDecimalPercent(value: number, decimals = 2): string {
  return formatPercent(value * 100, decimals)
}
