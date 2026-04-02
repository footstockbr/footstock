// L10_DailyVolCap — Cap de volatilidade diária acumulada de 2.5%
// Aplicado após L9_CircuitBreaker

const DAILY_VOL_CAP = 0.025 // 2.5%
const DELTA_REDUCTION_FACTOR = 0.20 // reduzir delta a 20% quando cap atingido

export class DailyVolCap {
  private dailyAccumulator: Map<string, number> = new Map()
  private capReached: Set<string> = new Set()

  /**
   * Registra variação acumulada do ativo
   * @param ticker símbolo do ativo
   * @param absoluteChange variação absoluta (positiva)
   */
  accumulate(ticker: string, absoluteChange: number): void {
    const current = this.dailyAccumulator.get(ticker) ?? 0
    const next = current + Math.abs(absoluteChange)
    this.dailyAccumulator.set(ticker, next)

    if (next >= DAILY_VOL_CAP && !this.capReached.has(ticker)) {
      this.capReached.add(ticker)
      console.info(`[DailyVolCap] Cap atingido para ${ticker}: ${(next * 100).toFixed(2)}%`)
    }
  }

  /**
   * Aplica redução de delta se o cap foi atingido
   * @returns delta ajustado
   */
  apply(ticker: string, delta: number): number {
    if (!this.capReached.has(ticker)) return delta
    return delta * DELTA_REDUCTION_FACTOR
  }

  /** Verifica se o cap está ativo para um ativo */
  isCapActive(ticker: string): boolean {
    return this.capReached.has(ticker)
  }

  /** Volatilidade acumulada no dia */
  getDailyVol(ticker: string): number {
    return this.dailyAccumulator.get(ticker) ?? 0
  }

  /** Reset no início de cada nova sessão de negociação */
  reset(ticker?: string): void {
    if (ticker) {
      this.dailyAccumulator.delete(ticker)
      this.capReached.delete(ticker)
    } else {
      this.dailyAccumulator.clear()
      this.capReached.clear()
    }
  }
}
