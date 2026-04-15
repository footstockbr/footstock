// L11_DailyVolCap — Cap de volatilidade diária acumulada de 2.5%
// Aplicado após L8_VelocityCap e antes de L10_Correlation.
// Reset a cada transição para sessão PRE_OPENING (início do dia de negociação).

const DAILY_VOL_CAP = 0.025 // 2.5% acumulado no dia
const DELTA_REDUCTION_FACTOR = 0.20 // reduz delta a 20% quando cap atingido

export class L11_DailyVolCap {
  private dailyAccumulator: Map<string, number> = new Map()
  private capReached: Set<string> = new Set()

  /**
   * Registra variação percentual acumulada do ativo.
   * @param ticker    Símbolo do ativo
   * @param deltaFrac Variação fracional (|cappedDelta| / currentPrice)
   */
  accumulate(ticker: string, deltaFrac: number): void {
    const current = this.dailyAccumulator.get(ticker) ?? 0
    const next = current + Math.abs(deltaFrac)
    this.dailyAccumulator.set(ticker, next)

    if (next >= DAILY_VOL_CAP && !this.capReached.has(ticker)) {
      this.capReached.add(ticker)
    }
  }

  /**
   * Aplica redução de delta se o cap diário foi atingido.
   * @returns delta ajustado (FS$)
   */
  apply(ticker: string, delta: number): number {
    if (!this.capReached.has(ticker)) return delta
    return delta * DELTA_REDUCTION_FACTOR
  }

  /** Verifica se o cap está ativo para um ativo. */
  isCapActive(ticker: string): boolean {
    return this.capReached.has(ticker)
  }

  /** Volatilidade acumulada percentual no dia (0–1 scale). */
  getDailyVol(ticker: string): number {
    return this.dailyAccumulator.get(ticker) ?? 0
  }

  /** Reset no início de cada nova sessão PRE_OPENING. */
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
