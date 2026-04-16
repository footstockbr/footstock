// ============================================================================
// FootStock — NewsInjectContract
// Mapeia sentiment para duração de ticks do efeito da notícia.
// ============================================================================

import type { NewsSentimentLevel } from '@/lib/enums'

const SENTIMENT_DURATION_MAP: Record<string, number> = {
  MUITO_POSITIVO: 10,
  POSITIVO: 6,
  NEUTRO: 3,
  NEGATIVO: 6,
  MUITO_NEGATIVO: 10,
}

export function sentimentToDurationTicks(sentiment: NewsSentimentLevel | string): number {
  return SENTIMENT_DURATION_MAP[String(sentiment)] ?? 3
}
