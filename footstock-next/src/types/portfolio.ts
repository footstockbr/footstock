// ============================================================================
// Foot Stock — Types do módulo Portfolio Dashboard (module-15)
// ============================================================================

/** Resumo de patrimônio do portfólio do usuário */
export interface PortfolioSummary {
  /** Patrimônio total em FS$ */
  totalValue: number
  /** P&L total absoluto */
  totalPnL: number
  /** P&L em percentual */
  totalPnLPercent: number
  /** Variação de hoje em absoluto */
  pnLToday: number
  /** Variação de hoje em percentual */
  pnLTodayPercent: number
  /** Ticker da maior posição */
  largestPosition: string | null
  /** Score de diversificação 0-1 (HHI invertido) */
  diversificationScore: number
}

/** Ponto de evolução histórica do portfólio */
export interface HistoryPoint {
  /** Data ISO (YYYY-MM-DD) */
  date: string
  /** Valor total do portfólio nesta data em FS$ */
  totalValue: number
}

/** Posição com P&L calculado em tempo real */
export interface PositionWithPnL {
  ticker: string
  clubName: string
  qty: number
  avgPrice: number
  currentPrice: number
  pnL: number
  pnLPercent: number
  isShort: boolean
  /** Margem bloqueada (somente short) */
  marginBlocked?: number
  /** Aluguel acumulado (somente short) */
  accruedRent?: number
}
