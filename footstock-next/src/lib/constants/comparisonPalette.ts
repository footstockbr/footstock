// ============================================================================
// Foot Stock — Paleta alternativa para modo comparação
// 8 cores perceptualmente distintas usadas quando cores de clubes colidem
// ============================================================================

export const COMPARISON_FALLBACK_PALETTE = [
  '#F59E0B', // âmbar
  '#06B6D4', // ciano
  '#8B5CF6', // violeta
  '#EC4899', // rosa
  '#10B981', // esmeralda
  '#F97316', // laranja
  '#3B82F6', // azul
  '#EF4444', // vermelho
] as const

/** Distância mínima perceptual (CIEDE2000 simplificado) para considerar colisão */
export const COLOR_COLLISION_THRESHOLD = 25

/** Máximo de ativos em modo comparação (base + 3 secundários) */
export const MAX_COMPARISON_ASSETS = 4
