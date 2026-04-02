// ============================================================================
// Foot Stock — Types: Notícias e contratos Redis
// Rastreabilidade: INT-046, INT-047
// ============================================================================

/** Evento publicado no canal Redis news:inject (consumido pelo motor module-14) */
/** INTAKE canônico: 6 categorias de impacto com magnitude pré-definida */
export type ImpactCategory =
  | 'FINANCEIRA_CRITICA'      // +/-5%
  | 'ESPORTIVA_MAJORITARIA'   // +/-3%
  | 'MERCADO_ATIVOS'          // +/-2%
  | 'INTEGRIDADE_SAUDE'       // +/-1.5%
  | 'INSTITUCIONAL'           // +/-1%
  | 'ESPORTIVA_MENOR'         // +/-0.5%

export const IMPACT_MAGNITUDE: Record<ImpactCategory, number> = {
  FINANCEIRA_CRITICA: 0.05,
  ESPORTIVA_MAJORITARIA: 0.03,
  MERCADO_ATIVOS: 0.02,
  INTEGRIDADE_SAUDE: 0.015,
  INSTITUCIONAL: 0.01,
  ESPORTIVA_MENOR: 0.005,
}

export interface NewsInjectEvent {
  type: 'NEWS'
  assetId: string
  impact: ImpactCategory
  magnitude: number        // derivado de IMPACT_MAGNITUDE[category]
  durationTicks: number
}

/** Registro de notícia retornado pela API (GET /api/v1/news) */
export interface NewsRecord {
  id: string
  title: string
  content: string
  impact: string
  sentiment: string        // Sentiment enum: BULLISH | BEARISH | NEUTRAL
  assetIds: string[]
  source: string | null
  isPublished: boolean
  publishedAt: string | null
}
