// ============================================================================
// Foot Stock — Market Types
// ============================================================================

export interface AssetListItem {
  id: string
  ticker: string
  displayName: string
  currentPrice: number
  change?: number
  changePercent?: number
  isHalted?: boolean
  division?: string
  sentiment?: string
}
