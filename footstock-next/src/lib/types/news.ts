// ============================================================================
// Foot Stock — News Types
// ============================================================================

export interface NewsInjectEvent {
  ticker: string
  title: string
  sentiment: number
  impactCategory: string
  source?: string
  durationTicks: number
}
