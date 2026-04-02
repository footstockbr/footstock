// ============================================================================
// Foot Stock (Next.js) — Contrato de injeção de notícias
// Cópia dos helpers do motor para uso no Next.js (sem import cross-process).
// Rastreabilidade: INT-046, INT-047
// ============================================================================

/** @deprecated Impact agora vem do ImpactCategory classificado, não do sentimento */
export function sentimentToImpact(sentiment: number): 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' {
  if (sentiment > 0.1) return 'POSITIVE'
  if (sentiment < -0.1) return 'NEGATIVE'
  return 'NEUTRAL'
}

/** Duração do impacto em ticks baseada no sentiment */
export function sentimentToDurationTicks(sentiment: number): number {
  return Math.max(1, Math.min(10, Math.round(Math.abs(sentiment) * 5)))
}
