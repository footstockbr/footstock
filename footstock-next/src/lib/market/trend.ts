export type TrendDirection = 'up' | 'stable' | 'down'

const EPSILON = 0.0001

/**
 * Classifica a variação percentual em tendência de mercado.
 * Usa epsilon para evitar que valores muito próximos de zero flutuem
 * entre alta/baixa por arredondamento.
 */
export function classifyTrend(change24h: number): TrendDirection {
  if (change24h > EPSILON) return 'up'
  if (change24h < -EPSILON) return 'down'
  return 'stable'
}

export const TREND_LABELS: Record<TrendDirection, string> = {
  up: 'Em alta',
  stable: 'Estável',
  down: 'Em baixa',
}

export const TREND_SENTIMENT_MAP: Record<TrendDirection, 'BULLISH' | 'NEUTRAL' | 'BEARISH'> = {
  up: 'BULLISH',
  stable: 'NEUTRAL',
  down: 'BEARISH',
}
