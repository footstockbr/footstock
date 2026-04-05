// ============================================================================
// Foot Stock — Club Portal Types
// Rastreabilidade: INT-084, US-025, US-036, module-25-club-portal
// ============================================================================

export interface FansByPlan {
  JOGADOR: number
  CRAQUE: number
  LENDA: number
}

export interface MonthlyGrowthEntry {
  month: string   // formato YYYY-MM
  newFans: number
}

export interface TopPosition {
  quantityRank: number
  quantity: number
  anonymous: true
}

export interface ClubMetricsData {
  clubId: string
  totalFans: number
  fansByPlan: FansByPlan
  totalFsMovimentado: number
  avgPortfolioValue: number
  topPositions: TopPosition[]
  monthlyGrowth: MonthlyGrowthEntry[]
  leagueParticipation: number
}

export interface AffiliateConversion {
  date: string
  planType: 'JOGADOR' | 'CRAQUE' | 'LENDA'
  commissionFS: number
  status: 'PENDING' | 'PROCESSING' | 'PAID'
}

export interface AffiliateMetrics {
  affiliateCode: string
  referralLink: string
  totalSignups: number
  paidConversions: number
  totalCommissionFS: number
  commissionPct: number
  conversions: AffiliateConversion[]
}
