// ValuationService — Fórmulas de valuation dos ativos (clubes)
// EV → Equity → Float → IPO Price → Initial Supply

export interface ClubFinancials {
  /** Receita anual em R$ mil */
  revenue: number
  /** Dívida total em R$ mil */
  debt: number
  /** Patrimônio líquido em R$ mil */
  equity: number
  /** Free float % (0-1) */
  freeFloat: number
}

export interface ValuationResult {
  ev: number
  equityValue: number
  float: number
  ipoPrice: number
  initialSupply: number
}

export class ValuationService {
  /**
   * Enterprise Value = Receita × múltiplo setor (3x) + Patrimônio × 0.5
   */
  static calculateEV(financials: ClubFinancials): number {
    const revenueMultiple = 3.0
    const equityFactor = 0.5
    return financials.revenue * revenueMultiple + financials.equity * equityFactor
  }

  /**
   * Equity Value = max(EV - dívida, EV × 0.10) — floor de 10%
   */
  static calculateEquity(ev: number, debt: number): number {
    const floor = ev * 0.10
    return Math.max(ev - debt, floor)
  }

  /**
   * Float = Equity Value × free float %
   */
  static calculateFloat(equityValue: number, freeFloat: number): number {
    return equityValue * freeFloat
  }

  /**
   * Preço IPO em escala logarítmica normalizada
   * Normaliza o float (R$ mil) para faixa FS$ 5-50
   */
  static calculateIPOPrice(float: number): number {
    const MIN_PRICE = 5
    const MAX_PRICE = 50
    const LOG_MIN = Math.log(1_000)     // float mínimo esperado: R$ 1M
    const LOG_MAX = Math.log(5_000_000) // float máximo esperado: R$ 5B

    const logFloat = Math.log(Math.max(float, 1))
    const normalized = (logFloat - LOG_MIN) / (LOG_MAX - LOG_MIN)
    const price = MIN_PRICE + normalized * (MAX_PRICE - MIN_PRICE)

    return Math.max(MIN_PRICE, Math.min(MAX_PRICE, Math.round(price * 100) / 100))
  }

  /**
   * Supply inicial = Float / Preço IPO
   */
  static calculateInitialSupply(float: number, ipoPrice: number): number {
    if (ipoPrice <= 0) throw new Error('IPO price must be positive')
    return Math.round(float / ipoPrice)
  }

  /**
   * Pipeline completo: Financials → ValuationResult
   */
  static calculate(financials: ClubFinancials): ValuationResult {
    const ev = this.calculateEV(financials)
    const equityValue = this.calculateEquity(ev, financials.debt)
    const float = this.calculateFloat(equityValue, financials.freeFloat)
    const ipoPrice = this.calculateIPOPrice(float)
    const initialSupply = this.calculateInitialSupply(float, ipoPrice)

    return { ev, equityValue, float, ipoPrice, initialSupply }
  }
}
