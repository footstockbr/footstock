// ============================================================================
// Foot Stock — Indicadores Técnicos (pure functions, zero external deps)
// ============================================================================

export interface Candle {
  open: number
  high: number
  low: number
  close: number
  volume: number
  timestamp: number
}

export interface IndicatorPoint {
  timestamp: number
  value: number
}

export interface BollingerBand {
  timestamp: number
  upper: number
  middle: number
  lower: number
}

// ---------------------------------------------------------------------------
// SMA — Simple Moving Average
// ---------------------------------------------------------------------------

/**
 * Calcula a Média Móvel Simples (SMA) para um conjunto de candles.
 * Retorna array vazio se candles.length < period.
 *
 * @param candles  - Candles em ordem cronológica (mais antigo primeiro)
 * @param period   - Número de períodos da janela
 */
export function calcSMA(candles: Candle[], period: number): IndicatorPoint[] {
  if (period <= 0 || candles.length < period) return []

  const result: IndicatorPoint[] = []

  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0
    for (let j = i - (period - 1); j <= i; j++) {
      sum += candles[j]!.close
    }
    result.push({
      timestamp: candles[i]!.timestamp,
      value: sum / period,
    })
  }

  return result
}

// ---------------------------------------------------------------------------
// Bollinger Bands
// ---------------------------------------------------------------------------

/**
 * Calcula as Bandas de Bollinger.
 * Middle = SMA(period), Upper = middle + stdDev * σ, Lower = middle - stdDev * σ
 *
 * @param candles  - Candles em ordem cronológica (mais antigo primeiro)
 * @param period   - Janela da SMA (padrão 20)
 * @param stdDev   - Multiplicador do desvio padrão (padrão 2)
 */
export function calcBollinger(
  candles: Candle[],
  period = 20,
  stdDev = 2
): BollingerBand[] {
  if (period <= 0 || candles.length < period) return []

  const result: BollingerBand[] = []

  for (let i = period - 1; i < candles.length; i++) {
    const window: number[] = []
    for (let j = i - (period - 1); j <= i; j++) {
      window.push(candles[j]!.close)
    }

    const mean = window.reduce((acc, v) => acc + v, 0) / period

    const variance = window.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / period
    const sigma = Math.sqrt(variance)

    result.push({
      timestamp: candles[i]!.timestamp,
      upper: mean + stdDev * sigma,
      middle: mean,
      lower: mean - stdDev * sigma,
    })
  }

  return result
}
