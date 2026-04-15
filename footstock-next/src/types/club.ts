// ============================================================================
// Foot Stock — Club Portal Types
// Rastreabilidade: INT-084, US-025, US-036, TASK-015, module-25-club-portal
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
  // TASK-015 KPIs adicionais
  currentPrice: number
  priceChange24h: number         // variação percentual nas últimas 24h
  sentimentScore: number         // -1.0 a +1.0 (mapeado de BULLISH/BEARISH/NEUTRAL)
  leagueEngagement: number       // torcedores do clube em ligas ativas
  totalShares: number            // total de ações em circulação
  topHolderPercentage: number    // percentual do maior holder individual (0-100)
}

export interface ClubDashboardHistory {
  period: string
  fansByPlan: { month: string; jogador: number; craque: number; lenda: number }[]
  priceHistory: { date: string; price: number }[]
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
