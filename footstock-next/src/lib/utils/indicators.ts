export interface Candle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface IndicatorPoint {
  timestamp: number
  value: number
}

export interface BollingerPoint {
  timestamp: number
  middle: number
  upper: number
  lower: number
}

// Simple Moving Average
export function calcSMA(candles: Candle[], period: number): IndicatorPoint[] {
  if (candles.length < period) return []
  const result: IndicatorPoint[] = []
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1)
    const sum = slice.reduce((acc, c) => acc + c.close, 0)
    result.push({ timestamp: candles[i].timestamp, value: sum / period })
  }
  return result
}

// Exponential Moving Average
export function calcEMA(candles: Candle[], period: number): IndicatorPoint[] {
  if (candles.length < period) return []
  const k = 2 / (period + 1)
  const result: IndicatorPoint[] = []

  // seed with SMA of first `period` candles
  const seedSlice = candles.slice(0, period)
  const seedSum = seedSlice.reduce((acc, c) => acc + c.close, 0)
  let ema = seedSum / period
  result.push({ timestamp: candles[period - 1].timestamp, value: ema })

  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k)
    result.push({ timestamp: candles[i].timestamp, value: ema })
  }
  return result
}

// Bollinger Bands (default period=20, stdDevMultiplier=2)
export function calcBollingerBands(
  candles: Candle[],
  period = 20,
  stdDevMultiplier = 2
): BollingerPoint[] {
  if (candles.length < period) return []
  const result: BollingerPoint[] = []
  for (let i = period - 1; i < candles.length; i++) {
    const slice = candles.slice(i - period + 1, i + 1)
    const closes = slice.map((c) => c.close)
    const mean = closes.reduce((a, b) => a + b, 0) / period
    const variance = closes.reduce((a, b) => a + (b - mean) ** 2, 0) / period
    const stdDev = Math.sqrt(variance)
    result.push({
      timestamp: candles[i].timestamp,
      middle: mean,
      upper: mean + stdDevMultiplier * stdDev,
      lower: mean - stdDevMultiplier * stdDev,
    })
  }
  return result
}

// Aliases
export const calcMM9 = (candles: Candle[]): IndicatorPoint[] => calcSMA(candles, 9)
export const calcMM21 = (candles: Candle[]): IndicatorPoint[] => calcSMA(candles, 21)
