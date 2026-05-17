// ============================================================================
// Foot Stock Motor — Nudge constants
// Decisao I7: garantir que nenhum ativo fique mais de 5 minutos sem variar.
// Apos NUDGE_TICKS ticks consecutivos sem mudanca de preco, injeta micro-choque
// de NUDGE_DELTA na direcao do fairValue. Reseta contador a cada movimento real.
// ============================================================================

// 150 ticks × 2s/tick = 300s = 5 minutos sem variacao -> dispara nudge.
export const NUDGE_TICKS = 150

// Magnitude do micro-choque: ±0.01 (porte do legacy FootStock-new2.jsx L1167-L1170).
export const NUDGE_DELTA = 0.01

// Preco minimo do motor — deve ser menor que o menor IPO B_ILLIQ (ABT4 = 2.65).
export const NUDGE_MIN_PRICE = 1.0
