// ============================================================================
// Foot Stock — Types específicos do módulo de Mercado (module-9)
// ============================================================================

import type { Division, Sentiment } from '@/lib/enums'

/** Filtros de listagem do mercado */
export interface AssetFilters {
  division?: Division
  sentiment?: Sentiment
  sort?: 'price' | 'change' | 'volume'
  search?: string
}

/** Parâmetros de paginação */
export interface PaginationParams {
  page: number
  limit: number
}

/** Tick de preço recebido via SSE (canal Redis market:tick) */
export interface MarketTickData {
  ticker: string
  price: number
  change24h: number
  volume: number
  bid: number
  ask: number
  spread: number
  sentiment: Sentiment
  timestamp: number
  halted?: boolean
}

/** Resposta paginada da API GET /api/v1/assets */
export interface AssetApiResponse {
  data: AssetListItem[]
  total: number
  page: number
  limit: number
  _delaySeconds: number
  _cacheHint: string
}

/** Resumo de ativo para listagem de mercado */
export interface AssetListItem {
  id: string
  ticker: string
  name: string
  division: Division
  currentPrice: number
  change24h: number
  volume24h: number
  isHalted: boolean
  haltReason: string | null
  sentiment: Sentiment
  logoUrl: string | null
  colorPrimary: string
  colorSecondary: string
  priceHistory: number[]
}
