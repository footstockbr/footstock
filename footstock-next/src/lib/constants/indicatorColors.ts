// ============================================================================
// Foot Stock — Cores canônicas dos indicadores técnicos
// Fonte: FDD ui-mercado-ativos, USER-STORIES US-013, TASK-011
// ============================================================================

/** MM9 — Média Móvel 9 periodos (Lenda only) */
export const INDICATOR_MM9_COLOR = '#F59E0B' as const

/** MM21 — Média Móvel 21 periodos (Lenda only) */
export const INDICATOR_MM21_COLOR = '#D97706' as const

/** Bollinger Bands — cor ciano (todos os planos) */
export const INDICATOR_BOLLINGER_COLOR = '#06B6D4' as const

/** OFI positivo */
export const INDICATOR_OFI_POSITIVE_COLOR = '#F0B90B' as const

/** OFI negativo */
export const INDICATOR_OFI_NEGATIVE_COLOR = '#F6465D' as const

/** Volume positivo (candle de alta) */
export const INDICATOR_VOLUME_UP_COLOR = 'rgba(46,189,133,0.4)' as const

/** Volume negativo (candle de baixa) */
export const INDICATOR_VOLUME_DOWN_COLOR = 'rgba(246,70,93,0.4)' as const

/** Mapa consolidado para referência programática */
export const INDICATOR_COLORS = {
  MM9: INDICATOR_MM9_COLOR,
  MM21: INDICATOR_MM21_COLOR,
  BOLLINGER: INDICATOR_BOLLINGER_COLOR,
  OFI_POSITIVE: INDICATOR_OFI_POSITIVE_COLOR,
  OFI_NEGATIVE: INDICATOR_OFI_NEGATIVE_COLOR,
  VOLUME_UP: INDICATOR_VOLUME_UP_COLOR,
  VOLUME_DOWN: INDICATOR_VOLUME_DOWN_COLOR,
} as const
