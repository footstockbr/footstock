// ============================================================================
// Foot Stock — Formatacao de moedas (FS$ e BRL)
// ============================================================================

/**
 * Formata valor em FS$ (moeda virtual do Foot Stock).
 * @example formatFS(1234.56) => "FS$1.234,56"
 */
export function formatFS(value: number, options?: { compact?: boolean }): string {
  if (!Number.isFinite(value)) return 'FS$0,00'

  if (options?.compact && Math.abs(value) >= 1000) {
    const compact = new Intl.NumberFormat('pt-BR', {
      notation: 'compact', maximumFractionDigits: 1,
    }).format(value)
    return `FS$${compact}`
  }
  return `FS$${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value)}`
}

/**
 * Formata valor em BRL.
 * @example formatBRL(1234.56) => "R$\u00a01.234,56"
 */
export function formatBRL(value: number): string {
  if (!Number.isFinite(value)) return 'R$\u00a00,00'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
  }).format(value)
}

/**
 * Formata numero com separadores de milhar PT-BR.
 */
export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '0'
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}
