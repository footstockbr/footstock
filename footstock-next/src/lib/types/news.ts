// ============================================================================
// FootStock — News Types
// ============================================================================

export interface NewsInjectEvent {
  type?: 'NEWS'
  assetId?: string
  newsId?: string
  ticker: string
  title: string
  sentiment: number
  impactCategory: string
  source?: string
  publishedAt?: string
  correlationId?: string
  durationTicks: number
  curveType?: 'canonical' | 'parameterized'
}
